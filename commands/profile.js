const { EmbedBuilder } = require("discord.js");
const { getUser } = require("../utils/storage");
const { getExpNeeded } = require("../utils/xp");
const races = require("../utils/races");
const elements = require("../utils/element");

module.exports = {
  name: "profile",
  aliases: ["p"],
  run: async (client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) {
      return msg.reply("❌ Bạn chưa bước vào con đường tu luyện. Dùng `-create` để khai mở nhân vật.");
    }

    const displayName = user.name && user.name !== "Chưa đặt tên" ? user.name : msg.author.username;
    const titlePrefix = user.title ? `[${user.title}] ` : "";
    const raceLabel = races[user.race]?.name || user.race || "?";
    const elementLabel = elements.display[user.element] || user.element || "?";
    const expNeed = getExpNeeded(Number(user.level) || 1);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("Hồ Sơ Tu Luyện")
      .setThumbnail(msg.author.displayAvatarURL({ extension: "png", size: 256 }))
      .setDescription(
        `**${titlePrefix}${displayName}**\n` +
        `${user.realm || "(chưa rõ)"}\n\n` +
        `${raceLabel} • ${elementLabel}`
      )
      .addFields(
        {
          name: "Tiến cảnh",
          value:
            `Cấp tu luyện: **${Number(user.level) || 1}**\n` +
            `Kinh nghiệm: **${Number(user.exp) || 0}/${expNeed}**\n` +
            `Linh thạch: **${Number(user.lt) || 0}**`,
          inline: true,
        },
        {
          name: "Nội thể",
          value:
            `Sinh lực: **${Number(user.hp) || 0}/${Number(user.maxHp) || 0}**\n` +
            `Linh lực: **${Number(user.mp) || 0}/${Number(user.maxMp) || 0}**`,
          inline: true,
        },
        {
          name: "Nền tảng",
          value:
            `Công kích: **${Number(user.atk) || 0}**\n` +
            `Phòng ngự: **${Number(user.def) || 0}**\n` +
            `Thân pháp: **${Number(user.spd) || 0}**`,
          inline: false,
        },
        {
          name: "Lời tự thuật",
          value: user.bio ? String(user.bio).slice(0, 1024) : "Chưa lưu lại lời tự thuật.",
          inline: false,
        }
      )
      .setFooter({ text: "Dùng -nv để xem chi tiết gia tăng từ trang bị và chiêu thức." });

    return msg.reply({ embeds: [embed] });
  },
};
