const { EmbedBuilder } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const FISH_DB = require("../data/fish_db.json");

const idMap = Object.fromEntries(FISH_DB.map((f) => [f.id, f]));
const BAG_RARITIES = new Set(["truyền thuyết", "tiên phẩm"]);

const fishbag = {
  name: "fishbag",
  aliases: ["tuca", "kho", "cakho"],
  description: "Xem ngư phổ linh ngư đã câu",
  run: async (_client, msg) => {
    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    if (!me.fishInventory || Object.keys(me.fishInventory).length === 0) {
      return msg.reply("🐟 Kho cá hiện chưa có thu hoạch từ **Thiên phẩm** trở lên.");
    }

    let changed = false;
    for (const id of Object.keys(me.fishInventory)) {
      const info = idMap[id];
      if (!info || !BAG_RARITIES.has(info.rarity)) {
        delete me.fishInventory[id];
        changed = true;
      }
    }
    if (changed) {
      users[msg.author.id] = me;
      saveUsers(users);
    }
    if (Object.keys(me.fishInventory).length === 0) {
      return msg.reply("🐟 Kho cá hiện chưa có thu hoạch từ **Thiên phẩm** trở lên.");
    }

    const items = Object.keys(me.fishInventory)
      .map((id) => ({ id, count: me.fishInventory[id], info: idMap[id] || { id, name: id, emoji: "🐟", rarity: "thường" } }))
      .sort((a, b) => {
        const ra = a.info.rarity === "tiên phẩm" ? 2 : 1;
        const rb = b.info.rarity === "tiên phẩm" ? 2 : 1;
        return rb !== ra ? rb - ra : a.info.name.localeCompare(b.info.name, "vi");
      });

    const lines = items.map((it) => `${it.info.emoji || "🐟"} **${it.info.name}** x${it.count}`);
    return msg.reply({
      embeds: [new EmbedBuilder().setTitle(`🎣 Kho Cá Quý của ${msg.author.username}`).setDescription(lines.join("\n")).setColor("#F1C40F")],
    });
  },
};

const topfish = {
  name: "topfish",
  aliases: ["topcau", "topcanthu"],
  description: "Xem top cần thủ trong server",
  run: async (_client, msg) => {
    const users = loadUsers();
    const ranking = [];
    for (const uid in users) {
      const u = users[uid];
      let total = 0;
      if (u.fishdex) {
        for (const id in u.fishdex) {
          const info = idMap[id];
          if (info && BAG_RARITIES.has(info.rarity)) total += Number(u.fishdex[id]?.count ?? 0);
        }
      } else if (u.fishInventory) {
        for (const id in u.fishInventory) {
          const info = idMap[id];
          if (info && BAG_RARITIES.has(info.rarity)) total += Number(u.fishInventory[id] ?? 0);
        }
      }
      if (total > 0) ranking.push({ uid, total });
    }

    if (!ranking.length) return msg.reply("❌ Chưa ai bắt được cá **Thiên Phẩm** trở lên.");
    ranking.sort((a, b) => b.total - a.total);
    const lines = [];
    for (let i = 0; i < Math.min(10, ranking.length); i++) {
      const entry = ranking[i];
      const member = await msg.guild.members.fetch(entry.uid).catch(() => null);
      lines.push(`**${i + 1}. ${member ? member.displayName : entry.uid}** • ${entry.total} cá`);
    }
    return msg.reply({
      embeds: [new EmbedBuilder().setTitle("🏆 TOP CẦN THỦ (Thiên Phẩm+)").setDescription(lines.join("\n")).setColor("#F1C40F")],
    });
  },
};

module.exports = [fishbag, topfish];
