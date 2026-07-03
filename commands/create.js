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
      return msg.reply("⚠️ Đạo hữu đã nhập đạo rồi. Dùng `-profile` để xem hồ sơ hiện tại.");
    }

    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("select_race")
      .setPlaceholder("Chọn huyết mạch...")
      .addOptions(
        Object.entries(races).map(([key, r]) => ({
          label: r.name.substring(0, 25),
          value: key,
          emoji: r.emoji,
        }))
      );

    const elementMenu = new StringSelectMenuBuilder()
      .setCustomId("select_element")
      .setPlaceholder("Chọn bản mệnh ngũ hành...")
      .addOptions(
        Object.entries(elements.display).map(([key, raw]) => {
          const [emoji, name] = raw.split(" ");
          return { label: name.substring(0, 25), value: key, emoji };
        })
      );

    const row1 = new ActionRowBuilder().addComponents(raceMenu);
    const row2 = new ActionRowBuilder().addComponents(elementMenu);

    const embed = new EmbedBuilder()
      .setTitle("✨ Khai Mở Nhân Vật")
      .setDescription("Chọn **huyết mạch** và **bản mệnh ngũ hành** để khai mở tiên đồ.")
      .setColor(0x8E44AD);

    const reply = await msg.reply({ embeds: [embed], components: [row1, row2] });

    let selectedRace = null;
    let selectedElement = null;
    let created = false;
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({ content: "⚠️ Đây không phải lựa chọn của đạo hữu.", ephemeral: true });
      }

      if (interaction.customId === "select_race") {
        selectedRace = interaction.values[0];
        await interaction.reply({ content: `Đã chọn huyết mạch: **${races[selectedRace].emoji} ${races[selectedRace].name}**`, ephemeral: true });
      }

      if (interaction.customId === "select_element") {
        selectedElement = interaction.values[0];
        await interaction.reply({ content: `Đã chọn bản mệnh: **${elements.display[selectedElement]}**`, ephemeral: true });
      }

      if (selectedRace && selectedElement) {
        const newUser = createUser(msg.author.id, selectedRace, selectedElement);
        newUser.background = "default";
        created = true;

        const confirm = new EmbedBuilder()
          .setTitle("✅ Nhập Đạo Thành Công")
          .setColor(0x2ECC71)
          .setDescription(
            `Huyết mạch: **${races[selectedRace].emoji} ${races[selectedRace].name}**\n` +
              `Bản mệnh: **${elements.display[selectedElement]}**\n` +
              `Cảnh giới: **${newUser.realm}**\n\n` +
              `Sinh lực: **${newUser.hp}/${newUser.maxHp}**\n` +
              `Linh lực: **${newUser.mp}/${newUser.maxMp}**\n` +
              `Công kích: **${newUser.atk}**\n` +
              `Phòng ngự: **${newUser.def}**\n` +
              `Thân pháp: **${newUser.spd}**\n` +
              `Linh thạch: **${newUser.lt}**`
          )
          .setFooter({ text: "Dùng -profile để xem hồ sơ, -bag để mở hành trang." });

        await msg.channel.send({ embeds: [confirm] });
        collector.stop();
      }
    });

    collector.on("end", () => {
      if (!created) {
        msg.channel.send("⏳ Đạo hữu chưa hoàn tất khai mệnh. Dùng `-create` để bắt đầu lại.");
      }
    });
  },
};
