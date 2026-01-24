// commands/bio.js
const { loadUsers, saveUsers } = require("../utils/storage");

module.exports = {
  name: "bio",
  aliases: ["thongtin", "about"],
  run: (client, msg, args) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.channel.send("❌ Bạn chưa có nhân vật.");

    const text = args.join(" ");
    if (!text) return msg.channel.send("❌ Hãy nhập bio mới.");

    if (text.length > 200) {
      return msg.channel.send("⚠️ Bio quá dài, tối đa 200 ký tự.");
    }

    const safeText = text.replace(/[*_`~|]/g, "");
    user.bio = safeText;
    saveUsers(users);

    msg.channel.send("✅ Cập nhật bio thành công.");
  },
};
