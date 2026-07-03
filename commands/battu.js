const { getBattuProfile, resetBattuProfile } = require('../utils/battuProfile');
const { startBattuWizard } = require('../utils/battuWizard');
const { createBattuEmbeds } = require('../utils/battuInterpret');
const { CURRENT_BATTU_PROFILE_VERSION } = require('../utils/battuCore');

module.exports = {
  name: 'battu',
  aliases: ['bazi', 'batu', 'bat-tu'],
  description: 'Thiết lập hoặc xem mệnh bàn Bát Tự.',
  usage: '-battu | -battu reset',
  run: async (client, msg, args) => {
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'reset') {
      const ok = resetBattuProfile(msg.author.id);
      return msg.reply(ok ? '✅ Đã tán bỏ mệnh bàn cũ. Dùng `-battu` để lập lại từ đầu.' : '❌ Đạo hữu chưa có mệnh bàn để xóa.');
    }

    const profile = getBattuProfile(msg.author.id);
    if (!profile || profile.meta?.version !== CURRENT_BATTU_PROFILE_VERSION) {
      if (profile) resetBattuProfile(msg.author.id);
      try {
        await startBattuWizard(msg.author);
        const prefix = profile ? '♻️ Mệnh bàn cũ đã hết linh hiệu, cần lập lại theo phép tính mới. ' : '';
        return msg.reply(`${prefix}📩 Ta đã gửi **khế ước lập mệnh bàn** qua tin nhắn riêng. Hãy mở DM để tiếp tục.`);
      } catch (e) {
        return msg.reply('❌ Không thể truyền thư riêng. Hãy mở DM cho ta rồi gọi lại `-battu`.');
      }
    }

    try {
      const embeds = createBattuEmbeds(msg.author, profile.natalChart);
      const dm = await msg.author.createDM();
      for (const emb of embeds) {
        await dm.send({ embeds: [emb] });
      }
      return msg.reply('📩 **Mệnh bàn Bát Tự** đã được gửi qua tin nhắn riêng.');
    } catch (e) {
      return msg.reply('❌ Không thể truyền mệnh bàn qua DM. Hãy kiểm tra quyền nhận tin nhắn riêng.');
    }
  },
};
