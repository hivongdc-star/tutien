const { playSlot } = require("../utils/gamble");

module.exports = {
  name: "slot",
  run: (client, msg, args) => {
    const bet = parseInt(args[0]);
    if (!bet || bet <= 0) return msg.reply("❌ Hãy nhập số LT muốn cược!");

    const result = playSlot(msg.author.id, bet);
    msg.reply(result.msg);
  }
};
