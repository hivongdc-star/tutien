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

    const userId = msg.mentions.users.first()?.id || args[0];
    const amount = parseInt(args[1] || args[0]);

    if (!userId || isNaN(amount)) {
      return msg.reply(
        "❌ Cú pháp: `-addlt @user <số>` hoặc `-addlt <số>` (cho chính mình)."
      );
    }

    const users = loadUsers();
    const targetId = userId.match(/^\d+$/) ? userId : msg.author.id;

    if (!users[targetId]) {
      return msg.reply("❌ Người chơi này chưa có nhân vật.");
    }

    users[targetId].lt = (users[targetId].lt || 0) + amount;
    saveUsers(users);

    if (targetId === msg.author.id) {
      return msg.reply(
        `✅ Bạn đã nhận thêm **${amount}** 💎 Linh thạch. Tổng: **${users[targetId].lt}**`
      );
    } else {
      return msg.reply(
        `✅ Đã cộng **${amount}** 💎 Linh thạch cho <@${targetId}>. Tổng: **${users[targetId].lt}**`
      );
    }
  },
};
