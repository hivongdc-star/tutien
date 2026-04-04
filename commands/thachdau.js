const { getUser } = require("../utils/storage");
const { challenges } = require("../utils/duel");

module.exports = {
  name: "thachdau",
  aliases: ["td"],
  run: async (client, message) => {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply("❌ Hãy tag người bạn muốn tỷ thí.");
    if (opponent.id === message.author.id) return message.reply("❌ Không thể tự tỷ thí với chính mình.");

    const u1 = getUser(message.author.id);
    const u2 = getUser(opponent.id);
    if (!u1 || !u2) return message.reply("❌ Cả hai người chơi cần khai mở nhân vật trước khi tỷ thí.");

    challenges[opponent.id] = { challengerId: message.author.id, createdAt: Date.now() };
    message.channel.send(
      `⚔️ **${message.author.username}** muốn tỷ thí với <@${opponent.id}>.
` +
      `Người được mời có **30 giây** để chấp nhận bằng **-acp** hoặc từ chối bằng **-deny**.`
    );

    setTimeout(() => {
      if (challenges[opponent.id]) {
        delete challenges[opponent.id];
        message.channel.send("⌛ Lời tỷ thí đã tan sau 30 giây.");
      }
    }, 30000);
  },
};
