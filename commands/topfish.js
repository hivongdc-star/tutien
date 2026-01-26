const { loadUsers } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");
const path = require("path");

const FISH_DB = require(path.join(__dirname, "../data/fish_db.json"));
const idMap = {};
for (const f of FISH_DB) idMap[f.id] = f;

// Top cá: đếm số cá từ Thiên Phẩm trở lên
const BAG_RARITIES = new Set(["truyền thuyết", "tiên phẩm"]);

module.exports = {
  name: "topfish",
  aliases: ["topcau", "topcanthu"],
  description: "Xem top cần thủ trong server",
  run: async (client, msg) => {
    const users = loadUsers();

    const ranking = [];
    for (const uid in users) {
      const u = users[uid];
      let total = 0;

      // Ưu tiên fishdex (lifetime), fallback fishInventory nếu thiếu
      if (u.fishdex) {
        for (const id in u.fishdex) {
          const info = idMap[id];
          if (!info || !BAG_RARITIES.has(info.rarity)) continue;
          total += Number(u.fishdex[id]?.count ?? 0);
        }
      } else if (u.fishInventory) {
        for (const id in u.fishInventory) {
          const info = idMap[id];
          if (!info || !BAG_RARITIES.has(info.rarity)) continue;
          total += Number(u.fishInventory[id] ?? 0);
        }
      }

      if (total > 0) ranking.push({ uid, total });
    }

    if (!ranking.length)
      return msg.reply("❌ Chưa ai bắt được cá **Thiên Phẩm** trở lên.");

    ranking.sort((a, b) => b.total - a.total);
    const top = ranking.slice(0, 10);

    const lines = [];
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const member = await msg.guild.members.fetch(entry.uid).catch(() => null);
      const name = member ? member.displayName : entry.uid;

      lines.push(
        `**${i + 1}. ${name}** • ${entry.total} cá`
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 TOP CẦN THỦ (Thiên Phẩm+)")
      .setDescription(lines.join("\n"))
      .setColor("#F1C40F");

    msg.reply({ embeds: [embed] });
  },
};
