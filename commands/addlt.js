const { loadUsers, saveUsers } = require("../utils/storage");

module.exports = {
  name: "addlt",
  description: "Thêm Linh thạch cho một người chơi (chỉ admin)",
  aliases: ["addstone"],
  run: async (client, msg, args) => {
    const ownerId = process.env.OWNER_ID;
    if (msg.author.id !== ownerId) {
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    const mentionedUser = msg.mentions.users.first() || null;
    const targetId = mentionedUser ? mentionedUser.id : msg.author.id;
    const amount = Number.parseInt(mentionedUser ? args[1] : args[0], 10);

    if (!Number.isFinite(amount)) {
      return msg.reply(
        "❌ Cú pháp: `-addlt @user <số>` hoặc `-addlt <số>` (cho chính mình)."
      );
    }

    const users = loadUsers();
    const targetUser = users[targetId];
    if (!targetUser) {
      return msg.reply("❌ Người chơi này chưa có nhân vật.");
    }

    targetUser.lt = (Number(targetUser.lt) || 0) + amount;
    saveUsers(users);

    if (targetId === msg.author.id) {
      return msg.reply(
        `✅ Bạn đã nhận thêm **${amount}** 💎 Linh thạch. Tổng: **${targetUser.lt}**`
      );
    }

    return msg.reply(
      `✅ Đã cộng **${amount}** 💎 Linh thạch cho <@${targetId}>. Tổng: **${targetUser.lt}**`
    );
  },
};
