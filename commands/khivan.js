const { getBattuProfile } = require('../utils/battuProfile');
const { createKhivanEmbed } = require('../utils/khivanDaily');

module.exports = {
  name: 'khivan',
  aliases: ['kv', 'khi', 'khi-van', 'fortune', 'luck'],
  description: 'Xem lưu nhật hôm nay dựa trên mệnh bàn Bát Tự.',
  usage: '-khivan',
  run: async (client, msg) => {
    const profile = getBattuProfile(msg.author.id);
    if (!profile) {
      return msg.reply('❌ Ngươi chưa lập mệnh bàn. Hãy dùng `-battu` trước.');
    }

    const embed = createKhivanEmbed(msg.author, profile);
    return msg.reply({ embeds: [embed] });
  },
};
