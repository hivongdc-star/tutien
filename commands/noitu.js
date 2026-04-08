const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const {
  loadWordChainDictionaries,
  setupChannel,
  stopChannel,
  clearChannel,
  getStatusText,
  getChannelState,
  ROUND_RESTART_HINT,
} = require("../utils/wordChain");

function hasManageChannels(msg) {
  return !!msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

module.exports = {
  name: "noitu",
  aliases: ["nt"],
  run: async (client, msg, args) => {
    if (!msg.guild) {
      return msg.reply("❌ Lệnh này chỉ dùng được trong máy chủ.");
    }

    if (!hasManageChannels(msg)) {
      return msg.reply("❌ Bạn không có quyền chỉnh sửa kênh để dùng lệnh này.");
    }

    const sub = (args[0] || "").toLowerCase();

    if (!sub) {
      return msg.reply(
        "📌 Dùng:\n" +
          "`-noitu setup vi`\n" +
          "`-noitu setup en`\n" +
          "`-noitu stop`\n" +
          "`-noitu clear`\n" +
          "`-noitu status`"
      );
    }

    try {
      loadWordChainDictionaries(client);
    } catch (error) {
      return msg.reply(`❌ Không thể nạp từ điển nối từ: ${error.message}`);
    }

    if (sub === "setup") {
      const mode = (args[1] || "").toLowerCase();
      if (!["vi", "en"].includes(mode)) {
        return msg.reply("❌ Hãy chọn mode `vi` hoặc `en`.");
      }

      const channelState = setupChannel(client, msg.channel.id, mode);
      const status = getStatusText(client, msg.channel.id);

      return msg.reply(
        `✅ Kênh ${msg.channel} đã được bật **nối từ ${mode === "vi" ? "tiếng Việt" : "tiếng Anh"}**.\n` +
          `📚 Từ điển khả dụng: **${status.dictionarySize.toLocaleString("vi-VN")}** từ.\n` +
          `🎮 Ván mới bắt đầu ngay. Người chơi có thể gửi từ đầu tiên bất kỳ.`
      );
    }

    if (sub === "stop") {
      const channelState = stopChannel(client, msg.channel.id);
      if (!channelState) {
        return msg.reply("❌ Kênh này chưa được setup nối từ.");
      }

      return msg.reply(
        "🛑 Đã dừng ván nối từ hiện tại.\n" +
          "⚙️ Setup của kênh vẫn được giữ nguyên. Dùng `-noitu setup vi|en` để mở lại nhanh."
      );
    }

    if (sub === "clear") {
      const existed = clearChannel(client, msg.channel.id);
      if (!existed) {
        return msg.reply("❌ Kênh này chưa có setup nối từ để hủy.");
      }

      return msg.reply("🧹 Đã hủy setup nối từ của kênh này.");
    }

    if (sub === "status") {
      const status = getStatusText(client, msg.channel.id);
      if (!status) {
        return msg.reply("❌ Kênh này chưa được setup nối từ.");
      }

      const embed = new EmbedBuilder()
        .setColor(status.isStopped ? 0xe67e22 : 0x2ecc71)
        .setTitle("🎮 Trạng thái nối từ")
        .addFields(
          { name: "Kênh", value: `${msg.channel}`, inline: true },
          { name: "Chế độ", value: status.mode === "vi" ? "Tiếng Việt" : "Tiếng Anh", inline: true },
          { name: "Trạng thái", value: status.isStopped ? "Đã dừng" : "Đang hoạt động", inline: true },
          { name: "Từ / chữ cần nối", value: `**${status.expectedText}**`, inline: true },
          { name: "Từ gần nhất", value: status.lastEntry ? `**${status.lastEntry}**` : "Chưa có", inline: true },
          { name: "Số từ đã dùng", value: `**${status.usedCount}**`, inline: true },
          { name: "Người đi gần nhất", value: status.lastPlayerId ? `<@${status.lastPlayerId}>` : "Chưa có", inline: true },
          { name: "Số người đang ghi điểm", value: `**${status.playerCount}**`, inline: true },
          { name: "Từ điển", value: `**${status.dictionarySize.toLocaleString("vi-VN")}** từ`, inline: true },
          { name: "Bảng tạm thời", value: status.topPlayers, inline: false }
        )
        .setFooter({
          text: status.isStopped
            ? "Kênh đang tạm dừng."
            : `Kết thúc ván, ${ROUND_RESTART_HINT.toLowerCase()}`,
        });

      return msg.reply({ embeds: [embed] });
    }

    return msg.reply("❌ Subcommand không hợp lệ. Dùng `-noitu` để xem hướng dẫn.");
  },
};
