const fs = require("fs");
const path = require("path");
const aliases = require("./aliases");
const { loadUsers, saveUsers } = require("./storage");
const { addXp, getRealm } = require("./xp");
const { earnFromChat } = require("./currency");
const { saveImageFromUrl, saveImageFromBuffer } = require("./imageStore");
const {
  ensureWordChainState,
  loadWordChainDictionaries,
  getChannelState,
  isWordChainChannel,
  handleWordChainMessage,
} = require("./wordChain");

let commands = new Map();
const cooldowns = new Map();

function loadCommands(client) {
  commands = new Map();

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

  client.commands = commands;
  console.log(`✅ Loaded ${commands.size} commands`);
}

async function handleCommand(client, msg, args) {
  let cmdName = args[0].replace("-", "").toLowerCase();
  const cmd = commands.get(cmdName);

  if (!cmd) {
    return msg.reply(`❌ Không tìm thấy lệnh: **${cmdName}**`);
  }

  try {
    await cmd.run(client, msg, args.slice(1), { loadUsers, saveUsers });
  } catch (err) {
    console.error(err);
    msg.reply("⚠️ Đã xảy ra lỗi khi chạy lệnh này.");
  }
}

function startDispatcher(client) {
  loadCommands(client);
  ensureWordChainState(client);

  try {
    loadWordChainDictionaries(client);
    console.log("✅ Loaded word chain dictionaries");
  } catch (error) {
    console.error("⚠️ Word chain dictionaries not loaded:", error.message);
  }

  // 🔔 Lên lịch quay số (19:50 nhắc, 20:00 quay)
  require("./lotteryScheduler")(client);

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const wordChainState = getChannelState(client, msg.channel.id);
    const inWordChainChannel = !!wordChainState;
    const activeWordChainChannel = !!wordChainState && !wordChainState.isStopped;

    // --- Auto EXP mỗi 15s ---
    if (!activeWordChainChannel) {
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
    }

    // --- Media save (image / video / audio) ---
    try {
      if ((msg.attachments?.size || 0) > 0) {
        for (const att of msg.attachments.values()) {
          const ctype = String(att.contentType || "").toLowerCase();
          const originalName = att.name || "attachment";
          const lowerName = String(originalName).toLowerCase();
          const isSupportedMedia =
            ctype.startsWith("image/") ||
            ctype.startsWith("video/") ||
            ctype.startsWith("audio/") ||
            /\.(png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|mkv|mp3|wav|ogg|m4a|aac|flac)$/i.test(lowerName);

          if (!isSupportedMedia) continue;

          const result = await saveImageFromUrl(att.url, {
            mime: ctype || undefined,
            originalName,
            username: msg.author.username,
            timestamp: msg.createdAt,
          });
          console.log("Saved media:", result.relPath, result.bytes, "bytes");
        }
      }

      const m = msg.content?.match(/data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/);
      if (m) {
        const buf = Buffer.from(m[1], "base64");
        const res2 = saveImageFromBuffer(buf, {
          mime: "image/auto",
          originalName: "pasted",
          username: msg.author.username,
          timestamp: msg.createdAt,
        });
        console.log("Saved inline image:", res2.relPath);
      }
    } catch (e) {
      console.error("Media save error:", e?.message || e);
    }

    // --- Command ---
    if (msg.content.startsWith("-")) {
      const args = msg.content.trim().split(/\s+/);
      await handleCommand(client, msg, args);
      return;
    }

    // --- Nối từ ---
    if (inWordChainChannel) {
      await handleWordChainMessage(client, msg);
    }
  });
}

module.exports = { startDispatcher };
