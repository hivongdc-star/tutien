const { ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");

module.exports = {
  name: "danhhieu",
  aliases: ["title"],
  run: async (client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật.");

    user.titles = user.titles || [];
    if (user.titles.length === 0) return msg.reply("❌ Bạn chưa có danh hiệu nào.");

    const options = user.titles.slice(0,25).map((t) => ({
      label: t.slice(0,100),
      value: t.slice(0,100),
      description: `Chọn danh hiệu: ${t}`.slice(0,100),
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`title_${msg.author.id}`)
      .setPlaceholder("Chọn danh hiệu...")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);
    const sent = await msg.reply({ content: "🎖 Chọn danh hiệu bạn muốn dùng:", components: [row] });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 30000
    });

    collector.on("collect", (i) => {
      if (i.user.id !== msg.author.id)
        return i.reply({ content: "❌ Đây không phải menu của bạn!", ephemeral: true });

      const chosen = i.values[0];
      user.title = chosen;
      saveUsers(users);
      i.update({ content: `✅ Đã chọn danh hiệu **${chosen}**`, components: [] });
    });

    collector.on("end", () => { sent.edit({ components: [] }).catch(()=>{}); });
  },
};
