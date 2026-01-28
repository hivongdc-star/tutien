require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

let isUpdating = false;

function parseArgs(args = []) {
  const out = {
    patchFile: null,
    // Mặc định: luôn install để đảm bảo đồng bộ deps sau khi pull.
    install: true,
  };

  for (let i = 0; i < args.length; i++) {
    const a = (args[i] || "").trim();
    if (!a) continue;

    if (a === "--install" || a === "-i") {
      out.install = true;
      continue;
    }

    if (a === "--no-install") {
      out.install = false;
      continue;
    }

    if (a === "--patch" || a === "-p") {
      const v = (args[i + 1] || "").trim();
      if (v) {
        out.patchFile = v;
        i++;
      }
      continue;
    }

    if (a.startsWith("--patch=")) {
      const v = a.slice("--patch=".length).trim();
      if (v) out.patchFile = v;
      continue;
    }
  }

  return out;
}

function isSafeRelativePath(p) {
  if (!p) return false;
  if (p.includes("\0")) return false;
  // chặn path tuyệt đối (Windows + *nix)
  if (path.isAbsolute(p)) return false;
  // chặn traversal
  const norm = path.normalize(p).replace(/\\/g, "/");
  if (norm.startsWith("../") || norm.includes("/../") || norm === "..") return false;
  return true;
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

    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

module.exports = {
  name: "update",
  aliases: ["up"],
  run: async (client, msg, args = []) => {
    const ownerId = process.env.OWNER_ID;

    if (msg.author.id !== ownerId) {
      return msg.reply("❌ Bạn không có quyền dùng lệnh này.");
    }

    if (isUpdating) {
      return msg.reply("⏳ Đang có một phiên update chạy. Chờ xong rồi hãy gọi lại.");
    }

    try {
      isUpdating = true;
      // ACK nhanh (tránh user tưởng bot treo)
      await msg.reply(
        "🔄 Đã nhận lệnh update. Bot sẽ **git pull**, **npm ci** và **restart**."
      );

      const opts = parseArgs(args);
      const repoRoot = path.join(__dirname, "..");

      // DM best-effort (có thể fail nếu user tắt DM)
      let owner = null;
      try {
        owner = await client.users.fetch(ownerId);
      } catch (_) {
        owner = null;
      }
      const safeDM = async (text) => {
        if (!owner) return;
        try {
          await owner.send(text);
        } catch (_) {}
      };

      let patchArg = "";
      if (opts.patchFile) {
        if (!isSafeRelativePath(opts.patchFile)) {
          return msg.reply(
            "❌ Đường dẫn patch không hợp lệ. Chỉ cho phép path tương đối, không chứa `..`."
          );
        }
        const absPatch = path.join(repoRoot, opts.patchFile);
        if (!fs.existsSync(absPatch)) {
          return msg.reply(
            `❌ Không tìm thấy patch: \`${opts.patchFile}\` (tính từ thư mục repo).`
          );
        }
        patchArg = opts.patchFile;
      }

      await safeDM(
        `🔄 Bot đang tiến hành update...\n` +
          `• git pull\n` +
          (patchArg ? `• git apply ${patchArg}\n` : "") +
          (opts.install ? "• npm ci\n" : "") +
          "• restart bot"
      );

      const isWin = process.platform === "win32";
      const scriptPath = path.join(repoRoot, isWin ? "update.bat" : "update.sh");

      if (!fs.existsSync(scriptPath)) {
        return msg.reply(
          `❌ Không tìm thấy script update: \`${path.basename(scriptPath)}\``
        );
      }

      const scriptArgs = [];
      if (isWin) {
        // cmd.exe /c update.bat [patch] [--install]
        scriptArgs.push("/c", scriptPath);
        if (patchArg) scriptArgs.push(patchArg);
        if (opts.install) scriptArgs.push("--install");
        else scriptArgs.push("--no-install");
      } else {
        // bash update.sh [patch] [--install]
        scriptArgs.push(scriptPath);
        if (patchArg) scriptArgs.push(patchArg);
        if (opts.install) scriptArgs.push("--install");
        else scriptArgs.push("--no-install");
      }

      const { code, stdout, stderr } = await runScript({
        cmd: isWin ? "cmd.exe" : "bash",
        args: scriptArgs,
        cwd: repoRoot,
      });

      if (code === 0) {
        // đọc version và note mới nhất
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
          );
          const version = pkg.version || "unknown";

          const changelogPath = path.join(repoRoot, "changelog.md");
          let note = "Không tìm thấy ghi chú.";
          if (fs.existsSync(changelogPath)) {
            const changelog = fs.readFileSync(changelogPath, "utf8");
            const lines = changelog.split("\n").map((l) => l.trim());
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].startsWith("##")) {
                note = lines[i + 1] || note;
                break;
              }
            }
          }

          await safeDM(
            `✅ Update thành công!\n` +
              `📌 Phiên bản: v${version}\n` +
              `📝 Ghi chú: ${note}` +
              (stdout ? `\n\n--- STDOUT (tail) ---\n${stdout}` : "") +
              (stderr ? `\n\n--- STDERR (tail) ---\n${stderr}` : "")
          );

          // Thông báo ở kênh rồi thoát để supervisor (pm2/systemd/docker) tự restart.
          try {
            await msg.channel.send("✅ Update xong. Bot sẽ restart ngay...");
          } catch (_) {}

          setTimeout(() => process.exit(0), 1500);
        } catch (err) {
          console.error("Lỗi đọc changelog:", err);
          await safeDM(
            "✅ Update thành công, nhưng không đọc được ghi chú." +
              (stdout ? `\n\n--- STDOUT (tail) ---\n${stdout}` : "") +
              (stderr ? `\n\n--- STDERR (tail) ---\n${stderr}` : "")
          );

          try {
            await msg.channel.send("✅ Update xong. Bot sẽ restart ngay...");
          } catch (_) {}

          setTimeout(() => process.exit(0), 1500);
        }
      } else {
        await safeDM(
          `❌ Update thất bại (code=${code}).\n` +
            (stdout ? `\n--- STDOUT (tail) ---\n${stdout}` : "") +
            (stderr ? `\n--- STDERR (tail) ---\n${stderr}` : "")
        );
        await msg.channel.send("❌ Update thất bại. Mình đã DM log cho bạn.");
      }
    } catch (err) {
      console.error("Lỗi khi chạy update:", err);
      msg.reply("❌ Có lỗi xảy ra khi chạy update.");
    } finally {
      isUpdating = false;
    }
  },
};
