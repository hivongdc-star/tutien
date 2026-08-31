const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function asCommandList(mod) {
  if (Array.isArray(mod)) return mod;
  if (Array.isArray(mod?.commands)) return mod.commands;
  return mod ? [mod] : [];
}
function register(client, cmd) {
  if (!cmd?.name || typeof cmd.run !== "function") return;
  client.commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) client.commands.set(alias, cmd);
}
function commandFiles() {
  return fs.readdirSync(__dirname).filter((f) => f.endsWith(".js"));
}
function loadFile(file, fresh = false) {
  const filePath = path.join(__dirname, file);
  if (fresh) delete require.cache[require.resolve(filePath)];
  return asCommandList(require(filePath));
}
function namesFor(cmd) {
  return new Set([cmd.name, ...(cmd.aliases || [])]);
}

const reload = {
  name: "reload",
  aliases: ["rl"],
  run: (client, msg, args) => {
    if (msg.author.id !== process.env.OWNER_ID) return msg.channel.send("❌ Đạo hữu không có quyền dùng lệnh này.");
    const wanted = String(args[0] || "").toLowerCase();
    if (!wanted) return msg.channel.send("❌ Hãy nhập tên lệnh hoặc `all`.");
    const files = commandFiles();

    if (wanted === "all") {
      client.commands.clear();
      for (const file of files) for (const cmd of loadFile(file, true)) register(client, cmd);
      return msg.channel.send(`✅ Đã nạp lại toàn bộ pháp lệnh từ **${files.length} file hệ thống**.`);
    }

    let matchedFile = null;
    for (const file of files) {
      if (loadFile(file, false).some((cmd) => namesFor(cmd).has(wanted))) {
        matchedFile = file;
        break;
      }
    }
    if (!matchedFile) return msg.channel.send("❌ Không tìm thấy pháp lệnh cần nạp lại.");

    const refreshed = loadFile(matchedFile, true);
    const refreshedNames = new Set(refreshed.map((cmd) => cmd?.name).filter(Boolean));
    for (const [key, cmd] of client.commands.entries()) {
      if (refreshedNames.has(cmd?.name)) client.commands.delete(key);
    }
    for (const cmd of refreshed) register(client, cmd);
    return msg.channel.send(`✅ Đã nạp lại nhóm \`${matchedFile}\` (gồm ${refreshed.length} pháp lệnh).`);
  },
};

let isUpdating = false;
function parseUpdateArgs(args = []) {
  return { install: !args.some((a) => String(a || "").trim().toLowerCase() === "--no-install") };
}
function runScript({ cmd, args, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const cap = (s) => (s.length > 7000 ? s.slice(-7000) : s);
    child.stdout.on("data", (d) => { stdout = cap(stdout + String(d)); console.log(`[UPDATE STDOUT] ${d}`); });
    child.stderr.on("data", (d) => { stderr = cap(stderr + String(d)); console.error(`[UPDATE STDERR] ${d}`); });
    child.on("error", (error) => resolve({ code: -1, stdout, stderr: cap(stderr + String(error?.message || error)) }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const update = {
  name: "update",
  aliases: ["up"],
  description: "Owner-only: đồng bộ bot với origin/main rồi restart",
  run: async (client, msg, args = []) => {
    const ownerId = process.env.OWNER_ID;
    if (!ownerId || msg.author.id !== ownerId) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    if (isUpdating) return msg.reply("⏳ Đang có một phiên update chạy.");

    const opts = parseUpdateArgs(args);
    const repoRoot = path.join(__dirname, "..");
    const isWin = process.platform === "win32";
    const scriptPath = path.join(repoRoot, isWin ? "update.bat" : "update.sh");
    if (!fs.existsSync(scriptPath)) return msg.reply(`❌ Không tìm thấy ${path.basename(scriptPath)}.`);

    let owner = null;
    try { owner = await client.users.fetch(ownerId); } catch {}
    const safeDM = async (text) => { if (owner) try { await owner.send(text); } catch {} };

    try {
      isUpdating = true;
      await msg.reply("🔄 Đang đồng bộ bot với `origin/main`...");
      await safeDM("🔄 Bắt đầu update bot:\n• fetch `origin/main`\n• chuyển working tree về đúng `origin/main`\n" + (opts.install ? "• cài dependency production\n" : "• bỏ qua cài dependency\n") + "• restart bot");
      const scriptArgs = isWin ? ["/c", scriptPath] : [scriptPath];
      if (!opts.install) scriptArgs.push("--no-install");
      const { code, stdout, stderr } = await runScript({ cmd: isWin ? "cmd.exe" : "bash", args: scriptArgs, cwd: repoRoot });
      if (code !== 0) {
        await safeDM(`❌ Update thất bại (code=${code}).` + (stdout ? `\n\n--- STDOUT ---\n${stdout}` : "") + (stderr ? `\n\n--- STDERR ---\n${stderr}` : ""));
        return msg.channel.send("❌ Update thất bại. Log đã gửi riêng cho owner.");
      }

      let version = "unknown";
      let note = "Không có ghi chú.";
      try { version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version || version; } catch {}
      try {
        const changelogPath = path.join(repoRoot, "changelog.md");
        if (fs.existsSync(changelogPath)) {
          const lines = fs.readFileSync(changelogPath, "utf8").split("\n").map((l) => l.trim());
          const idx = lines.findIndex((l) => l.startsWith("##"));
          if (idx >= 0 && lines[idx + 1]) note = lines[idx + 1];
        }
      } catch {}

      await safeDM(`✅ Update thành công.\n📌 Phiên bản: v${version}\n📝 ${note}` + (stdout ? `\n\n--- STDOUT ---\n${stdout}` : "") + (stderr ? `\n\n--- STDERR ---\n${stderr}` : ""));
      try { await msg.channel.send("✅ Đã đồng bộ `origin/main`. Bot sẽ restart ngay..."); } catch {}
      setTimeout(() => process.exit(0), 1500);
    } catch (err) {
      console.error("[update] error:", err);
      try { await msg.reply("❌ Có lỗi xảy ra khi update."); } catch {}
    } finally {
      isUpdating = false;
    }
  },
};

module.exports = [reload, update];
