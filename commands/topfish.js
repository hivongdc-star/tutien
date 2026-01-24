const { loadUsers } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");

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
      if (u.fishInventory) {
        for (const id in u.fishInventory) total += u.fishInventory[id];
      }
      if (total > 0) ranking.push({ uid, total });
    }

    if (!ranking.length)
      return msg.reply("❌ Chưa ai bắt được con cá nào cả.");

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
      .setTitle("🏆 TOP CẦN THỦ")
      .setDescription(lines.join("\n"))
      .setColor("#00ff88");

    msg.reply({ embeds: [embed] });
  },
};
