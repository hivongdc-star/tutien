const { loadUsers } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "ranklt",
  aliases: ["toplt", "leaderboardlt"],
  description: "Xem bảng xếp hạng Linh Thạch",

  run: async (client, msg) => {
    const users = loadUsers();

    // lọc và sắp xếp theo Linh Thạch (lt)
    const sorted = Object.values(users)
      .filter((u) => u && u.lt !== undefined)
      .sort((a, b) => (b.lt || 0) - (a.lt || 0))
      .slice(0, 10); // top 10

    if (sorted.length === 0) {
      return msg.reply("❌ Hiện chưa có ai trong bảng xếp hạng Linh Thạch.");
    }

    const desc = sorted
      .map((u, i) => {
        const name = u.name || "Ẩn danh";
        const stones = u.lt || 0;
        return `**${i + 1}. ${name}** — 💎 ${stones.toLocaleString()} LT`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("💎 Bảng Xếp Hạng Linh Thạch")
      .setDescription(desc)
      .setColor("Blue")
      .setFooter({ text: "✨ Ai sẽ trở thành đại gia Linh Thạch?" });

    msg.reply({ embeds: [embed] });
  },
};
