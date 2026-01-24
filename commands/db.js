const { EmbedBuilder } = require("discord.js");
const { playBaiCao } = require("../utils/gamble");

module.exports = {
  name: "db",
  aliases: ["daubai", "danhbai"],
  description: "Đánh bài cào với bot",
  run: async (client, msg, args) => {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0)
      return msg.reply("⚠️ Vui lòng nhập số LT hợp lệ để cược!");

    const result = playBaiCao(msg.author.id, bet);

    // Tách phần kết quả để embed rõ ràng hơn
    const lines = result.msg.split("\n");
    const playerLine = lines.find((l) => l.startsWith("👤"));
    const botLine = lines.find((l) => l.startsWith("🤖"));
    const outcome = lines.slice(2).join("\n"); // những dòng còn lại là kết quả

    const embed = new EmbedBuilder()
      .setColor(playerLine.includes("✨") ? "Green" : "Blue")
      .setTitle("🎴 Kết quả Bài Cào")
      .addFields(
        { name: "👤 Bài của bạn", value: playerLine.replace("👤 Bài của bạn: ", ""), inline: true },
        { name: "🤖 Bài của bot", value: botLine.replace("🤖 Bài của bot: ", ""), inline: true },
      )
      .addFields({ name: "📊 Kết quả", value: outcome })
      .setFooter({ text: `Cược: ${bet} LT` })
      .setTimestamp();

    return msg.reply({ embeds: [embed] });
  },
};
