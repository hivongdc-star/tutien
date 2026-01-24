require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = {
  name: "update",
  aliases: ["up"],
  run: async (client, msg) => {
    const ownerId = process.env.OWNER_ID;

    if (msg.author.id !== ownerId) {
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    try {
      const owner = await client.users.fetch(ownerId);
      await owner.send("🔄 Bot đang tiến hành update...");

      const scriptPath = path.join(__dirname, "..", "update.bat");
      const child = spawn("cmd.exe", ["/c", scriptPath]);

      child.stdout.on("data", (data) => {
        console.log(`[UPDATE STDOUT] ${data}`);
      });

      child.stderr.on("data", (data) => {
        console.error(`[UPDATE STDERR] ${data}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          // đọc version và note mới nhất
          try {
            const pkg = JSON.parse(
              fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
            );
            const version = pkg.version || "unknown";

            const changelog = fs.readFileSync(
              path.join(__dirname, "..", "changelog.md"),
              "utf8"
            );
            let note = "Không tìm thấy ghi chú.";
            const lines = changelog.split("\n").map((l) => l.trim());
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].startsWith("##")) {
                note = lines[i + 1] || note;
                break;
              }
            }

            owner.send(
              `✅ Update thành công!\n📌 Phiên bản: v${version}\n📝 Ghi chú: ${note}`
            );
          } catch (err) {
            console.error("Lỗi đọc changelog:", err);
            owner.send("✅ Update thành công, nhưng không đọc được ghi chú.");
          }
        } else {
          owner.send("❌ Update thất bại, kiểm tra log!");
        }
      });
    } catch (err) {
      console.error("Lỗi khi chạy update:", err);
      msg.reply("❌ Có lỗi xảy ra khi chạy update.");
    }
  },
};
