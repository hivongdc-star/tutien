const { EmbedBuilder } = require("discord.js");
const { loadUsers } = require("../utils/storage");

function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

module.exports = {
  name: "ranklt",
  aliases: ["toplt", "bxhlt"],
  run: async (client, msg) => {
    const users = loadUsers();
    const all = Object.values(users || {})
      .filter((u) => u)
      .sort((a, b) => (Number(b.lt) || 0) - (Number(a.lt) || 0))
      .slice(0, 10);

    if (!all.length) return msg.reply("❌ Hiện chưa có ai trên Bảng Tàng Phú.");

    const desc = all
      .map((u, i) => `${i + 1}. **${u.title ? `[${u.title}] ` : ""}${u.name || "Ẩn danh"}**\nLinh thạch: **${fmt(u.lt)}**`)
      .join("\n\n");

    const embed = new EmbedBuilder()
      .setColor(0x00B0F4)
      .setTitle("💎 Bảng Tàng Phú")
      .setDescription(desc)
      .setFooter({ text: "Những người đang nắm giữ nhiều linh thạch nhất." });

    msg.reply({ embeds: [embed] });
  },
};
