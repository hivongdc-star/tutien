const { cancelAll } = require("../utils/duel");
const OWNER_ID = process.env.OWNER_ID;

module.exports = {
  name: "cancel",
  description: "Huỷ toàn bộ trận đấu và lời thách đấu (chỉ admin dùng)",
  aliases: ["endall"],

  run(client, msg) {
    if (msg.author.id !== OWNER_ID) {
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    cancelAll();
    msg.reply("✅ Đã huỷ toàn bộ trận đấu và lời thách đấu.");
  },
};
