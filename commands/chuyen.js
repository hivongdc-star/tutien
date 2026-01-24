const { loadUsers } = require("../utils/storage");
const { addLT, removeLT, getLT } = require("../utils/currency");

module.exports = {
  name: "chuyen",
  description: "Chuyển Linh thạch cho người chơi khác",
  aliases: ["give", "pay", "transfer", "chuyenlt"],
  usage: "-chuyen @nguoi_nhan <so_luong>",
  run: async (client, msg, args) => {
    const mention = msg.mentions.users.first();
    const senderId = msg.author.id;

    // Parse patterns:
    // -chuyen @user 100
    // -chuyen 100 @user
    let targetId = mention?.id || null;
    let amountStr = null;

    if (mention) {
      amountStr = args.find((a) => /^\d+$/.test(a));
    } else {
      const idArg = args.find((a) => /^<@!?(\d+)>$/.test(a));
      if (idArg) {
        targetId = idArg.replace(/[<@!>]/g, "");
        amountStr = args.find((a) => /^\d+$/.test(a));
      } else if (args.length >= 2 && /^\d+$/.test(args[0])) {
        amountStr = args[0];
        const id2 = args.find((a) => /^<@!?(\d+)>$/.test(a));
        if (id2) targetId = id2.replace(/[<@!>]/g, "");
      }
    }

    if (!targetId || !amountStr) {
      return msg.reply(
        "❌ Cú pháp: `-chuyen @nguoi_nhan <so_luong>` hoặc `-chuyen <so_luong> @nguoi_nhan>`"
      );
    }
    if (targetId === senderId) {
      return msg.reply("❌ Bạn không thể tự chuyển cho chính mình.");
    }

    const amount = parseInt(amountStr, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return msg.reply("❌ Số lượng phải là số nguyên dương.");
    }

    // Ensure both users exist
    const users = loadUsers();
    if (!users[senderId]) {
      return msg.reply("⚠️ Bạn chưa tạo nhân vật. Dùng `-create` trước.");
    }
    if (!users[targetId]) {
      return msg.reply("⚠️ Người nhận chưa tạo nhân vật.");
    }

    const senderLT = getLT(senderId) || 0;
    if (senderLT < amount) {
      return msg.reply(`❌ Bạn không đủ Linh thạch. Hiện có: **${senderLT}**`);
    }

    // Transfer via currency utils to keep logic consistent
    removeLT(senderId, amount);
    addLT(targetId, amount);

    const newSender = getLT(senderId) || 0;
    const newTarget = getLT(targetId) || 0;

    return msg.reply(
      `✅ Đã chuyển **${amount}** 💎 Linh thạch cho <@${targetId}>.\n` +
      `📤 Số dư của bạn: **${newSender}**\n` +
      `📥 Số dư của họ: **${newTarget}**`
    );
  },
};
