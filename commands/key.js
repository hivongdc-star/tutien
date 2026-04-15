const fs = require("fs");
const path = require("path");

function maskKey(key) {
  if (!key) return "****";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

module.exports = {
  name: "key",
  description: "Đổi SIMSIMI_API_KEY dùng cho lệnh chat (Owner Only)",
  async run(client, msg, args) {
    if (msg.author.id !== process.env.OWNER_ID) {
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    const newKey = args.join(" ").trim();
    if (!newKey) {
      return msg.reply("❌ Cú pháp: `-key <key mới>`");
    }

    if (/[\r\n]/.test(newKey)) {
      return msg.reply("❌ Key không hợp lệ.");
    }

    const envPath = path.join(__dirname, "..", ".env");

    try {
      let envContent = "";
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf8");
      }

      const nextLine = `SIMSIMI_API_KEY=${JSON.stringify(newKey)}`;
      let nextContent = envContent;

      if (/^SIMSIMI_API_KEY=.*$/m.test(envContent)) {
        nextContent = envContent.replace(/^SIMSIMI_API_KEY=.*$/m, nextLine);
      } else {
        const needBreak = nextContent.length > 0 && !nextContent.endsWith("\n");
        nextContent += `${needBreak ? "\n" : ""}${nextLine}\n`;
      }

      fs.writeFileSync(envPath, nextContent, "utf8");
      process.env.SIMSIMI_API_KEY = newKey;

      return msg.reply(
        `✅ Đã cập nhật \`SIMSIMI_API_KEY\` thành công.\n🔑 Key hiện tại: \`${maskKey(newKey)}\``
      );
    } catch (error) {
      console.error("CHAT_KEY_UPDATE_ERROR:", error);
      return msg.reply(
        "❌ Không thể cập nhật file `.env`. Kiểm tra quyền ghi của thư mục bot."
      );
    }
  },
};
