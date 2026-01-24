const { drawProfile } = require("../utils/canvasUtils");
const { AttachmentBuilder } = require("discord.js");

module.exports = {
  name: "profile",
  aliases: ["p"],
  run: async (client, msg) => {
    const buffer = await drawProfile(msg.author.id, msg.author.displayAvatarURL({ extension: "png" }));
    if (!buffer) return msg.reply("❌ Bạn chưa có nhân vật.");
    const attachment = new AttachmentBuilder(buffer, { name: "profile.png" });
    msg.reply({ files: [attachment] });
  },
};
