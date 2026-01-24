const { playFlip } = require("../utils/gamble");

module.exports = {
  name: "flip",
  run: (client, msg, args) => {
    const bet = parseInt(args[0]);
    const choice = args[1]?.toLowerCase();
    if (!bet || bet <= 0) return msg.reply("❌ Hãy nhập số LT muốn cược!");
    if (!["ngửa", "sấp"].includes(choice))
      return msg.reply("❌ Chọn 'ngửa' hoặc 'sấp'!");

    const result = playFlip(msg.author.id, bet, choice);
    msg.reply(result.msg);
  },
};
