const fs = require("fs");
const path = require("path");
const aliases = require("../utils/aliases");

function asCommandList(mod) {
  if (Array.isArray(mod)) return mod;
  if (Array.isArray(mod?.commands)) return mod.commands;
  return mod ? [mod] : [];
}

function register(client, cmd) {
  if (!cmd?.name || typeof cmd.run !== "function") return;
  client.commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) client.commands.set(alias, cmd);
  for (const alias of aliases[cmd.name] || []) client.commands.set(alias, cmd);
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
  return new Set([cmd.name, ...(cmd.aliases || []), ...(aliases[cmd.name] || [])]);
}

module.exports = {
  name: "reload",
  aliases: ["rl"],
  run: (client, msg, args) => {
    if (msg.author.id !== process.env.OWNER_ID) {
      return msg.channel.send("❌ Đạo hữu không có quyền dùng lệnh này.");
    }

    const wanted = String(args[0] || "").toLowerCase();
    if (!wanted) return msg.channel.send("❌ Hãy nhập tên lệnh hoặc `all`.");

    const files = commandFiles();

    if (wanted === "all") {
      client.commands.clear();
      for (const file of files) {
        for (const cmd of loadFile(file, true)) register(client, cmd);
      }
      return msg.channel.send(`✅ Đã nạp lại toàn bộ pháp lệnh từ **${files.length} file hệ thống**.`);
    }

    let matchedFile = null;
    for (const file of files) {
      const list = loadFile(file, false);
      if (list.some((cmd) => namesFor(cmd).has(wanted))) {
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
