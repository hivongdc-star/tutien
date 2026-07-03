// commands/xoa.js
require("dotenv").config();
const { loadUsers, saveUsers } = require("../utils/storage");

module.exports = {
  name: "xoa",
  aliases: ["delete"],
  run: async (client, msg) => {
    const ownerId = process.env.OWNER_ID;

    // kiểm tra quyền admin
    if (msg.author.id !== ownerId) {
      return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    }

    const target = msg.mentions.users.first();
    if (!target) {
      return msg.reply(
        "⚠️ Hãy tag người cần xóa nhân vật. Ví dụ: `-xoa @user`"
      );
    }

    const users = loadUsers();
    if (!users[target.id]) {
      return msg.reply("❌ Người này chưa nhập đạo.");
    }

    delete users[target.id];
    saveUsers(users);

    msg.channel.send(
      `🗑️ Nhân vật của **${target.username}** đã bị xóa bởi Admin.`
    );
  },
};
