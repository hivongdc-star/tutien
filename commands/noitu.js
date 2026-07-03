const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const {
  loadWordChainDictionaries,
  setupChannel,
  stopChannel,
  clearChannel,
  getStatusText,
  getChannelState,
  setChannelEmoji,
  resetChannelEmojis,
  ROUND_RESTART_HINT,
} = require("../utils/wordChain");

function hasManageChannels(msg) {
  return !!msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}

function parseEmojiInput(raw = "") {
  const input = String(raw || "").trim();
  if (!input || /\s/.test(input)) return null;

  const customMatch = input.match(/^<(a?):[A-Za-z0-9_~\-]+:(\d+)>$/);
  if (customMatch) {
    return {
      display: input,
      react: customMatch[2],
      type: customMatch[1] ? "custom_animated" : "custom",
    };
  }

  if (input.length <= 10) {
    return {
      display: input,
      react: input,
      type: "unicode",
    };
  }

  return null;
}

async function validateEmojiResolvable(msg, client, emojiValue) {
  try {
    const reaction = await msg.react(emojiValue);
    try {
      await reaction.users.remove(client.user.id);
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

function buildUsageText() {
  return (
    "📌 Dùng:\n" +
    "`-noitu setup vi`\n" +
    "`-noitu setup en`\n" +
    "`-noitu stop`\n" +
    "`-noitu clear`\n" +
    "`-noitu status`\n" +
    "`-noitu emoji dung ✅`\n" +
    "`-noitu emoji sai ❌`\n" +
    "`-noitu emoji reset`\n" +
    "`-noitu emoji status`"
  );
}

module.exports = {
  name: "noitu",
  aliases: ["nt"],
  run: async (client, msg, args) => {
    if (!msg.guild) {
      return msg.reply("❌ Lệnh này chỉ dùng được trong máy chủ.");
    }

    if (!hasManageChannels(msg)) {
      return msg.reply("❌ Đạo hữu không có quyền lập trận trong kênh này.");
    }

    const sub = (args[0] || "").toLowerCase();

    if (!sub) {
      return msg.reply(buildUsageText());
    }

    try {
      loadWordChainDictionaries(client);
    } catch (error) {
      return msg.reply(`❌ Từ điển nối từ chưa sẵn sàng. Hãy báo quản sự kiểm tra.`);
    }

    if (sub === "setup") {
      const mode = (args[1] || "").toLowerCase();
      if (!["vi", "en"].includes(mode)) {
        return msg.reply("❌ Hãy chọn phép chơi `vi` hoặc `en`.");
      }

      setupChannel(client, msg.channel.id, mode);
      const status = getStatusText(client, msg.channel.id);

      return msg.reply(
        `✅ Kênh ${msg.channel} đã được bật **nối từ ${mode === "vi" ? "tiếng Việt" : "tiếng Anh"}**.\n` +
          `📚 Từ điển khả dụng: **${status.dictionarySize.toLocaleString("vi-VN")}** từ.\n` +
          `😀 Emoji đúng / sai: ${status.correctEmoji} / ${status.wrongEmoji}\n` +
          `🎮 Ván mới bắt đầu ngay. Người chơi có thể gửi từ đầu tiên bất kỳ.`
      );
    }

    if (sub === "stop") {
      const channelState = stopChannel(client, msg.channel.id);
      if (!channelState) {
        return msg.reply("❌ Kênh này chưa lập trận nối từ.");
      }

      return msg.reply(
        "🛑 Đã dừng ván nối từ hiện tại.\n" +
          "⚙️ Trận pháp của kênh vẫn được giữ. Dùng `-noitu setup vi|en` để mở lại nhanh."
      );
    }

    if (sub === "clear") {
      const existed = clearChannel(client, msg.channel.id);
      if (!existed) {
        return msg.reply("❌ Kênh này chưa có trận nối từ để hủy.");
      }

      return msg.reply("🧹 Đã tán trận nối từ của kênh này.");
    }

    if (sub === "emoji") {
      const channelState = getChannelState(client, msg.channel.id);
      if (!channelState) {
        return msg.reply("❌ Kênh này chưa lập trận nối từ.");
      }

      const target = (args[1] || "").toLowerCase();

      if (!target || target === "status") {
        const status = getStatusText(client, msg.channel.id);
        return msg.reply(
          `😀 Emoji hiện tại của kênh này:\n` +
            `- Đúng: ${status.correctEmoji}\n` +
            `- Sai: ${status.wrongEmoji}\n\n` +
            "Dùng `-noitu emoji dung <emoji>` hoặc `-noitu emoji sai <emoji>` để đổi.\n" +
            "Dùng `-noitu emoji reset` để về mặc định."
        );
      }

      if (target === "reset") {
        resetChannelEmojis(client, msg.channel.id);
        const status = getStatusText(client, msg.channel.id);
        return msg.reply(`♻️ Đã đưa emoji về mặc định: ${status.correctEmoji} / ${status.wrongEmoji}`);
      }

      const mappedTarget = ["dung", "đung", "right", "correct", "ok"].includes(target)
        ? "correct"
        : ["sai", "wrong", "fail", "x"].includes(target)
          ? "wrong"
          : null;

      if (!mappedTarget) {
        return msg.reply("❌ Hãy dùng `dung` hoặc `sai`. Ví dụ: `-noitu emoji dung ✅`");
      }

      const rawEmoji = args.slice(2).join(" ").trim();
      const parsedEmoji = parseEmojiInput(rawEmoji);
      if (!parsedEmoji) {
        return msg.reply("❌ Emoji không hợp lệ. Hãy gửi emoji Unicode hoặc emoji custom dạng `<:ten:id>`.");
      }

      const canUse = await validateEmojiResolvable(msg, client, parsedEmoji.react);
      if (!canUse) {
        return msg.reply("❌ Bot không thể dùng emoji này. Hãy kiểm tra quyền hoặc dùng emoji khác.");
      }

      setChannelEmoji(client, msg.channel.id, mappedTarget, parsedEmoji.display);
      const status = getStatusText(client, msg.channel.id);

      return msg.reply(
        mappedTarget === "correct"
          ? `✅ Đã đổi emoji đúng thành ${status.correctEmoji}. Emoji sai hiện tại: ${status.wrongEmoji}`
          : `✅ Đã đổi emoji sai thành ${status.wrongEmoji}. Emoji đúng hiện tại: ${status.correctEmoji}`
      );
    }

    if (sub === "status") {
      const status = getStatusText(client, msg.channel.id);
      if (!status) {
        return msg.reply("❌ Kênh này chưa lập trận nối từ.");
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
          { name: "Emoji đúng / sai", value: `${status.correctEmoji} / ${status.wrongEmoji}`, inline: true },
          { name: "Bảng tạm thời", value: status.topPlayers, inline: false }
        )
        .setFooter({
          text: status.isStopped
            ? "Kênh đang tạm dừng."
            : `Kết thúc ván, ${ROUND_RESTART_HINT.toLowerCase()}`,
        });

      return msg.reply({ embeds: [embed] });
    }

    return msg.reply(`❌ Subcommand không hợp lệ.\n${buildUsageText()}`);
  },
};
