const { PermissionsBitField } = require("discord.js");
const { setupAIChannel } = require("../utils/aiChat");

function hasManageChannels(msg) {
  return !!msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

module.exports = {
  name: "aisetup",
  description: "Set kênh hiện tại thành kênh chat AI",
  async run(client, msg) {
    if (!msg.guild) {
      return msg.reply("❌ Lệnh này chỉ dùng được trong máy chủ.");
    }

    if (!hasManageChannels(msg)) {
      return msg.reply("❌ Bạn cần quyền Manage Channels để set kênh AI.");
    }

    setupAIChannel(client, msg.channel.id);

    return msg.reply(
      `✅ Đã bật chat AI trong kênh ${msg.channel}.\n` +
        "Từ giờ mọi tin nhắn thường trong kênh này sẽ được Vân Tiêu hóa thân trả lời.\n" +
        "Tin nhắn bắt đầu bằng `-` vẫn là lệnh bot, không trigger AI."
    );
  },
};
