const { ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require("discord.js");
const { getUser, saveUsers, loadUsers } = require("../utils/storage");
const { listItems } = require("../shop/shopUtils");

module.exports = {
  name: "use",
  aliases: ["dung"],
  run: async (client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật.");

    const catalog = listItems();
    const inv = user.inventory || {};

    // Lọc những item số lượng > 0 và có type "consumable" hoặc "relationship"
    const usableItems = Object.entries(inv).filter(([id, qty]) => {
      const item = catalog[id];
      return qty > 0 && item && (item.type === "consumable" || item.type === "relationship");
    });

    if (usableItems.length === 0) {
      return msg.reply("❌ Bạn không có vật phẩm nào có thể sử dụng.");
    }

    // Tạo select menu
    const options = usableItems.slice(0,25).map(([id, qty]) => {
      const item = catalog[id];
      return {
        label: `${item.emoji || "📦"} ${item.name} (x${qty})`,
        value: id,
        description: item.description ? item.description.slice(0, 90) : "Không có mô tả"
      };
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`use_${msg.author.id}`)
      .setPlaceholder("Chọn vật phẩm để sử dụng...")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);
    const sent = await msg.reply({ content: "🎒 Chọn vật phẩm bạn muốn sử dụng:", components: [row] });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 30000
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) {
        return i.reply({ content: "❌ Đây không phải menu của bạn.", ephemeral: true });
      }

      const itemId = i.values[0];
      const item = catalog[itemId];
      if (!item) return i.reply({ content: "❌ Vật phẩm không tồn tại.", ephemeral: true });

      // Giảm số lượng trong inventory
      user.inventory[itemId] = (user.inventory[itemId] || 0) - 1;
      if (user.inventory[itemId] <= 0) delete user.inventory[itemId];

      // Áp dụng hiệu ứng
      let result = "";
      if (item.type === "consumable") {
        if (item.effect.hp) {
          user.hp = Math.min(user.maxHp, user.hp + item.effect.hp);
          result += `❤️ Hồi ${item.effect.hp} HP. `;
        }
        if (item.effect.mp) {
          user.mp = Math.min(user.maxMp, user.mp + item.effect.mp);
          result += `🔮 Hồi ${item.effect.mp} MP. `;
        }
      } else if (item.type === "relationship") {
        result = "💍 Vật phẩm nhẫn sẽ cần lệnh riêng để kết hôn với partner (dùng `-shop @partner`).";
      }

      const users = loadUsers();
      users[msg.author.id] = user;
      saveUsers(users);

      i.update({
        content: `✅ Bạn đã sử dụng **${item.emoji} ${item.name}**. ${result}`,
        components: []
      });
    });

    collector.on("end", () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};
