const { getUser } = require("../utils/storage");
const { listItems } = require("../shop/shopUtils");

module.exports = {
  name: "inventory",
  // NOTE: Đã tách "-bag" sang hệ túi mới (trang bị/khoáng cụ/khoáng thạch)
  aliases: ["inv"],
  run: async (client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");

    const catalog = listItems();
    const inv = user.inventory || {};

    if (Object.keys(inv).length === 0) {
      return msg.reply("🎒 Hành trang của đạo hữu đang trống.");
    }

    let lines = [];
    for (const [id, qty] of Object.entries(inv)) {
      if (qty > 0) {
        const item = catalog[id];
        if (item) {
          lines.push(`${item.emoji || "📦"} **${item.name}** x${qty}`);
        } else {
          lines.push(`📦 **Vật phẩm chưa giám định** x${qty}`);
        }
      }
    }

    if (lines.length === 0) {
      return msg.reply("🎒 Hành trang của đạo hữu đang trống.");
    }

    msg.reply("🎒 **Hành trang:**\n" + lines.join("\n"));
  },
};
