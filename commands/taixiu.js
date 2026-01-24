const { playTaiXiu } = require("../utils/gamble");

module.exports = {
  name: "taixiu",
  run: (client, msg, args) => {
    const bet = parseInt(args[0]);
    if (!bet || bet <= 0) return msg.reply("❌ Hãy nhập số LT muốn cược!");

    const result = playTaiXiu(msg.author.id, bet);
    msg.reply(result.msg);
  },
};
