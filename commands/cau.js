// commands/cau.js
// Câu cá (đã bỏ "thời cơ giật cần"), cá không save => tự động làm đồ ăn linh thú.

const { EmbedBuilder } = require("discord.js");
const { randomInt } = require("crypto");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

const { loadUsers, saveUsers } = require("../utils/storage");
const { addLT } = require("../utils/currency");
const { addXp } = require("../utils/xp");
const { ensurePetShape, applyPetIdle, feedPetFromFish } = require("../utils/petSystem");

// ====== Data cá ======
const FISH_TABLE = [
  { name: "Cá Trắm", rarity: "thường", baseLt: 3, baseXp: 8 },
  { name: "Cá Chép", rarity: "thường", baseLt: 3, baseXp: 8 },
  { name: "Cá Mè", rarity: "thường", baseLt: 2, baseXp: 6 },
  { name: "Cá Lóc", rarity: "khá", baseLt: 6, baseXp: 14 },
  { name: "Cá Rô Phi", rarity: "khá", baseLt: 6, baseXp: 14 },
  { name: "Cá Hồi", rarity: "hiếm", baseLt: 15, baseXp: 30 },
  { name: "Cá Ngừ", rarity: "hiếm", baseLt: 15, baseXp: 30 },
  { name: "Cá Mập", rarity: "cực hiếm", baseLt: 35, baseXp: 60 },
  { name: "Cá Rồng", rarity: "cực hiếm", baseLt: 40, baseXp: 70 },
  // Cá phẩm chất cao hơn (sẽ vào kho) — vẫn cộng LT/EXP cho người chơi
  { name: "Thiên Ngư", rarity: "thiên phẩm", baseLt: 120, baseXp: 160 },
  { name: "Tiên Linh Ngư", rarity: "tiên phẩm", baseLt: 220, baseXp: 260 },
  { name: "Thần Long Ngư", rarity: "thần phẩm", baseLt: 420, baseXp: 520 },
];

const BAG_RARITIES = new Set(["thiên phẩm", "tiên phẩm", "thần phẩm"]);

// Cân bằng (giữ như cũ): tăng nhẹ tỷ lệ gặp cá phẩm chất cao
const RARITY_PICK_MUL = {
  "thường": 1.0,
  "khá": 1.0,
  "hiếm": 1.0,
  "cực hiếm": 1.0,
  "thiên phẩm": 1.15,
  "tiên phẩm": 1.15,
  "thần phẩm": 1.15,
};

// Size
function randomFishSizeCm(rarity) {
  const r = String(rarity || "thường");
  if (r === "thường") return randomInt(15, 41);
  if (r === "khá") return randomInt(25, 61);
  if (r === "hiếm") return randomInt(40, 91);
  if (r === "cực hiếm") return randomInt(60, 151);
  if (r === "thiên phẩm") return randomInt(90, 221);
  if (r === "tiên phẩm") return randomInt(120, 301);
  if (r === "thần phẩm") return randomInt(180, 401);
  return randomInt(15, 41);
}

function weightedPickFish() {
  // base weights by rarity
  const rarityWeights = {
    "thường": 60,
    "khá": 24,
    "hiếm": 10,
    "cực hiếm": 4,
    "thiên phẩm": 1,
    "tiên phẩm": 0.7,
    "thần phẩm": 0.3,
  };

  const weights = FISH_TABLE.map((f) => {
    const w = rarityWeights[f.rarity] ?? 1;
    const mul = RARITY_PICK_MUL[f.rarity] ?? 1;
    return Math.max(0, w * mul);
  });

  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return FISH_TABLE[0];

  let r = randomInt(1, Math.floor(total) + 1);
  for (let i = 0; i < FISH_TABLE.length; i++) {
    r -= weights[i];
    if (r <= 0) return FISH_TABLE[i];
  }
  return FISH_TABLE[FISH_TABLE.length - 1];
}

function calcReward(fish, sizeCm) {
  const sizeMul = 1 + Math.min(0.75, Math.max(0, (sizeCm - 20) / 200));
  const lt = Math.max(0, Math.floor((fish.baseLt || 0) * sizeMul));
  const xp = Math.max(0, Math.floor((fish.baseXp || 0) * sizeMul));
  return { lt, xp };
}

function ensureFishStore(user) {
  if (!user) return;
  if (!user.fishdex || typeof user.fishdex !== "object") user.fishdex = {};
  if (!user.fishInventory || typeof user.fishInventory !== "object") user.fishInventory = {};
}

function cleanupFishInventory(user) {
  if (!user?.fishInventory) return;
  for (const k of Object.keys(user.fishInventory)) {
    if (!Number.isFinite(user.fishInventory[k]) || user.fishInventory[k] <= 0) delete user.fishInventory[k];
  }
}

const COOLDOWN_MS = 5_000;
const cooldowns = new Map();

const MIN_WAIT_MS = 1500;
const MAX_WAIT_MS = 3500;

module.exports = {
  name: "cau",
  aliases: ["fish"],
  run: async (client, msg, args = []) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    const now = Date.now();
    const last = cooldowns.get(msg.author.id) || 0;
    const remain = COOLDOWN_MS - (now - last);
    if (remain > 0) {
      return msg.reply(`⏳ Hãy chờ **${Math.ceil(remain / 1000)}s** rồi câu tiếp.`);
    }

    // khóa cooldown ngay để tránh spam nhiều lần
    cooldowns.set(msg.author.id, now);

    const spot = (args || []).join(" ").trim() || "bờ hồ";
    const waitMs = randomInt(MIN_WAIT_MS, MAX_WAIT_MS + 1);

    const baseEmbed = new EmbedBuilder()
      .setTitle("🎣 Câu cá")
      .setColor(0x3498db)
      .setDescription(`Bạn thả cần ở **${spot}**…\n⏳ Đang chờ cá cắn câu…`)
      .setFooter({ text: "(Đã bỏ cơ chế thời cơ giật cần)" });

    const sent = await msg.reply({ embeds: [baseEmbed] }).catch(() => null);
    if (!sent) return;

    setTimeout(async () => {
      try {
        const fish = weightedPickFish();
        const sizeCm = randomFishSizeCm(fish.rarity);
        const key = fish.name.toLowerCase();

        const willSave = BAG_RARITIES.has(fish.rarity);

        let ltGain = 0;
        let xpGain = 0;
        if (willSave) {
          const r = calcReward(fish, sizeCm);
          ltGain = r.lt;
          xpGain = r.xp;

          // cộng thưởng cho người chơi (cá save)
          if (ltGain > 0) addLT(msg.author.id, ltGain);
          if (xpGain > 0) addXp(msg.author.id, xpGain);
        }

        // cập nhật kho cá + dex + pet (lazy tick + feed)
        const all = loadUsers();
        const u2 = all[msg.author.id];
        if (!u2) return;

        ensureFishStore(u2);
        ensurePetShape(u2);

        // Lazy tick: chỉ gọi khi luồng có liên quan pet (câu cá)
        const tickRes = applyPetIdle(u2, Date.now());

        let feedRes = null;
        if (!willSave) {
          // cá không save => làm thức ăn linh thú, không cộng LT/EXP cho người chơi
          feedRes = feedPetFromFish(u2, fish, sizeCm);
        } else {
          // cá save => vào kho
          u2.fishInventory[key] = (u2.fishInventory[key] || 0) + 1;
        }

        // fishdex luôn ghi nhận
        const cur = u2.fishdex[key] || { name: fish.name, rarity: fish.rarity, count: 0, maxSize: 0 };
        cur.name = fish.name;
        cur.rarity = fish.rarity;
        cur.count = (cur.count || 0) + 1;
        cur.maxSize = Math.max(Number(cur.maxSize || 0), sizeCm);
        u2.fishdex[key] = cur;

        cleanupFishInventory(u2);

        all[msg.author.id] = u2;
        saveUsers(all);

        // ===== render kết quả =====
        const resEmbed = new EmbedBuilder()
          .setTitle("🎣 Thu hoạch")
          .setColor(willSave ? 0x2ecc71 : 0xf1c40f)
          .setDescription(
            `Bạn câu được **${fish.name}** (${fish.rarity})\n` +
              `📏 Kích thước: **${sizeCm} cm**` +
              (willSave ? `\n🎒 Đã cất vào **kho cá**.` : "\n🐾 Cá được linh thú hấp thụ ngay.")
          )
          .addFields(
            { name: "📍 Địa điểm", value: spot, inline: true },
            { name: "✨ Phẩm giai", value: fish.rarity, inline: true },
            { name: "📊 Thành tích", value: `Đã câu: **${cur.count}** • Max: **${cur.maxSize} cm**`, inline: false }
          );

        if (willSave) {
          resEmbed.addFields({ name: "🎁 Thưởng", value: `+${fmtLT(ltGain)} LT\n+${fmtLT(xpGain)} EXP`, inline: true });
        } else {
          const note = feedRes?.buffered
            ? `(+${fmtLT(feedRes.xpGain)} XP bị tồn đọng — equip linh thú để hấp thụ)`
            : feedRes?.petId
            ? `(+${fmtLT(feedRes.xpGain)} XP, +${feedRes.hungerGain} no)`
            : `(+${fmtLT(feedRes?.xpGain || 0)} XP)`;

          resEmbed.addFields({ name: "🍽️ Cho ăn", value: note, inline: false });
        }

        if (tickRes?.summary && tickRes.ticks > 0) {
          const s = tickRes.summary;
          const extra = [];
          if (s.ltGained) extra.push(`+${fmtLT(s.ltGained)} LT`);
          const oreKinds = Object.keys(s.ores || {}).length;
          if (oreKinds) extra.push(`+${oreKinds} loại khoáng`);
          const shardKinds = Object.keys(s.shards || {}).length;
          if (shardKinds) extra.push(`+${shardKinds} loại mảnh`);
          if (extra.length) resEmbed.setFooter({ text: `🐾 Offline tick: ${s.ticksApplied} tick • ${extra.join(" • ")}` });
        }

        await sent.edit({ embeds: [resEmbed], components: [] }).catch(() => {});
      } catch (err) {
        console.error("cau error:", err);
        try {
          await sent.edit({ content: "⚠️ Lỗi khi câu cá.", embeds: [], components: [] }).catch(() => {});
        } catch {}
      }
    }, waitMs);
  },
};
