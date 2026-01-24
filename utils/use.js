// commands/use.js
const { loadUsers, saveUsers } = require("../utils/storage");
const { listItems } = require("../shop/shopUtils");
const { applyItemEffect } = require("../utils/itemEffects");

module.exports = {
  name: "use",
  run: async (client, msg, args)=>{
    const userId = msg.author.id;
    const itemId = (args[0]||"").trim();
    const target = msg.mentions.users.first();
    const targetId = target ? target.id : userId;

    if (!itemId) return msg.reply("Cú pháp: `use <itemId> [@target]`");

    const users = loadUsers(); const catalog = listItems();
    const me = users[userId]; if (!me) return msg.reply("❌ Bạn chưa có nhân vật.");
    const item = catalog[itemId]; if (!item) return msg.reply("❌ Vật phẩm không tồn tại.");
    item.id = itemId;

    const res = applyItemEffect(users, userId, targetId, item, true);
    saveUsers(users);
    return msg.reply(res.message);
  }
};
