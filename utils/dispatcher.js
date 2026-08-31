const fs = require("fs");
const path = require("path");
const aliases = require("./aliases");
const { loadUsers, saveUsers } = require("./storage");
const { addXp, getRealm } = require("./xp");
const { earnFromChat } = require("./currency");
const {
  ensureWordChainState,
  loadWordChainDictionaries,
  getChannelState,
  handleWordChainMessage,
} = require("./wordChain");

let commands = new Map();
const cooldowns = new Map();

function loadCommands(client) {
  commands = new Map();

  const cmdFiles = fs
    .readdirSync(path.join(__dirname, "../commands"))
    .filter((f) => f.endsWith(".js"));

  for (const file of cmdFiles) {
    const cmd = require(path.join(__dirname, "../commands", file));
    if (!cmd?.name) continue;

    commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases || []) commands.set(alias, cmd);
    for (const alias of aliases[cmd.name] || []) commands.set(alias, cmd);
  }

  client.commands = commands;
  console.log(`✅ Loaded ${commands.size} commands`);
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

  require("./lotteryScheduler")(client);

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
          msg.channel.send(
            `⚡ **${displayName}** đã đột phá **${gained} cấp**!\n` +
              `📖 Hiện tại cảnh giới: **${u ? getRealm(u.level) : "???"}**`
          );
        }
      }
    }

    if (msg.content.startsWith("-")) {
      const args = msg.content.trim().split(/\s+/);
      await handleCommand(client, msg, args);
      return;
    }

    if (inWordChainChannel) {
      await handleWordChainMessage(client, msg);
    }
  });
}

module.exports = { startDispatcher };
