const { EmbedBuilder } = require("discord.js");
const { loadUsers } = require("../utils/storage");

module.exports = {
  name: "rank",
  aliases: ["top", "bxh"],
  run: async (client, msg) => {
    const users = loadUsers();
    const all = Object.values(users || {})
      .filter((u) => u && Number.isFinite(Number(u.level)))
      .sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0) || (Number(b.exp) || 0) - (Number(a.exp) || 0))
      .slice(0, 10);

    if (!all.length) return msg.reply("❌ Hiện chưa có ai trên Bảng Phong Vân.");

    const desc = all
      .map((u, i) => `${i + 1}. **${u.title ? `[${u.title}] ` : ""}${u.name || "Ẩn danh"}**\n${u.realm || "(chưa rõ)"} • Cấp **${u.level || 1}**`)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle("🏆 Bảng Phong Vân")
      .setDescription(desc)
      .setFooter({ text: "Những người đang đi xa nhất trên con đường tu luyện." });

    msg.reply({ embeds: [embed] });
  },
};
