const fs = require("fs");
const path = require("path");
const { loadUsers, saveUsers } = require("./storage");
const { addXp, getRealm } = require("./xp");
const { earnFromChat } = require("./currency");
const {
  ensureWordChainState,
  loadWordChainDictionaries,
  getChannelState,
  handleWordChainMessage,
} = require("../commands/noitu");

let commands = new Map();
const cooldowns = new Map();

function asCommandList(mod) {
  if (Array.isArray(mod)) return mod;
  if (Array.isArray(mod?.commands)) return mod.commands;
  return mod ? [mod] : [];
}

function registerCommand(target, cmd) {
  if (!cmd?.name || typeof cmd.run !== "function") return;
  target.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) target.set(alias, cmd);
}

function loadCommands(client) {
  commands = new Map();
  const commandsPath = path.join(__dirname, "../commands");
  const cmdFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));
  for (const file of cmdFiles) {
    const mod = require(path.join(commandsPath, file));
    for (const cmd of asCommandList(mod)) registerCommand(commands, cmd);
  }
  client.commands = commands;
  console.log(`✅ Loaded ${commands.size} commands/aliases from ${cmdFiles.length} files`);
}

async function handleCommand(client, msg, args) {
  const cmdName = args[0].replace("-", "").toLowerCase();
  const cmd = commands.get(cmdName);
  if (!cmd) return msg.reply(`❌ Không tìm thấy lệnh: **${cmdName}**`);
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
  try {
    require("../commands/games").startScheduler(client);
  } catch (error) {
    console.error("⚠️ Lottery scheduler not started:", error.message);
  }

  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    const wordChainState = getChannelState(client, msg.channel.id);
    const inWordChainChannel = !!wordChainState;
    const activeWordChainChannel = !!wordChainState && !wordChainState.isStopped;

    if (!activeWordChainChannel) {
      const now = Date.now();
      const last = cooldowns.get(msg.author.id) || 0;
      if (now - last >= 15000) {
        const users = loadUsers();
        let expGain = Math.floor(Math.random() * 16) + 5;
        if (users[msg.author.id]?.race === "nhan") expGain = Math.floor(expGain * 1.05);
        if (users[msg.author.id]?.race === "than") expGain = Math.floor(expGain * 0.95);
        const gained = addXp(msg.author.id, expGain);
        earnFromChat(msg.author.id);
        cooldowns.set(msg.author.id, now);
        if (gained > 0) {
          const u = loadUsers()[msg.author.id];
          const displayName = u?.name || msg.author.username;
          msg.channel.send(`⚡ **${displayName}** đã đột phá **${gained} cấp**!\n📖 Hiện tại cảnh giới: **${u ? getRealm(u.level) : "???"}**`);
        }
      }
    }

    if (msg.content.startsWith("-")) {
      const args = msg.content.trim().split(/\s+/);
      await handleCommand(client, msg, args);
      return;
    }
    if (inWordChainChannel) await handleWordChainMessage(client, msg);
  });
}

module.exports = { startDispatcher, loadCommands };
