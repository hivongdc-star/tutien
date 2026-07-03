const { PermissionsBitField } = require("discord.js");
const { clearAIChannel } = require("../utils/aiChat");

function hasManageChannels(msg) {
  return !!msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

module.exports = {
  name: "aiclear",
  description: "Tắt chat AI khỏi kênh hiện tại",
  async run(client, msg) {
    if (!msg.guild) {
      return msg.reply("❌ Lệnh này chỉ dùng được trong máy chủ.");
    }

    if (!hasManageChannels(msg)) {
      return msg.reply("❌ Bạn cần quyền Manage Channels để xoá kênh AI.");
    }

    const existed = clearAIChannel(client, msg.channel.id);

    if (!existed) {
      return msg.reply("❌ Kênh này chưa được bật chat AI.");
    }

    return msg.reply(`🧹 Đã tắt chat AI khỏi kênh ${msg.channel}.`);
  },
};
