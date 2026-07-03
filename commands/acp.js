const { challenges, startDuel, battles } = require("../utils/duel");
const { sendBattleEmbeds } = require("../utils/duelMenu");

module.exports = {
  name: "acp",
  aliases: ["accept", "chapnhan"],
  description: "Chấp nhận thách đấu",
  async run(client, message) {
    const challenge = challenges[message.author.id];
    if (!challenge) {
      return message.reply("❌ Hiện không có chiến thư nào gửi tới đạo hữu.");
    }

    const challengerId = challenge.challengerId;
    const defenderId = message.author.id;

    // tạo state
    const state = startDuel(challengerId, defenderId);
    if (!state) {
      return message.reply("❌ Không thể khai chiến vì có người chưa nhập đạo.");
    }

    // log mở màn
    state.logs = state.logs || [];
    state.logs.push(`✨ Trận đấu giữa <@${challengerId}> và <@${defenderId}> bắt đầu!`);

    // lưu state vào battles
    battles[challengerId] = { state };
    battles[defenderId] = { state };

    // xóa challenge sau khi bắt đầu
    delete challenges[defenderId];

    // lưu kênh riêng cho từng người
    state.channels = {};

    // DM challenger
    try {
      const challenger = await client.users.fetch(challengerId);
      const dm1 = await challenger.createDM();
      await dm1.send(`🔥 Trận đấu với **${message.author.username}** đã bắt đầu!`);
      state.channels[challengerId] = dm1;
    } catch {
      state.channels[challengerId] = message.channel;
      await message.channel.send(
        `⚠️ Không thể DM cho <@${challengerId}>, sẽ gửi ở kênh công khai.`
      );
    }

    // DM defender
    try {
      const defender = message.author;
      const dm2 = await defender.createDM();
      await dm2.send(`🔥 Trận đấu với <@${challengerId}> đã bắt đầu!`);
      state.channels[defenderId] = dm2;
    } catch {
      state.channels[defenderId] = message.channel;
      await message.channel.send(
        `⚠️ Không thể DM cho <@${defenderId}>, sẽ gửi ở kênh công khai.`
      );
    }

    // gửi giao diện ban đầu (embed + menu skill)
    await sendBattleEmbeds(client, state);
  },
};
