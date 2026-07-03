const { getBattuProfile } = require('../utils/battuProfile');
const { createKhivanEmbed } = require('../utils/khivanDaily');
const { CURRENT_BATTU_PROFILE_VERSION } = require('../utils/battuCore');

module.exports = {
  name: 'khivan',
  aliases: ['kv', 'khi', 'khi-van', 'fortune', 'luck'],
  description: 'Bốc quẻ cát hung trong ngày dựa trên mệnh bàn Bát Tự.',
  usage: '-khivan',
  run: async (client, msg) => {
    const profile = getBattuProfile(msg.author.id);
    if (!profile) {
      return msg.reply('❌ Đạo hữu chưa lập mệnh bàn. Hãy dùng `-battu` trước.');
    }
    if (profile.meta?.version !== CURRENT_BATTU_PROFILE_VERSION) {
      return msg.reply('❌ Mệnh bàn cũ đã hết linh hiệu. Hãy dùng `-battu reset`, rồi `-battu` để lập lại.');
    }

    const embed = createKhivanEmbed(msg.author, profile);
    return msg.reply({ embeds: [embed] });
  },
};
