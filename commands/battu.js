const { getBattuProfile, resetBattuProfile } = require('../utils/battuProfile');
const { startBattuWizard } = require('../utils/battuWizard');
const { createBattuEmbeds } = require('../utils/battuInterpret');

module.exports = {
  name: 'battu',
  aliases: ['bazi', 'batu', 'bat-tu'],
  description: 'Thiết lập hoặc xem mệnh bàn Bát Tự.',
  usage: '-battu | -battu reset',
  run: async (client, msg, args) => {
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'reset') {
      const ok = resetBattuProfile(msg.author.id);
      return msg.reply(ok ? '✅ Đã xóa mệnh bàn cũ. Dùng `-battu` để lập lại từ đầu.' : '❌ Ngươi chưa có mệnh bàn để xóa.');
    }

    const profile = getBattuProfile(msg.author.id);
    if (!profile) {
      try {
        await startBattuWizard(msg.author);
        return msg.reply('📩 Ta đã gửi khế ước lập mệnh bàn qua **DM**. Hãy mở tin nhắn riêng với bot để tiếp tục.');
      } catch (e) {
        return msg.reply('❌ Ta không thể gửi DM cho ngươi. Hãy mở tin nhắn riêng với bot rồi gọi lại `-battu`.');
      }
    }

    try {
      const embeds = createBattuEmbeds(msg.author, profile.natalChart);
      const dm = await msg.author.createDM();
      for (const emb of embeds) {
        await dm.send({ embeds: [emb] });
      }
      return msg.reply('📩 Ta đã gửi **mệnh bàn Bát Tự** chi tiết qua tin nhắn riêng.');
    } catch (e) {
      return msg.reply('❌ Không thể gửi mệnh bàn qua DM. Hãy kiểm tra lại quyền nhận tin nhắn riêng.');
    }
  },
};
