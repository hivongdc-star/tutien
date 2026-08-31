const { randomInt } = require("crypto");
const { EmbedBuilder } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { addLT } = require("../utils/currency");
const { addXp } = require("../utils/xp");
const { ensurePetShape, applyPetIdle, feedPetFromFish } = require("./pet");
const FISH_DB = require("../data/fish_db.json");

const FISH_BY_ID = Object.fromEntries(FISH_DB.map((f) => [f.id, f]));
const COOLDOWN_MS = 5_000;
const cooldown = new Map();
const RARITY_META = {
  "thường": { label: "Phàm", color: 0x9AA0A6, mul: 1.0 },
  "khá": { label: "Linh", color: 0x2ECC71, mul: 1.25 },
  "hiếm": { label: "Huyền", color: 0x3498DB, mul: 1.6 },
  "cực hiếm": { label: "Địa", color: 0x9B59B6, mul: 2.25 },
  "truyền thuyết": { label: "Thiên", color: 0xF1C40F, mul: 3.0 },
  "tiên phẩm": { label: "Tiên", color: 0xE74C3C, mul: 4.0 },
  "phàm": { label: "Phàm", color: 0x9AA0A6, mul: 1.0 },
  "linh": { label: "Linh", color: 0x2ECC71, mul: 1.25 },
  "hoàng": { label: "Hoàng", color: 0x1ABC9C, mul: 1.45 },
  "huyền": { label: "Huyền", color: 0x3498DB, mul: 1.6 },
  "địa": { label: "Địa", color: 0x9B59B6, mul: 2.25 },
  "thiên": { label: "Thiên", color: 0xF1C40F, mul: 3.0 },
  "tiên": { label: "Tiên", color: 0xE74C3C, mul: 4.0 },
};

function inferBagRarities(db) {
  const set = new Set(db.map((f) => String(f?.rarity || "").toLowerCase()));
  if (set.has("thiên") || set.has("tiên")) return new Set(["thiên", "tiên"].filter((x) => set.has(x)));
  if (set.has("truyền thuyết") || set.has("tiên phẩm")) return new Set(["truyền thuyết", "tiên phẩm"].filter((x) => set.has(x)));
  const order = ["phàm", "thường", "linh", "khá", "hoàng", "hiếm", "huyền", "cực hiếm", "địa", "truyền thuyết", "thiên phẩm", "thiên", "tiên phẩm", "tiên", "thần phẩm"];
  const present = order.filter((x) => set.has(x));
  return new Set(present.slice(-2));
}
const BAG_RARITIES = inferBagRarities(FISH_DB);

function spotText(key) {
  if (key === "song") return "Bến Lăng Ngư";
  if (key === "ho") return "Hàn Đàm";
  return "Hải Nhai";
}
function calcReward(baseLT, size, fish) {
  const meta = RARITY_META[String(fish.rarity || "").toLowerCase()] || RARITY_META["thường"];
  const min = fish.minSizeCm || 1;
  const max = Math.max(fish.maxSizeCm || 1, min + 1);
  const norm = Math.min(1, Math.max(0, (size - min) / (max - min)));
  return Math.max(1, Math.round(baseLT * (meta.mul || 1) * (0.85 + norm * 0.3)));
}
function fmt(n) { return Number(n || 0).toLocaleString("vi-VN"); }

const cau = {
  name: "cau",
  aliases: ["cauca", "fish"],
  description: "Câu cá kiếm LT + EXP. Dùng: -cau [song|ho|bien]",
  run: async (_client, msg, args) => {
    if (!FISH_DB.length) return msg.reply("❌ Thủy vực tạm thời chưa có linh ngư.");
    const users = loadUsers();
    if (!users[msg.author.id]) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để bắt đầu.");

    const now = Date.now();
    const remain = (cooldown.get(msg.author.id) || 0) + COOLDOWN_MS - now;
    if (remain > 0) return msg.reply(`⏳ Hãy chờ **${Math.ceil(remain / 1000)}s** rồi thả tiếp.`);

    const validSpots = ["song", "ho", "bien"];
    const arg = String(args?.[0] || "").toLowerCase();
    const spot = validSpots.includes(arg) ? arg : validSpots[randomInt(0, validSpots.length)];
    const pool = FISH_DB.filter((f) => (f.habitats || []).includes(spot));
    if (!pool.length) return msg.reply("❌ Bãi câu này hiện chưa có linh ngư phù hợp.");

    const sent = await msg.reply({ embeds: [new EmbedBuilder().setTitle("🎣 Thả Cần").setDescription(`Đạo hữu thả cần ở **${spotText(spot)}**.\nMặt nước khẽ động...`)] });
    setTimeout(async () => {
      try {
        const fish = pool[randomInt(0, pool.length)];
        const size = fish.minSizeCm && fish.maxSizeCm >= fish.minSizeCm ? randomInt(fish.minSizeCm, fish.maxSizeCm + 1) : 0;
        const ltFinal = calcReward(fish.baseLT || 8, size, fish);
        const xp = Math.max(5, Math.round(ltFinal / 3));
        const rarityKey = String(fish.rarity || "").toLowerCase();
        const willSave = BAG_RARITIES.has(rarityKey);

        if (willSave) { addLT(msg.author.id, ltFinal); addXp(msg.author.id, xp); }
        const all = loadUsers();
        const u = all[msg.author.id];
        if (!u) return;
        u.fishInventory = u.fishInventory || {};
        u.fishdex = u.fishdex || {};
        ensurePetShape(u);
        const tickRes = applyPetIdle(u, Date.now());
        let feedRes = null;

        if (willSave) u.fishInventory[fish.id] = (u.fishInventory[fish.id] || 0) + 1;
        else feedRes = feedPetFromFish(u, fish, size, xp);

        for (const id of Object.keys(u.fishInventory)) {
          const info = FISH_BY_ID[id];
          if (!info || !BAG_RARITIES.has(String(info.rarity || "").toLowerCase())) delete u.fishInventory[id];
        }
        if (!u.fishdex[fish.id]) u.fishdex[fish.id] = { count: 0, maxSize: 0 };
        u.fishdex[fish.id].count++;
        u.fishdex[fish.id].maxSize = Math.max(u.fishdex[fish.id].maxSize || 0, size);
        all[msg.author.id] = u;
        saveUsers(all);

        const meta = RARITY_META[rarityKey] || RARITY_META["thường"];
        const emb = new EmbedBuilder().setColor(meta.color).setTitle(`${fish.emoji || "🐟"} ${fish.name}`)
          .setDescription(`Đạo hữu câu được **${fish.name}** • **${meta.label} phẩm**${size ? ` • **${size} cm**` : ""}`);
        if (willSave) emb.addFields({ name: "🎁 Thu hoạch", value: `Đã cất vào kho cá.\n+ **${fmt(ltFinal)}** linh thạch • + **${fmt(xp)}** kinh nghiệm` });
        else emb.addFields({ name: "🐾 Linh thú", value: feedRes?.petId ? `Linh thú đã ăn cá: +**${fmt(feedRes.xpGain)}** XP` : feedRes?.buffered ? `Chưa có linh thú: giữ lại +**${fmt(feedRes.xpGain)}** XP` : "Không thể bồi dưỡng." });
        if (tickRes?.summary) {
          const s = tickRes.summary;
          emb.setFooter({ text: `Offline: ${s.ltGained ? `+${fmt(s.ltGained)} LT • ` : ""}${Object.keys(s.ores || {}).length} loại khoáng • ${Object.keys(s.shards || {}).length} loại mảnh` });
        } else emb.setFooter({ text: "Chờ 5 giây để câu lượt tiếp theo." });
        await sent.edit({ embeds: [emb], components: [] }).catch(() => {});
        cooldown.set(msg.author.id, Date.now());
      } catch (e) {
        console.error("cau error:", e);
        await sent.edit({ content: "⚠️ Lỗi khi câu cá.", embeds: [], components: [] }).catch(() => {});
      }
    }, randomInt(1500, 3501));
  },
};

const fishbag = {
  name: "fishbag",
  aliases: ["tuca", "kho", "cakho"],
  run: async (_client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo.");
    u.fishInventory = u.fishInventory || {};
    let changed = false;
    for (const id of Object.keys(u.fishInventory)) {
      const info = FISH_BY_ID[id];
      if (!info || !BAG_RARITIES.has(String(info.rarity || "").toLowerCase())) { delete u.fishInventory[id]; changed = true; }
    }
    if (changed) { users[msg.author.id] = u; saveUsers(users); }
    const items = Object.entries(u.fishInventory).filter(([, q]) => Number(q) > 0)
      .map(([id, count]) => ({ info: FISH_BY_ID[id] || { name: id, emoji: "🐟" }, count }));
    if (!items.length) return msg.reply("🐟 Kho cá hiện chưa có thu hoạch từ **Thiên phẩm** trở lên.");
    items.sort((a, b) => String(a.info.name).localeCompare(String(b.info.name), "vi"));
    return msg.reply({ embeds: [new EmbedBuilder().setTitle(`🎣 Kho Cá Quý của ${msg.author.username}`).setDescription(items.map((x) => `${x.info.emoji || "🐟"} **${x.info.name}** x${x.count}`).join("\n")).setColor("#F1C40F")] });
  },
};

const topfish = {
  name: "topfish",
  aliases: ["topcau", "topcanthu"],
  run: async (_client, msg) => {
    const users = loadUsers();
    const ranking = [];
    for (const [uid, u] of Object.entries(users)) {
      let total = 0;
      const src = u.fishdex || u.fishInventory || {};
      for (const id of Object.keys(src)) {
        const info = FISH_BY_ID[id];
        if (!info || !BAG_RARITIES.has(String(info.rarity || "").toLowerCase())) continue;
        total += Number(u.fishdex ? src[id]?.count : src[id]) || 0;
      }
      if (total > 0) ranking.push({ uid, total });
    }
    if (!ranking.length) return msg.reply("❌ Chưa ai bắt được cá **Thiên Phẩm** trở lên.");
    ranking.sort((a, b) => b.total - a.total);
    const lines = [];
    for (let i = 0; i < Math.min(10, ranking.length); i++) {
      const x = ranking[i];
      const member = await msg.guild.members.fetch(x.uid).catch(() => null);
      lines.push(`**${i + 1}. ${member?.displayName || x.uid}** • ${x.total} cá`);
    }
    return msg.reply({ embeds: [new EmbedBuilder().setTitle("🏆 TOP CẦN THỦ (Thiên Phẩm+)").setDescription(lines.join("\n")).setColor("#F1C40F")] });
  },
};

module.exports = { commands: [cau, fishbag, topfish] };
