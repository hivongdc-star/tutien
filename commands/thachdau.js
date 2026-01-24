const { getUser } = require("../utils/storage");
const { challenges } = require("../utils/duel");

module.exports = {
  name: "thachdau",
  aliases: ["td"],
  run: async (client, message) => {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply("❌ Bạn cần tag đối thủ!");
    if (opponent.id === message.author.id)
      return message.reply("❌ Không thể tự thách đấu chính mình!");

    const u1 = getUser(message.author.id);
    const u2 = getUser(opponent.id);
    if (!u1 || !u2)
      return message.reply(
        "❌ Cả hai người chơi cần có nhân vật trước khi thách đấu!"
      );

    challenges[opponent.id] = {
      challengerId: message.author.id,
      createdAt: Date.now(),
    };
    message.channel.send(
      `⚔️ <@${opponent.id}>, bạn có **30 giây** để chấp nhận (**-acp**) hoặc từ chối (**-deny**) thách đấu từ **${message.author.username}**!`
    );

    setTimeout(() => {
      if (challenges[opponent.id]) {
        delete challenges[opponent.id];
        message.channel.send("⌛ Lời thách đấu đã hết hạn sau 30 giây!");
      }
    }, 30000);
  },
};
