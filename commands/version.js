const fs = require("fs");
const path = require("path");

module.exports = {
  name: "version",
  aliases: ["ver"],
  description: "Hiển thị phiên bản tông môn và ghi chú mới nhất",
  run: async (client, msg) => {
    try {
      // Đọc version từ package.json
      const pkgPath = path.join(__dirname, "../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const version = pkg.version || "0.0.0";

      // Đọc changelog.md
      const logPath = path.join(__dirname, "../changelog.md");
      const logContent = fs.readFileSync(logPath, "utf8");

      // Lấy phần note mới nhất (dòng đầu tiên sau tiêu đề)
      let note = "Chưa tìm thấy ghi chú cập nhật.";
      const lines = logContent.split("\n").map((l) => l.trim());
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("##")) {
          // ví dụ: "## 1.5.5"
          note = lines[i + 1] || note;
          break;
        }
      }

      // Trả về kết quả
      msg.reply(
        `📌 **Phiên bản tông môn:** v${version}\n📝 **Ghi chú:** ${note}`
      );
    } catch (e) {
      console.error("Lỗi đọc phiên bản:", e);
      msg.reply("❌ Không thể đọc thông tin phiên bản.");
    }
  },
};
