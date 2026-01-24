const { claimDaily } = require("../utils/currency");

module.exports = {
  name: "daily",
  description: "Nhận Linh thạch hằng ngày",
  aliases: ["nhanlt", "nhanhang"],
  run: async (client, msg) => {
    const result = claimDaily(msg.author.id);

    if (!result.success) {
      return msg.reply(result.message);
    }

    return msg.reply(result.message);
  },
};
