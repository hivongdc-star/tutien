const { getUser } = require("../utils/storage");

module.exports = {
  name: "lt",
  description: "Xem Linh thạch trong linh khố",
  aliases: ["linhthach"],
  run: async (client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) {
      return msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    }

    return msg.reply(`💎 Linh khố hiện có **${user.lt ?? 0} Linh thạch**.`);
  },
};
