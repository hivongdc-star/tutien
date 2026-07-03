const { EmbedBuilder } = require("discord.js");
const { buyTicket, getPot, drawWinner } = require("../utils/lottery");

module.exports = {
  name: "lottery",
  description: "Quản lý xổ số và jackpot",
  run: (client, msg, args) => {
    const sub = args[0];

    if (sub === "buy") {
      const amount = parseInt(args[1]) || 1;
      const result = buyTicket(msg.author.id, amount);
      return msg.reply(result.msg);

    } else if (sub === "pot") {
      const pot = getPot();
      const embed = new EmbedBuilder()
        .setColor("Gold")
        .setTitle("💰 Jackpot Hiện Tại")
        .addFields(
          { name: "💎 Tổng Jackpot", value: `${pot.jackpot} LT`, inline: true },
          { name: "🎟️ Tổng số vé", value: `${pot.ticketCount}`, inline: true }
        )
        .setFooter({ text: "Mua vé bằng lệnh: -lottery buy <số vé>" })
        .setTimestamp();

      if (pot.lastWinner) {
        embed.addFields({
          name: "🏆 Người thắng gần nhất",
          value: `<@${pot.lastWinner}>`,
        });
      }

      return msg.reply({ embeds: [embed] });

    } else if (sub === "draw") {
      // 🔒 chỉ OWNER_ID trong .env mới có quyền
      const ownerId = process.env.OWNER_ID;
      if (msg.author.id !== ownerId) {
        return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
      }

      const result = drawWinner();
      return msg.reply(result.msg);

    } else {
      return msg.reply(
        "📌 Dùng: \n" +
          "`-lottery buy <số vé>` → mua vé (10 LT/vé)\n" +
          "`-lottery pot` → xem jackpot\n" +
          "`-lottery draw` → quay số (Admin)"
      );
    }
  },
};
