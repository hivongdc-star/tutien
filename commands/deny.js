// commands/deny.js
const { challenges } = require("../utils/duel");

module.exports = {
  name: "deny",
  description: "Từ chối lời thách đấu",
  async run(client, message) {
    const challenge = challenges[message.author.id];
    if (!challenge)
      return message.reply("❌ Không có lời thách đấu nào cần từ chối!");

    delete challenges[message.author.id];
    message.channel.send(`🚫 <@${message.author.id}> đã từ chối thách đấu.`);
  },
};
