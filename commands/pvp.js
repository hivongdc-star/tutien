const { getUser } = require("../utils/storage");
const { challenges, startDuel, battles, cancelAll } = require("../utils/duel");
const { sendBattleEmbeds } = require("../utils/duelMenu");

const thachdau = {
  name: "thachdau",
  aliases: ["td"],
  run: async (_client, message) => {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply("❌ Hãy tag đạo hữu muốn tỷ thí.");
    if (opponent.id === message.author.id) return message.reply("❌ Không thể tự tỷ thí với chính mình.");

    const u1 = getUser(message.author.id);
    const u2 = getUser(opponent.id);
    if (!u1 || !u2) return message.reply("❌ Cả hai người chơi cần khai mở nhân vật trước khi tỷ thí.");

    challenges[opponent.id] = { challengerId: message.author.id, createdAt: Date.now() };
    message.channel.send(
      `⚔️ **${message.author.username}** muốn tỷ thí với <@${opponent.id}>.\n` +
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

const acp = {
  name: "acp",
  aliases: ["accept", "chapnhan"],
  description: "Chấp nhận thách đấu",
  run: async (client, message) => {
    const challenge = challenges[message.author.id];
    if (!challenge) return message.reply("❌ Hiện không có chiến thư nào gửi tới đạo hữu.");

    const challengerId = challenge.challengerId;
    const defenderId = message.author.id;
    const state = startDuel(challengerId, defenderId);
    if (!state) return message.reply("❌ Không thể khai chiến vì có người chưa nhập đạo.");

    state.logs = state.logs || [];
    state.logs.push(`✨ Trận đấu giữa <@${challengerId}> và <@${defenderId}> bắt đầu!`);
    battles[challengerId] = { state };
    battles[defenderId] = { state };
    delete challenges[defenderId];
    state.channels = {};

    try {
      const challenger = await client.users.fetch(challengerId);
      const dm1 = await challenger.createDM();
      await dm1.send(`🔥 Trận đấu với **${message.author.username}** đã bắt đầu!`);
      state.channels[challengerId] = dm1;
    } catch {
      state.channels[challengerId] = message.channel;
      await message.channel.send(`⚠️ Không thể DM cho <@${challengerId}>, sẽ gửi ở kênh công khai.`);
    }

    try {
      const defender = message.author;
      const dm2 = await defender.createDM();
      await dm2.send(`🔥 Trận đấu với <@${challengerId}> đã bắt đầu!`);
      state.channels[defenderId] = dm2;
    } catch {
      state.channels[defenderId] = message.channel;
      await message.channel.send(`⚠️ Không thể DM cho <@${defenderId}>, sẽ gửi ở kênh công khai.`);
    }

    await sendBattleEmbeds(client, state);
  },
};

const deny = {
  name: "deny",
  aliases: ["d"],
  description: "Từ chối lời thách đấu",
  run: async (_client, message) => {
    const challenge = challenges[message.author.id];
    if (!challenge) return message.reply("❌ Không có lời thách đấu nào cần từ chối!");
    delete challenges[message.author.id];
    return message.channel.send(`🚫 <@${message.author.id}> đã từ chối thách đấu.`);
  },
};

const cancel = {
  name: "cancel",
  aliases: ["cxl", "endall"],
  description: "Huỷ toàn bộ trận đấu và lời thách đấu (chỉ admin dùng)",
  run: (_client, msg) => {
    if (msg.author.id !== process.env.OWNER_ID) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    cancelAll();
    return msg.reply("✅ Đã huỷ toàn bộ trận đấu và lời thách đấu.");
  },
};

module.exports = [thachdau, acp, deny, cancel];
