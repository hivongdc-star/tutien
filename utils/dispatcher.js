const fs = require("fs");
const path = require("path");
const aliases = require("./aliases");
const { loadUsers, saveUsers } = require("./storage");
const { addXp, getRealm } = require("./xp");
const { earnFromChat, rewardGameResults } = require("./currency");
const { saveImageFromUrl, saveImageFromBuffer } = require("./imageStore");

let commands = new Map();
const cooldowns = new Map();

function loadCommands() {
  const cmdFiles = fs
    .readdirSync(path.join(__dirname, "../commands"))
    .filter((f) => f.endsWith(".js"));

  cmdFiles.forEach((file) => {
    const cmd = require(path.join(__dirname, "../commands", file));
    if (!cmd || !cmd.name) return;

    commands.set(cmd.name, cmd);

    if (cmd.aliases) {
      cmd.aliases.forEach((a) => commands.set(a, cmd));
    }

    if (aliases[cmd.name]) {
      aliases[cmd.name].forEach((a) => commands.set(a, cmd));
    }
  });

  console.log(`✅ Loaded ${commands.size} commands`);
}

function handleCommand(client, msg, args) {
  let cmdName = args[0].replace("-", "").toLowerCase();
  const cmd = commands.get(cmdName);

  if (!cmd) {
    return msg.reply(`❌ Không tìm thấy lệnh: **${cmdName}**`);
  }

  try {
    cmd.run(client, msg, args.slice(1), { loadUsers, saveUsers });
  } catch (err) {
    console.error(err);
    msg.reply("⚠️ Đã xảy ra lỗi khi chạy lệnh này.");
  }
}

function startDispatcher(client) {
  loadCommands();

  // 🔔 Lên lịch quay số (19:50 nhắc, 20:00 quay)
  require("./lotteryScheduler")(client);

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

 
    // --- Auto EXP mỗi 15s ---
    const now = Date.now();
    const last = cooldowns.get(msg.author.id) || 0;
    if (now - last >= 15000) {
      const users = loadUsers();
      let expGain = Math.floor(Math.random() * 16) + 5;

      if (users[msg.author.id]) {
        if (users[msg.author.id].race === "nhan")
          expGain = Math.floor(expGain * 1.05);
        if (users[msg.author.id].race === "than")
          expGain = Math.floor(expGain * 0.95);
      }

      const gained = addXp(msg.author.id, expGain);
      earnFromChat(msg.author.id);
      cooldowns.set(msg.author.id, now);

      if (gained > 0) {
        const updatedUsers = loadUsers();
        const u = updatedUsers[msg.author.id];
        const displayName = u?.name || msg.author.username;

        msg.channel.send(
          `⚡ **${displayName}** đã đột phá **${gained} cấp**!\n` +
            `📖 Hiện tại cảnh giới: **${u ? getRealm(u.level) : "???"}**`
        );
      }
    }


    // --- Media save ---
    try {
      if ((msg.attachments?.size || 0) > 0) {
        for (const att of msg.attachments.values()) {
          const ctype = String(att.contentType || "").toLowerCase();
          const originalName = att.name || "file";
          const lowerName = originalName.toLowerCase();
          const isMedia =
            ctype.startsWith("image/") ||
            ctype.startsWith("video/") ||
            ctype.startsWith("audio/") ||
            /\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|mkv|mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName);

          if (!isMedia) continue;

          const result = await saveImageFromUrl(att.url, {
            mime: ctype,
            originalName,
            username: msg.author?.username || "unknown",
            timestamp: msg.createdAt || new Date()
          });
          console.log("Saved media:", result.relPath, result.bytes, "bytes");
        }
      }

      const m = msg.content?.match(/data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/);
      if (m) {
        const mimeSubType = m[1];
        const buf = Buffer.from(m[2], "base64");
        const res2 = saveImageFromBuffer(buf, {
          mime: `image/${mimeSubType}`,
          originalName: `pasted.${mimeSubType}`,
          username: msg.author?.username || "unknown",
          timestamp: msg.createdAt || new Date()
        });
        console.log("Saved inline media:", res2.relPath);
      }
    } catch (e) {
      console.error("Media save error:", e?.message || e);
    }

    // --- Command ---
    if (msg.content.startsWith("-")) {
      const args = msg.content.trim().split(/\s+/);
      handleCommand(client, msg, args);
    }
  });
}

module.exports = { startDispatcher };
