// commands/cau.js
// Câu cá (khôi phục cơ chế cũ theo fish_db + fishId),
// đồng thời:
// - BỎ hoàn toàn "thời cơ giật cần" (không button)
// - Cá KHÔNG lưu kho (dưới Thiên/tiên tùy hệ rarity) => auto-feed pet, KHÔNG cộng LT/EXP cho người chơi

const path = require("path");
const { randomInt } = require("crypto");
const { EmbedBuilder } = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { addLT } = require("../utils/currency");
const { addXp } = require("../utils/xp");
const { ensurePetShape, applyPetIdle, feedPetFromFish } = require("../utils/petSystem");

// --- Load fish DB ---
let FISH_DB = [];
try {
  FISH_DB = require(path.join(__dirname, "../data/fish_db.json"));
  if (!Array.isArray(FISH_DB) || FISH_DB.length < 10) throw new Error("fish_db invalid");
} catch (e) {
  console.error("❌ Không thể tải data/fish_db.json:", e?.message || e);
  FISH_DB = [];
}

/** Pick weighted item (integer weights) */
function pickWeightedInt(list, weightField = "weight") {
  let total = 0;
  for (const it of list) total += Number(it?.[weightField] ?? 1);
  if (!Number.isFinite(total) || total <= 0) return list[0];

  // randomInt(min, max) => [min, max)
  let r = randomInt(1, total + 1); // 1..total
  for (const it of list) {
    r -= Number(it?.[weightField] ?? 1);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

const COOLDOWN_MS = 30_000;
const cooldown = new Map();

// 0,001% = 1 / 100.000
const TIEN_DENOM = 100_000;

// Hỗ trợ cả 2 kiểu rarity:
// - DB kiểu A: thường/khá/hiếm/cực hiếm/truyền thuyết/tiên phẩm (label hiển thị Phàm/Linh/..)
// - DB kiểu B: phàm/linh/hoàng/huyền/địa/thiên/tiên (nếu bạn dùng dạng này)
const RARITY_META = {
  // scheme A
  "thường": { label: "Phàm", icon: "⚪", color: 0x9AA0A6, mul: 1.0 },
  "khá": { label: "Linh", icon: "🟢", color: 0x2ECC71, mul: 1.25 },
  "hiếm": { label: "Huyền", icon: "🔵", color: 0x3498DB, mul: 1.6 },
  "cực hiếm": { label: "Địa", icon: "🟣", color: 0x9B59B6, mul: 2.25 },
  "truyền thuyết": { label: "Thiên", icon: "🟨", color: 0xF1C40F, mul: 3.0 },
  "tiên phẩm": { label: "Tiên", icon: "🔴", color: 0xE74C3C, mul: 4.0 },

  // scheme B (nếu rarity đã là tier)
  "phàm": { label: "Phàm", icon: "⚪", color: 0x9AA0A6, mul: 1.0 },
  "linh": { label: "Linh", icon: "🟢", color: 0x2ECC71, mul: 1.25 },
  "hoàng": { label: "Hoàng", icon: "🟦", color: 0x1ABC9C, mul: 1.45 },
  "huyền": { label: "Huyền", icon: "🔵", color: 0x3498DB, mul: 1.6 },
  "địa": { label: "Địa", icon: "🟣", color: 0x9B59B6, mul: 2.25 },
  "thiên": { label: "Thiên", icon: "🟨", color: 0xF1C40F, mul: 3.0 },
  "tiên": { label: "Tiên", icon: "🔴", color: 0xE74C3C, mul: 4.0 },
};

function inferBagRarities(db) {
  const set = new Set((db || []).map((f) => String(f?.rarity || "").toLowerCase()));

  // ưu tiên scheme B
  if (set.has("thiên") || set.has("tiên")) {
    const out = [];
    if (set.has("thiên")) out.push("thiên");
    if (set.has("tiên")) out.push("tiên");
    if (out.length) return new Set(out);
  }

  // scheme A (mặc định trong repo)
  if (set.has("truyền thuyết") || set.has("tiên phẩm")) {
    const out = [];
    if (set.has("truyền thuyết")) out.push("truyền thuyết");
    if (set.has("tiên phẩm")) out.push("tiên phẩm");
    if (out.length) return new Set(out);
  }

  // fallback: lấy 1-2 rarity hiếm nhất theo order biết trước
  const order = [
    "phàm",
    "thường",
    "linh",
    "khá",
    "hoàng",
    "hiếm",
    "huyền",
    "cực hiếm",
    "địa",
    "truyền thuyết",
    "thiên phẩm",
    "thiên",
    "tiên phẩm",
    "tiên",
    "thần phẩm",
  ];
  const present = order.filter((r) => set.has(r));
  if (present.length >= 2) return new Set(present.slice(-2));
  if (present.length === 1) return new Set(present);
  return new Set();
}

const BAG_RARITIES = inferBagRarities(FISH_DB);

// ultra tier key: dùng để roll 0,001% (ưu tiên tiên/tiên phẩm)
function inferUltraRarityKey(db) {
  const set = new Set((db || []).map((f) => String(f?.rarity || "").toLowerCase()));
  if (set.has("tiên")) return "tiên";
  if (set.has("tiên phẩm")) return "tiên phẩm";
  return null;
}
const ULTRA_RARITY_KEY = inferUltraRarityKey(FISH_DB);

// Map id -> fish info để dọn kho
const FISH_BY_ID = Object.create(null);
for (const f of FISH_DB) {
  if (f?.id) FISH_BY_ID[f.id] = f;
}

function spotText(spotKey) {
  if (spotKey === "song") return "bờ sông";
  if (spotKey === "ho") return "mặt hồ";
  return "bờ biển";
}

function spotLabel(spotKey) {
  if (spotKey === "song") return "Sông";
  if (spotKey === "ho") return "Hồ";
  return "Biển";
}

function calcReward(baseLT, size, fish) {
  const meta = RARITY_META[String(fish.rarity || "").toLowerCase()] || RARITY_META["thường"];
  const rarityMul = meta.mul || 1.0;

  // sizeMul: chuẩn hóa về [0,1] theo khoảng size, scale nhẹ ±15%
  const minS = fish.minSizeCm || 1;
  const maxS = Math.max(fish.maxSizeCm || 1, minS + 1);
  const norm = Math.min(1, Math.max(0, (size - minS) / (maxS - minS)));
  const sizeMul = 0.85 + norm * 0.3; // 0.85 → 1.15

  return Math.max(1, Math.round(baseLT * rarityMul * sizeMul));
}

function calcDuyenPhan(fish, totalWeightNormalPool) {
  const rarityKey = String(fish?.rarity || "").toLowerCase();
  if (ULTRA_RARITY_KEY && rarityKey === ULTRA_RARITY_KEY) {
    return "Thiên cơ khó lường ★☆☆☆☆ (0,001%)";
  }

  const w = Number(fish.weight ?? 1);
  const p = totalWeightNormalPool > 0 ? w / totalWeightNormalPool : 0;
  if (p > 0.12) return "Duyên dày ★★★★★";
  if (p > 0.07) return "Có duyên ★★★★☆";
  if (p > 0.03) return "Hơi khó gặp ★★★☆☆";
  if (p > 0.01) return "Hiếm gặp ★★☆☆☆";
  return "Thiên cơ khó lường ★☆☆☆☆";
}

function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

module.exports = {
  name: "cau",
  aliases: ["cauca", "fish"],
  description: "Câu cá kiếm LT + EXP. Dùng: -cau [song|ho|bien]",
  run: async (client, msg, args) => {
    if (!FISH_DB.length) {
      return msg.reply("❌ Thiếu dữ liệu cá (data/fish_db.json). Hãy khôi phục file này trong thư mục `data/`.");
    }

    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` để bắt đầu!");

    // cooldown
    const last = cooldown.get(msg.author.id) || 0;
    const now = Date.now();
    const remain = last + COOLDOWN_MS - now;
    if (remain > 0) {
      return msg.reply(`⏳ Hãy nghỉ tay **${Math.ceil(remain / 1000)}s** rồi câu tiếp nhé.`);
    }

    const arg = (args?.[0] || "").toLowerCase();
    const validSpots = ["song", "ho", "bien"];
    const spotKey = validSpots.includes(arg) ? arg : validSpots[randomInt(0, validSpots.length)];

    const poolAll = FISH_DB.filter((f) => (f.habitats || []).includes(spotKey));
    if (!poolAll.length) return msg.reply("❌ Data cá không có loài phù hợp bãi câu.");

    const waitMs = randomInt(1500, 3501); // 1.5–3.5s

    const baseEmbed = new EmbedBuilder()
      .setTitle("🎣 Thả câu")
      .setDescription(`Bạn thả cần ở **${spotText(spotKey)}**...\nMặt nước lặng như tờ...`)
      .setFooter({ text: "(Đã bỏ cơ chế thời cơ giật cần)" });

    const sent = await msg.reply({ embeds: [baseEmbed] }).catch(() => null);
    if (!sent) return;

    setTimeout(async () => {
      try {
        // ===== Chọn cá =====
        // Roll ultra tier (0,001%) trước nếu có
        const rollUltra = ULTRA_RARITY_KEY ? randomInt(0, TIEN_DENOM) === 0 : false;

        const poolUltra = ULTRA_RARITY_KEY
          ? poolAll.filter((f) => String(f.rarity || "").toLowerCase() === ULTRA_RARITY_KEY)
          : [];
        const poolNormal = ULTRA_RARITY_KEY
          ? poolAll.filter((f) => String(f.rarity || "").toLowerCase() !== ULTRA_RARITY_KEY)
          : poolAll;

        let fish;
        if (rollUltra && poolUltra.length) fish = pickWeightedInt(poolUltra, "weight");
        else fish = pickWeightedInt(poolNormal.length ? poolNormal : poolAll, "weight");

        // size
        const hasSize = fish.minSizeCm && fish.maxSizeCm && fish.maxSizeCm >= fish.minSizeCm;
        const size = hasSize ? randomInt(fish.minSizeCm, fish.maxSizeCm + 1) : 0;

        // thưởng cơ bản như cũ
        const baseLT = fish.baseLT || 8;
        const ltFinal = Math.max(1, calcReward(baseLT, size, fish));
        const xp = Math.max(5, Math.round(ltFinal / 3));

        const rarityKey = String(fish.rarity || "").toLowerCase();
        const willSave = BAG_RARITIES.has(rarityKey);

        // ===== Ghi thưởng/Feed =====
        if (willSave) {
          // cá lưu kho => vẫn cộng LT/EXP cho người chơi
          addLT(msg.author.id, ltFinal);
          addXp(msg.author.id, xp);
        }

        // Reload user mới nhất trước khi ghi fish/pet để tránh rollback do addLT/addXp
        const all = loadUsers();
        const u2 = all[msg.author.id];
        if (!u2) return;

        // ensure stores
        if (!u2.fishInventory) u2.fishInventory = {};
        if (!u2.fishdex) u2.fishdex = {};

        // pet lazy tick + feed (chỉ khi không save)
        ensurePetShape(u2);
        const tickRes = applyPetIdle(u2, Date.now());
        let feedRes = null;

        const fishId = fish.id;
        if (willSave) {
          u2.fishInventory[fishId] = (u2.fishInventory[fishId] || 0) + 1;
        } else {
          // cá không save => thức ăn pet, không cộng LT/EXP user
          feedRes = feedPetFromFish(u2, fish, size, xp);
        }

        // Dọn kho: loại bỏ cá dưới ngưỡng lưu kho
        if (u2.fishInventory && Object.keys(u2.fishInventory).length) {
          for (const id of Object.keys(u2.fishInventory)) {
            const info = FISH_BY_ID[id];
            const rk = String(info?.rarity || "").toLowerCase();
            if (!info || !BAG_RARITIES.has(rk)) delete u2.fishInventory[id];
          }
        }

        // fishdex luôn ghi nhận theo fishId (để không mất số cá cũ)
        if (!u2.fishdex[fishId]) u2.fishdex[fishId] = { count: 0, maxSize: 0 };
        u2.fishdex[fishId].count += 1;
        if (size > (u2.fishdex[fishId].maxSize || 0)) u2.fishdex[fishId].maxSize = size;

        all[msg.author.id] = u2;
        saveUsers(all);

        // ===== Render =====
        const meta = RARITY_META[rarityKey] || RARITY_META["thường"];
        const duyenPhan = calcDuyenPhan(
          fish,
          poolNormal.reduce((s, it) => s + Number(it.weight ?? 1), 0)
        );

        const resEmbed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`${meta.icon} ${fish.emoji || "🐟"} ${fish.name}`)
          .setDescription("Sóng nước khẽ động…")
          .addFields(
            { name: "Phẩm giai", value: `${meta.label}`, inline: true },
            { name: "Duyên phận", value: duyenPhan, inline: true },
            { name: "Thủy vực", value: spotLabel(spotKey), inline: true },
            { name: "Kích cỡ", value: size ? `${size} cm` : "—", inline: true }
          );

        if (willSave) {
          resEmbed.addFields({ name: "Thu hoạch", value: `+${fmt(ltFinal)} LT · +${fmt(xp)} EXP`, inline: true });
          resEmbed.addFields({ name: "Kho cá", value: "✅ Đã lưu (ngưỡng Thiên/tiên)", inline: true });
        } else {
          const petNote = feedRes?.buffered
            ? `+${fmt(feedRes.xpGain)} XP (tồn đọng — equip linh thú để hấp thụ)`
            : feedRes?.petId
            ? `+${fmt(feedRes.xpGain)} XP · +${feedRes.hungerGain} no`
            : `+${fmt(feedRes?.xpGain || 0)} XP`;
          resEmbed.addFields({ name: "🐾 Linh thú hấp thụ", value: petNote, inline: false });
          resEmbed.addFields({ name: "Thu hoạch", value: "Không cộng LT/EXP cho người chơi", inline: true });
        }

        if (tickRes?.summary && tickRes.ticks > 0) {
          const s = tickRes.summary;
          const extra = [];
          if (s.ltGained) extra.push(`+${fmt(s.ltGained)} LT`);
          const oreKinds = Object.keys(s.ores || {}).length;
          if (oreKinds) extra.push(`+${oreKinds} loại khoáng`);
          const shardKinds = Object.keys(s.shards || {}).length;
          if (shardKinds) extra.push(`+${shardKinds} loại mảnh`);
          if (extra.length) resEmbed.setFooter({ text: `🐾 Offline tick: ${s.ticksApplied} tick • ${extra.join(" • ")}` });
        } else {
          resEmbed.setFooter({ text: "Cooldown 30s • (Đã bỏ thời cơ giật cần)" });
        }

        await sent.edit({ embeds: [resEmbed], components: [] }).catch(() => {});
        cooldown.set(msg.author.id, Date.now());
      } catch (e) {
        console.error("cau error:", e);
        await sent.edit({ content: "⚠️ Lỗi khi câu cá.", embeds: [], components: [] }).catch(() => {});
      }
    }, waitMs);
  },
};
