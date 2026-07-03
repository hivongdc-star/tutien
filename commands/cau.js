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

const COOLDOWN_MS = 5_000;
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
  if (spotKey === "song") return "Bến Lăng Ngư";
  if (spotKey === "ho") return "Hàn Đàm";
  return "Hải Nhai";
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
      return msg.reply("❌ Thủy vực tạm thời chưa có linh ngư. Hãy báo quản sự kiểm tra.");
    }

    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để bắt đầu.");

    // cooldown
    const last = cooldown.get(msg.author.id) || 0;
    const now = Date.now();
    const remain = last + COOLDOWN_MS - now;
    if (remain > 0) {
      return msg.reply(`⏳ Cần câu còn vương linh tức. Hãy chờ **${Math.ceil(remain / 1000)}s** rồi thả tiếp.`);
    }

    const arg = (args?.[0] || "").toLowerCase();
    const validSpots = ["song", "ho", "bien"];
    const spotKey = validSpots.includes(arg) ? arg : validSpots[randomInt(0, validSpots.length)];

    const poolAll = FISH_DB.filter((f) => (f.habitats || []).includes(spotKey));
    if (!poolAll.length) return msg.reply("❌ Bãi câu này hiện chưa có linh ngư phù hợp.");

    const waitMs = randomInt(1500, 3501); // 1.5–3.5s

    const baseEmbed = new EmbedBuilder()
      .setTitle("🎣 Thả Cần")
      .setDescription(`Đạo hữu thả cần ở **${spotText(spotKey)}**.
Mặt nước khẽ động, chờ thời khắc thu lưới...`);

    const sent = await msg.reply({ embeds: [baseEmbed] }).catch(() => null);
    if (!sent) return;

    setTimeout(async () => {
      try {        // ===== Chọn cá =====
        // Tất cả cá hợp lệ trong cùng bãi có xác suất như nhau.
        const fish = poolAll[randomInt(0, poolAll.length)];

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
        const rarityText = `${meta.label} phẩm`;
        const resEmbed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`${fish.emoji || "🐟"} ${fish.name}`)
          .setDescription(`Đạo hữu thả cần ở **${spotText(spotKey)}** và câu được:

**${fish.name}** • **${rarityText}**${size ? ` • **${size} cm**` : ""}`);

        if (willSave) {
          resEmbed.addFields({
            name: "🎁 Thu hoạch",
            value: `Đã cất vào kho cá.
+ **${fmt(ltFinal)}** linh thạch • + **${fmt(xp)}** kinh nghiệm`,
            inline: false,
          });
        } else {
          let petFieldValue;
          if (feedRes?.petId) {
            petFieldValue = `Linh thú đã ăn phần thu hoạch này.
+ **${fmt(feedRes.xpGain)}** kinh nghiệm linh thú`;
          } else if (feedRes?.buffered) {
            petFieldValue = `Đạo hữu chưa có linh thú đồng hành.
Tinh hoa từ mẻ cá này đã được giữ lại: + **${fmt(feedRes.xpGain)}** XP chờ dùng`;
          } else {
            petFieldValue = `Phần thu hoạch này chưa thể dùng để bồi dưỡng linh thú.`;
          }
          resEmbed.addFields({
            name: "🐾 Linh thú đồng hành",
            value: petFieldValue,
            inline: false,
          });
        }

        if (tickRes?.summary && tickRes.ticks > 0) {
          const s = tickRes.summary;
          const extra = [];
          if (s.ltGained) extra.push(`+${fmt(s.ltGained)} linh thạch`);
          const oreKinds = Object.keys(s.ores || {}).length;
          if (oreKinds) extra.push(`+${oreKinds} loại khoáng`);
          const shardKinds = Object.keys(s.shards || {}).length;
          if (shardKinds) extra.push(`+${shardKinds} loại mảnh`);
          if (extra.length) {
            resEmbed.setFooter({ text: `Thu hoạch khi vắng mặt: ${extra.join(" • ")}` });
          } else {
            resEmbed.setFooter({ text: "Chờ 5 giây để câu lượt tiếp theo." });
          }
        } else {
          resEmbed.setFooter({ text: "Chờ 5 giây để câu lượt tiếp theo." });
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
