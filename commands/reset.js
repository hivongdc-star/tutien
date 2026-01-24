// commands/reset.js
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers, createUser } = require("../utils/storage");
const races = require("../utils/races");
const elements = require("../utils/element");

module.exports = {
  name: "reset",
  aliases: ["rs"],
  run: async (client, msg) => {
    const users = loadUsers();
    if (!users[msg.author.id]) {
      return msg.reply("⚠️ Bạn chưa có nhân vật để reset.");
    }

    // Xoá nhân vật cũ
    delete users[msg.author.id];
    saveUsers(users);

    // Menu chọn lại Tộc
    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("reset_select_race")
      .setPlaceholder("🧬 Chọn lại Tộc")
      .addOptions(
        Object.entries(races).map(([key, r]) => ({
          label: r.name.substring(0, 25),
          value: key,
          emoji: r.emoji,
        }))
      );

    // Menu chọn lại Ngũ hành
    const elementMenu = new StringSelectMenuBuilder()
      .setCustomId("reset_select_element")
      .setPlaceholder("🌿 Chọn lại Ngũ hành")
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
      .setColor("Red")
      .setTitle("♻️ Reset nhân vật")
      .setDescription(
        `Nhân vật của **${msg.author.username}** đã được xoá.\n👉 Hãy chọn lại **Tộc** và **Ngũ hành** để bắt đầu lại từ đầu!`
      );

    const reply = await msg.channel.send({
      embeds: [embed],
      components: [row1, row2],
    });

    let selectedRace = null;
    let selectedElement = null;
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({
          content: "⚠️ Bạn chỉ có thể reset chính nhân vật của mình!",
          ephemeral: true,
        });
      }

      if (interaction.customId === "reset_select_race") {
        selectedRace = interaction.values[0];
        await interaction.reply({
          content: `🧬 Bạn đã chọn lại **${races[selectedRace].emoji} ${races[selectedRace].name}**`,
          ephemeral: true,
        });
      }

      if (interaction.customId === "reset_select_element") {
        selectedElement = interaction.values[0];
        await interaction.reply({
          content: `🌿 Bạn đã chọn lại **${elements.display[selectedElement]}**`,
          ephemeral: true,
        });
      }

      if (selectedRace && selectedElement) {
        const newUser = createUser(
          msg.author.id,
          selectedRace,
          selectedElement
        );

        const confirm = new EmbedBuilder()
          .setTitle("✅ Reset thành công!")
          .setColor("Green")
          .setDescription(
            `🧬 **Tộc:** ${races[selectedRace].emoji} ${races[selectedRace].name}\n` +
              `🌿 **Ngũ hành:** ${elements.display[selectedElement]}\n` +
              `⚔️ **Cảnh giới:** ${newUser.realm}\n` +
              `❤️ Máu: ${newUser.hp} | 🔷 Mana: ${newUser.mana}\n` +
              `🔥 Công: ${newUser.attack} | 🛡️ Thủ: ${newUser.defense} | 📦 Giáp: ${newUser.armor}\n` +
              `💢 Nộ: ${newUser.fury} | 💎 Linh Thạch: ${newUser.linhthach}`
          )
          .setFooter({ text: "✨ Hãy tu luyện chăm chỉ từ đầu!" });

        await msg.channel.send({ embeds: [confirm] });
        collector.stop();
      }
    });

    collector.on("end", () => {
      if (!selectedRace || !selectedElement) {
        msg.channel.send(
          "⏳ Reset không hoàn tất, hãy dùng lại lệnh `-reset`."
        );
      }
    });
  },
};
