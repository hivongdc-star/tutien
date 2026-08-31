require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let isUpdating = false;

function parseArgs(args = []) {
  return {
    install: !args.some((a) => String(a || "").trim().toLowerCase() === "--no-install"),
  };
}

function runScript({ cmd, args, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });

    let stdout = "";
    let stderr = "";
    const cap = (s) => (s.length > 7000 ? s.slice(-7000) : s);

    child.stdout.on("data", (d) => {
      stdout = cap(stdout + String(d));
      console.log(`[UPDATE STDOUT] ${d}`);
    });

    child.stderr.on("data", (d) => {
      stderr = cap(stderr + String(d));
      console.error(`[UPDATE STDERR] ${d}`);
    });

    child.on("error", (error) => {
      resolve({ code: -1, stdout, stderr: cap(stderr + String(error?.message || error)) });
    });

    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

module.exports = {
  name: "update",
  aliases: ["up"],
  description: "Owner-only: đồng bộ bot với origin/main rồi restart",

  run: async (client, msg, args = []) => {
    const ownerId = process.env.OWNER_ID;

    if (!ownerId || msg.author.id !== ownerId) {
      return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    }

    if (isUpdating) {
      return msg.reply("⏳ Đang có một phiên update chạy.");
    }

    const opts = parseArgs(args);
    const repoRoot = path.join(__dirname, "..");
    const isWin = process.platform === "win32";
    const scriptPath = path.join(repoRoot, isWin ? "update.bat" : "update.sh");

    if (!fs.existsSync(scriptPath)) {
      return msg.reply(`❌ Không tìm thấy ${path.basename(scriptPath)}.`);
    }

    let owner = null;
    try {
      owner = await client.users.fetch(ownerId);
    } catch (_) {}

    const safeDM = async (text) => {
      if (!owner) return;
      try {
        await owner.send(text);
      } catch (_) {}
    };

    try {
      isUpdating = true;

      await msg.reply("🔄 Đang đồng bộ bot với `origin/main`...");
      await safeDM(
        "🔄 Bắt đầu update bot:\n" +
          "• fetch `origin/main`\n" +
          "• chuyển working tree về đúng `origin/main`\n" +
          (opts.install ? "• cài dependency production\n" : "• bỏ qua cài dependency\n") +
          "• restart bot"
      );

      const scriptArgs = [];
      if (isWin) {
        scriptArgs.push("/c", scriptPath);
      } else {
        scriptArgs.push(scriptPath);
      }
      if (!opts.install) scriptArgs.push("--no-install");

      const { code, stdout, stderr } = await runScript({
        cmd: isWin ? "cmd.exe" : "bash",
        args: scriptArgs,
        cwd: repoRoot,
      });

      if (code !== 0) {
        await safeDM(
          `❌ Update thất bại (code=${code}).` +
            (stdout ? `\n\n--- STDOUT ---\n${stdout}` : "") +
            (stderr ? `\n\n--- STDERR ---\n${stderr}` : "")
        );
        return msg.channel.send("❌ Update thất bại. Log đã gửi riêng cho owner.");
      }

      let version = "unknown";
      let note = "Không có ghi chú.";

      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
        version = pkg.version || version;
      } catch (_) {}

      try {
        const changelogPath = path.join(repoRoot, "changelog.md");
        if (fs.existsSync(changelogPath)) {
          const lines = fs.readFileSync(changelogPath, "utf8").split("\n").map((l) => l.trim());
          const idx = lines.findIndex((l) => l.startsWith("##"));
          if (idx >= 0 && lines[idx + 1]) note = lines[idx + 1];
        }
      } catch (_) {}

      await safeDM(
        `✅ Update thành công.\n📌 Phiên bản: v${version}\n📝 ${note}` +
          (stdout ? `\n\n--- STDOUT ---\n${stdout}` : "") +
          (stderr ? `\n\n--- STDERR ---\n${stderr}` : "")
      );

      try {
        await msg.channel.send("✅ Đã đồng bộ `origin/main`. Bot sẽ restart ngay...");
      } catch (_) {}

      setTimeout(() => process.exit(0), 1500);
    } catch (err) {
      console.error("[update] error:", err);
      try {
        await msg.reply("❌ Có lỗi xảy ra khi update.");
      } catch (_) {}
    } finally {
      isUpdating = false;
    }
  },
};
