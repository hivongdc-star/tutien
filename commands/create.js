const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { createUser, loadUsers } = require("../utils/storage");
const races = require("../utils/races");
const elements = require("../utils/element");

module.exports = {
  name: "create",
  aliases: ["c"],
  run: async (client, msg) => {
    const users = loadUsers();
    if (users[msg.author.id]) {
      return msg.reply("⚠️ Bạn đã có nhân vật rồi! Dùng `-profile` để xem.");
    }

    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("select_race")
      .setPlaceholder("🧬 Chọn Tộc")
      .addOptions(
        Object.entries(races).map(([key, r]) => ({
          label: r.name.substring(0, 25),
          value: key,
          emoji: r.emoji,
        }))
      );

    const elementMenu = new StringSelectMenuBuilder()
      .setCustomId("select_element")
      .setPlaceholder("🌿 Chọn Ngũ hành")
      .addOptions(
        Object.entries(elements.display).map(([key, raw]) => {
          const [emoji, name] = raw.split(" ");
          return {
            label: name.substring(0, 25),
            value: key,
            emoji: emoji,
          };
        })
      );

    const row1 = new ActionRowBuilder().addComponents(raceMenu);
    const row2 = new ActionRowBuilder().addComponents(elementMenu);

    const embed = new EmbedBuilder()
      .setTitle("✨ Tạo Nhân Vật")
      .setDescription("Chọn **Tộc** và **Ngũ hành** để bắt đầu tu luyện!")
      .setColor("Purple");

    const reply = await msg.reply({
      embeds: [embed],
      components: [row1, row2],
    });

    let selectedRace = null;
    let selectedElement = null;
    let created = false;
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({
          content: "⚠️ Đây không phải lựa chọn của bạn!",
          ephemeral: true,
        });
      }

      if (interaction.customId === "select_race") {
        selectedRace = interaction.values[0];
        await interaction.reply({
          content: `🧬 Bạn đã chọn **${races[selectedRace].emoji} ${races[selectedRace].name}**`,
          ephemeral: true,
        });
      }

      if (interaction.customId === "select_element") {
        selectedElement = interaction.values[0];
        await interaction.reply({
          content: `🌿 Bạn đã chọn **${elements.display[selectedElement]}**`,
          ephemeral: true,
        });
      }

      if (selectedRace && selectedElement) {
        const newUser = createUser(msg.author.id, selectedRace, selectedElement);
        newUser.background = "default"; // gán mặc định
        created = true;

        const confirm = new EmbedBuilder()
          .setTitle("✅ Nhân vật đã tạo thành công!")
          .setColor("Green")
          .setDescription(
            `🧬 **Tộc:** ${races[selectedRace].emoji} ${races[selectedRace].name}\n` +
              `🌿 **Ngũ hành:** ${elements.display[selectedElement]}\n` +
              `⚔️ **Cảnh giới:** ${newUser.realm}\n\n` +
              `❤️ Máu: ${newUser.hp}/${newUser.maxHp}\n` +
              `🔷 Mana: ${newUser.mp}/${newUser.maxMp}\n` +
              `🔥 Công: ${newUser.atk} | 🛡️ Thủ: ${newUser.def} | ⚡ Tốc: ${newUser.spd}\n` +
              `💢 Nộ: ${newUser.fury} | 💎 Linh Thạch: ${newUser.lt}`
          );

        await msg.channel.send({ embeds: [confirm] });
        collector.stop();
      }
    });

    collector.on("end", () => {
      if (!created) {
        msg.channel.send("⏳ Bạn chưa hoàn tất chọn Tộc và Ngũ hành, hãy thử lại!");
      }
    });
  },
};
