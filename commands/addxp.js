const { addXp, getRealm } = require("../utils/xp");
const { loadUsers } = require("../utils/storage");
const { OWNER_ID } = process.env;

module.exports = {
  name: "addxp",
  description: "Cộng EXP cho nhân vật chỉ định (Admin Only)",
  async run(client, message, args) {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    const target = message.mentions.users.first();
    if (!target) {
      return message.reply("⚠️ Vui lòng mention người cần cộng EXP.");
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.reply("⚠️ Vui lòng nhập số EXP hợp lệ.");
    }

    const userId = target.id;
    const leveledUp = addXp(userId, amount);

    const users = loadUsers();
    const user = users[userId];
    if (!user) return message.reply("❌ Nhân vật này chưa được tạo.");

    let msg = `✅ Đã cộng **${amount} EXP** cho **${user.name}**.`;
    if (leveledUp) {
      msg += `\n⚡️ Nhân vật đã đột phá lên **${getRealm(
        user.level
      )}** (Level ${user.level}).`;
    }

    return message.reply(msg);
  },
};
