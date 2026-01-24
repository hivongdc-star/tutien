const { getUser } = require("../utils/storage");
const { listItems } = require("../shop/shopUtils");

module.exports = {
  name: "inventory",
  aliases: ["inv", "bag", "tui"],
  run: async (client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật.");

    const catalog = listItems();
    const inv = user.inventory || {};

    if (Object.keys(inv).length === 0) {
      return msg.reply("🎒 Túi đồ của bạn đang trống.");
    }

    let lines = [];
    for (const [id, qty] of Object.entries(inv)) {
      if (qty > 0) {
        const item = catalog[id];
        if (item) {
          lines.push(`${item.emoji || "📦"} **${item.name}** x${qty}`);
        } else {
          lines.push(`📦 ${id} x${qty}`);
        }
      }
    }

    if (lines.length === 0) {
      return msg.reply("🎒 Túi đồ của bạn đang trống.");
    }

    msg.reply("🎒 **Túi đồ của bạn:**\n" + lines.join("\n"));
  },
};
