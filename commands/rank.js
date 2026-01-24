const { loadUsers } = require("../utils/storage");
const { getRealm } = require("../utils/xp");
const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "rank",
  aliases: ["top", "leaderboard"],
  description: "Xem bảng xếp hạng người chơi theo cấp độ",

  run: async (client, msg) => {
    const users = loadUsers();

    // lọc và sắp xếp theo level + exp
    const sorted = Object.values(users)
      .filter((u) => u && u.level) // chỉ lấy user đã tạo
      .sort((a, b) => {
        if (b.level === a.level) return (b.exp || 0) - (a.exp || 0);
        return b.level - a.level;
      })
      .slice(0, 10); // top 10

    if (sorted.length === 0) {
      return msg.reply("❌ Hiện chưa có ai trong bảng xếp hạng.");
    }

    const desc = sorted
      .map((u, i) => {
        const name = u.name || "Ẩn danh";
        const realm = getRealm(u.level || 1);
        return `**${i + 1}. ${name}** — Lv.${u.level} (${realm}) | EXP: ${
          u.exp
        }`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🏆 Bảng Xếp Hạng Tu Luyện")
      .setDescription(desc)
      .setColor("Gold")
      .setFooter({ text: "✨ Cày cuốc chăm chỉ để leo hạng!" });

    msg.reply({ embeds: [embed] });
  },
};
