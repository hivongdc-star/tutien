// commands/thanhtuu.js
// Thành tựu (combo 1): xem tiến độ + danh hiệu mở khoá.

const { EmbedBuilder } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { ACHIEVEMENTS, ensureAchv } = require("../utils/achievementSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function getStat(user, key) {
  const v = user?.achvStats?.[key];
  return Math.max(0, Math.floor(Number(v) || 0));
}

module.exports = {
  name: "thanhtuu",
  aliases: ["tt", "achievement", "ach"],
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureAchv(u);
    users[msg.author.id] = u;
    saveUsers(users);

    const lines = ACHIEVEMENTS.map((a) => {
      const cur = getStat(u, a.stat);
      const done = Boolean(u.achievements?.[a.id]) || cur >= a.need;
      const st = done ? "✅" : "⏳";
      const prog = a.need > 1 ? `${cur}/${a.need}` : (done ? "1/1" : "0/1");
      return `${st} **${a.title}** — ${prog}\n_${a.desc}_`;
    }).join("\n\n");

    const titleOwned = Array.isArray(u.titles) ? u.titles : [];
    const titleLine = titleOwned.length
      ? titleOwned.slice(0, 20).map((t) => `• ${t}`).join("\n")
      : "(Chưa có)";

    const embed = new EmbedBuilder()
      .setTitle("🏅 Thành tựu")
      .setColor(0xF1C40F)
      .setDescription(
        `Linh thạch: **${fmtLT(u.lt)}** 💎\n` +
        `Danh hiệu đang dùng: **${u.title || "(chưa chọn)"}**\n\n` +
        lines
      )
      .addFields({ name: "🎖 Danh hiệu đã sở hữu", value: titleLine, inline: false })
      .setFooter({ text: "Dùng -danhhieu để equip danh hiệu." });

    return msg.reply({ embeds: [embed] });
  },
};
