const { EmbedBuilder } = require("discord.js");
const { playBaiCao } = require("../utils/gamble");

module.exports = {
  name: "db",
  aliases: ["daubai", "danhbai"],
  description: "Đấu bài cào với nhà cái",
  run: async (client, msg, args) => {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0)
      return msg.reply("⚠️ Hãy nhập số Linh thạch hợp lệ để đặt cược.");

    const result = playBaiCao(msg.author.id, bet);

    // Tách phần kết quả để embed rõ ràng hơn
    const lines = result.msg.split("\n");
    const playerLine = lines.find((l) => l.startsWith("👤"));
    const botLine = lines.find((l) => l.startsWith("🏯"));
    const outcome = lines.slice(2).join("\n"); // những dòng còn lại là kết quả

    const embed = new EmbedBuilder()
      .setColor(playerLine.includes("✨") ? "Green" : "Blue")
      .setTitle("🎴 Đấu Bài Cào")
      .addFields(
        { name: "👤 Bài của đạo hữu", value: playerLine.replace("👤 Bài của đạo hữu: ", ""), inline: true },
        { name: "🏯 Bài nhà cái", value: botLine.replace("🏯 Bài nhà cái: ", ""), inline: true },
      )
      .addFields({ name: "📊 Kết quả", value: outcome })
      .setFooter({ text: `Tiền cược: ${bet} LT` })
      .setTimestamp();

    return msg.reply({ embeds: [embed] });
  },
};
