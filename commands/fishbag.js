const { loadUsers, saveUsers } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");
const path = require("path");

const FISH_DB = require(path.join(__dirname, "../data/fish_db.json"));
const idMap = {};
for (const f of FISH_DB) idMap[f.id] = f;

// Kho cá: chỉ lưu từ Thiên Phẩm trở lên
const BAG_RARITIES = new Set(["truyền thuyết", "tiên phẩm"]);

module.exports = {
  name: "fishbag",
  aliases: ["tuca", "kho", "cakho"],
  description: "Xem bộ sưu tập cá bạn đang có",
  run: async (client, msg) => {
    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Bạn chưa bước vào con đường tu luyện. Dùng `-create` để khai mở nhân vật.");

    if (!me.fishInventory || Object.keys(me.fishInventory).length === 0)
      return msg.reply("🐟 Kho cá hiện chưa có thu hoạch từ **Thiên phẩm** trở lên.");

    // Dọn kho legacy: loại bỏ cá dưới Thiên Phẩm khỏi fishInventory
    let changed = false;
    for (const id of Object.keys(me.fishInventory)) {
      const info = idMap[id];
      if (!info || !BAG_RARITIES.has(info.rarity)) {
        delete me.fishInventory[id];
        changed = true;
      }
    }
    if (changed) {
      users[msg.author.id] = me;
      saveUsers(users);
    }

    if (Object.keys(me.fishInventory).length === 0)
      return msg.reply("🐟 Kho cá hiện chưa có thu hoạch từ **Thiên phẩm** trở lên.");

    const lines = [];
    const items = Object.keys(me.fishInventory)
      .map((id) => {
        const info = idMap[id] || { id, name: id, emoji: "🐟", rarity: "thường" };
        return { id, count: me.fishInventory[id], info };
      })
      .sort((a, b) => {
        const ra = a.info.rarity === "tiên phẩm" ? 2 : 1;
        const rb = b.info.rarity === "tiên phẩm" ? 2 : 1;
        if (rb !== ra) return rb - ra;
        return a.info.name.localeCompare(b.info.name, "vi");
      });

    for (const it of items) {
      const info = it.info;
      lines.push(`${info.emoji || "🐟"} **${info.name}** x${it.count}`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎣 Kho Cá Quý của ${msg.author.username}`)
      .setDescription(lines.join("\n"))
      .setColor("#F1C40F");

    msg.reply({ embeds: [embed] });
  },
};
