// commands/doiten.js
const { loadUsers, saveUsers } = require("../utils/storage");

module.exports = {
  name: "doiten",
  aliases: ["rename", "name"],
  run: (client, msg, args) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.channel.send("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");

    const newName = args.join(" ");
    if (!newName) return msg.channel.send("❌ Hãy nhập đạo hiệu mới.");

    if (newName.length > 30) {
      return msg.channel.send("⚠️ Đạo hiệu quá dài, tối đa 30 ký tự.");
    }

    const safeName = newName.replace(/[*_`~|]/g, "");
    user.name = safeName;
    saveUsers(users);

    msg.channel.send(`✅ Đạo hiệu đã đổi thành: **${safeName}**`);
  },
};
