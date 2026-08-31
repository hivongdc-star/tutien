const fs = require("fs");
const path = require("path");
const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const { loadUsers } = require("../utils/storage");
const { rewardWord } = require("../utils/currency");
const { addXp, getRealm } = require("../utils/xp");

// ==================================================
// CONFIG + STATE
// ==================================================
const WORD_REWARD_LT = 1;
const WORD_REWARD_EXP = 3;
const DEFAULT_CORRECT_EMOJI = "✅";
const DEFAULT_WRONG_EMOJI = "❌";
const JOIN_HINT_COOLDOWN_MS = 10_000;
const ROUND_RESTART_HINT = "Ván mới có thể bắt đầu bằng bất kỳ từ hợp lệ nào.";
const STATE_PATH = path.join(__dirname, "../data/wordchain_state.json");
const VI_PATH = path.join(__dirname, "../data/wordchain_vi.txt");
const EN_PATH = path.join(__dirname, "../data/wordchain_en.txt");

function normalizeSpaces(text = "") { return String(text).trim().replace(/\s+/g, " "); }
function normalizeViText(text = "") {
  const s = normalizeSpaces(String(text).normalize("NFC").toLowerCase());
  return s && /^[\p{L}\p{M}\s]+$/u.test(s) ? s : null;
}
function normalizeEnText(text = "") {
  const s = normalizeSpaces(String(text).normalize("NFC").toLowerCase());
  return s && !s.includes(" ") && /^[a-z]+$/.test(s) ? s : null;
}
function normalizeModeText(mode, text) { return mode === "en" ? normalizeEnText(text) : normalizeViText(text); }

function readDictionary(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Thiếu file từ điển: ${path.basename(filePath)}`);
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}
function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}
function buildViDictionary(entries) {
  const set = new Set();
  const byFirstWord = new Map();
  for (const raw of entries) {
    const entry = normalizeViText(raw);
    if (!entry) continue;
    set.add(entry);
    addToMapSet(byFirstWord, entry.split(" ")[0], entry);
  }
  return { set, byFirstWord, count: set.size };
}
function buildEnDictionary(entries) {
  const set = new Set();
  const byFirstChar = new Map();
  for (const raw of entries) {
    const entry = normalizeEnText(raw);
    if (!entry) continue;
    set.add(entry);
    addToMapSet(byFirstChar, entry[0], entry);
  }
  return { set, byFirstChar, count: set.size };
}

function ensureWordChainState(client) {
  if (!client.wordChain) {
    client.wordChain = {
      loaded: false,
      persistenceLoaded: false,
      vi: null,
      en: null,
      channels: new Map(),
      joinPromptCooldown: new Map(),
    };
  }
  return client.wordChain;
}

function createChannelState(mode) {
  return {
    mode,
    isStopped: false,
    startedAt: 0,
    lastMoveAt: 0,
    lastEntry: null,
    expectedToken: null,
    expectedChar: null,
    used: new Set(),
    scores: {},
    lastPlayerId: null,
    emojis: { correctEmoji: DEFAULT_CORRECT_EMOJI, wrongEmoji: DEFAULT_WRONG_EMOJI },
  };
}

function serializeChannelState(s) {
  return {
    mode: s.mode,
    isStopped: !!s.isStopped,
    startedAt: Number(s.startedAt) || 0,
    lastMoveAt: Number(s.lastMoveAt) || 0,
    lastEntry: s.lastEntry || null,
    expectedToken: s.expectedToken || null,
    expectedChar: s.expectedChar || null,
    used: Array.from(s.used || []),
    scores: s.scores || {},
    lastPlayerId: s.lastPlayerId || null,
    emojis: {
      correctEmoji: s.emojis?.correctEmoji || DEFAULT_CORRECT_EMOJI,
      wrongEmoji: s.emojis?.wrongEmoji || DEFAULT_WRONG_EMOJI,
    },
  };
}

function deserializeChannelState(raw) {
  const mode = raw?.mode === "vi" || raw?.mode === "en" ? raw.mode : null;
  if (!mode) return null;
  const s = createChannelState(mode);
  s.isStopped = !!raw.isStopped;
  s.startedAt = Number(raw.startedAt) || 0;
  s.lastMoveAt = Number(raw.lastMoveAt) || 0;
  s.lastEntry = normalizeModeText(mode, raw.lastEntry) || null;
  s.used = new Set((Array.isArray(raw.used) ? raw.used : []).map((x) => normalizeModeText(mode, x)).filter(Boolean));
  if (s.lastEntry) s.used.add(s.lastEntry);
  s.scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
  s.lastPlayerId = typeof raw.lastPlayerId === "string" ? raw.lastPlayerId : null;
  s.emojis = {
    correctEmoji: raw.emojis?.correctEmoji || DEFAULT_CORRECT_EMOJI,
    wrongEmoji: raw.emojis?.wrongEmoji || DEFAULT_WRONG_EMOJI,
  };
  if (mode === "vi") {
    s.expectedToken = normalizeViText(raw.expectedToken) || (s.lastEntry ? s.lastEntry.split(" ").at(-1) : null);
  } else {
    s.expectedChar = /^[a-z]$/i.test(raw.expectedChar || "") ? raw.expectedChar.toLowerCase() : (s.lastEntry ? s.lastEntry.at(-1) : null);
  }
  return s;
}

function savePersistedChannels(client) {
  const state = ensureWordChainState(client);
  const payload = { version: 1, channels: {} };
  for (const [channelId, channelState] of state.channels) payload.channels[channelId] = serializeChannelState(channelState);
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2), "utf8"); } catch (e) { console.error("⚠️ Không thể lưu nối từ:", e.message); }
}

function loadPersistedChannels(client) {
  const state = ensureWordChainState(client);
  if (state.persistenceLoaded) return state;
  state.persistenceLoaded = true;
  if (!fs.existsSync(STATE_PATH)) return state;
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    for (const [channelId, value] of Object.entries(raw?.channels || {})) {
      const parsed = deserializeChannelState(value);
      if (parsed) state.channels.set(channelId, parsed);
    }
  } catch (e) { console.error("⚠️ Không thể nạp nối từ:", e.message); }
  return state;
}

function loadWordChainDictionaries(client) {
  const state = ensureWordChainState(client);
  if (!state.loaded) {
    state.vi = buildViDictionary(readDictionary(VI_PATH));
    state.en = buildEnDictionary(readDictionary(EN_PATH));
    state.loaded = true;
  }
  if (!state.persistenceLoaded) loadPersistedChannels(client);
  return state;
}

function resetRound(s, keepStopped = false) {
  s.startedAt = 0;
  s.lastMoveAt = 0;
  s.lastEntry = null;
  s.expectedToken = null;
  s.expectedChar = null;
  s.used = new Set();
  s.scores = {};
  s.lastPlayerId = null;
  if (!keepStopped) s.isStopped = false;
  return s;
}
function getChannelState(client, channelId) {
  loadWordChainDictionaries(client);
  return ensureWordChainState(client).channels.get(channelId) || null;
}
function setupChannel(client, channelId, mode) {
  loadWordChainDictionaries(client);
  const s = createChannelState(mode);
  ensureWordChainState(client).channels.set(channelId, s);
  savePersistedChannels(client);
  return s;
}
function stopChannel(client, channelId) {
  const s = getChannelState(client, channelId);
  if (!s) return null;
  resetRound(s, true);
  s.isStopped = true;
  savePersistedChannels(client);
  return s;
}
function clearChannel(client, channelId) {
  const ok = ensureWordChainState(client).channels.delete(channelId);
  if (ok) savePersistedChannels(client);
  return ok;
}
function getDictionaryForMode(client, mode) {
  const state = loadWordChainDictionaries(client);
  return mode === "en" ? state.en : state.vi;
}
function summarizeTopPlayers(scores = {}) {
  const top = Object.entries(scores).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3);
  return top.length ? top.map(([id, score], i) => `${i + 1}. <@${id}> — **${score}** từ`).join("\n") : "Chưa có ai ghi điểm.";
}
function hasRemainingMove(dict, s) {
  if (!s.lastEntry) return true;
  const candidates = s.mode === "vi" ? dict.byFirstWord.get(s.expectedToken) : dict.byFirstChar.get(s.expectedChar);
  if (!candidates) return false;
  for (const candidate of candidates) if (!s.used.has(candidate)) return true;
  return false;
}
function validateMove(dict, s, rawText) {
  const normalized = normalizeModeText(s.mode, rawText);
  if (!normalized) return { ok: false };
  if (!dict.set.has(normalized) || s.used.has(normalized)) return { ok: false };
  if (s.mode === "vi") {
    const tokens = normalized.split(" ");
    const firstWord = tokens[0];
    const lastWord = tokens.at(-1);
    if (s.lastEntry && firstWord !== s.expectedToken) return { ok: false };
    return { ok: true, normalized, lastWord };
  }
  const firstChar = normalized[0];
  const lastChar = normalized.at(-1);
  if (s.lastEntry && firstChar !== s.expectedChar) return { ok: false };
  return { ok: true, normalized, lastChar };
}
function shouldShowJoinHint(client, channelId, userId) {
  const state = ensureWordChainState(client);
  const key = `${channelId}:${userId}`;
  const now = Date.now();
  if (now - (state.joinPromptCooldown.get(key) || 0) < JOIN_HINT_COOLDOWN_MS) return false;
  state.joinPromptCooldown.set(key, now);
  return true;
}
function setChannelEmoji(client, channelId, type, emoji) {
  const s = getChannelState(client, channelId);
  if (!s) return null;
  if (type === "correct") s.emojis.correctEmoji = emoji;
  else if (type === "wrong") s.emojis.wrongEmoji = emoji;
  else return null;
  savePersistedChannels(client);
  return s;
}
function resetChannelEmojis(client, channelId) {
  const s = getChannelState(client, channelId);
  if (!s) return null;
  s.emojis = { correctEmoji: DEFAULT_CORRECT_EMOJI, wrongEmoji: DEFAULT_WRONG_EMOJI };
  savePersistedChannels(client);
  return s;
}
function getStatusText(client, channelId) {
  const s = getChannelState(client, channelId);
  if (!s) return null;
  const dict = getDictionaryForMode(client, s.mode);
  return {
    mode: s.mode,
    isStopped: s.isStopped,
    lastEntry: s.lastEntry,
    expectedText: s.mode === "vi" ? s.expectedToken || "chưa có" : s.expectedChar || "chưa có",
    usedCount: s.used.size,
    playerCount: Object.keys(s.scores).length,
    lastPlayerId: s.lastPlayerId,
    dictionarySize: dict.count,
    topPlayers: summarizeTopPlayers(s.scores),
    correctEmoji: s.emojis.correctEmoji,
    wrongEmoji: s.emojis.wrongEmoji,
  };
}
function resolveReactionEmoji(emoji) {
  const m = String(emoji).match(/^<(?:a?):[A-Za-z0-9_~\-]+:(\d+)>$/);
  return m ? m[1] : emoji;
}
async function safeReact(message, emoji) {
  try { await message.react(resolveReactionEmoji(emoji)); } catch {}
}
async function safeReactCount(message, count) {
  for (const digit of String(Math.max(0, Math.floor(Number(count) || 0)))) {
    try { await message.react(`${digit}️⃣`); } catch {}
  }
}

async function handleWordChainMessage(client, msg) {
  const s = getChannelState(client, msg.channel.id);
  if (!s || s.isStopped) return false;
  const content = String(msg.content || "").trim();
  if (!content) return false;

  const users = loadUsers();
  if (!users[msg.author.id]) {
    if (shouldShowJoinHint(client, msg.channel.id, msg.author.id)) await msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` để bắt đầu tu luyện.");
    return true;
  }

  if (s.lastPlayerId === msg.author.id) {
    await safeReact(msg, s.emojis.wrongEmoji);
    await safeReactCount(msg, s.used.size);
    return true;
  }

  const dict = getDictionaryForMode(client, s.mode);
  const result = validateMove(dict, s, content);
  if (!result.ok) {
    await safeReact(msg, s.emojis.wrongEmoji);
    await safeReactCount(msg, s.used.size);
    return true;
  }

  s.used.add(result.normalized);
  s.scores[msg.author.id] = (Number(s.scores[msg.author.id]) || 0) + 1;
  s.lastPlayerId = msg.author.id;
  s.lastMoveAt = Date.now();
  if (!s.startedAt) s.startedAt = s.lastMoveAt;
  s.lastEntry = result.normalized;
  if (s.mode === "vi") s.expectedToken = result.lastWord;
  else s.expectedChar = result.lastChar;

  rewardWord(msg.author.id, WORD_REWARD_LT);
  const levelsGained = addXp(msg.author.id, WORD_REWARD_EXP);
  savePersistedChannels(client);
  await safeReact(msg, s.emojis.correctEmoji);
  await safeReactCount(msg, s.used.size);

  if (levelsGained > 0) {
    const u = loadUsers()[msg.author.id];
    await msg.channel.send(`⚡ **${u?.name || msg.author.username}** đã đột phá **${levelsGained} cấp** từ nối từ!\n📖 Hiện tại cảnh giới: **${u ? getRealm(u.level) : "???"}**`);
  }

  if (!hasRemainingMove(dict, s)) {
    const endedBy = s.mode === "vi" ? s.expectedToken : s.expectedChar;
    await msg.channel.send(`🏁 **Ván nối từ đã kết thúc!**\nKhông còn từ hợp lệ bắt đầu bằng **${endedBy}**.\n\n📊 **Kết quả:**\n${summarizeTopPlayers(s.scores)}\n\n🔄 ${ROUND_RESTART_HINT}`);
    resetRound(s, false);
    savePersistedChannels(client);
  }
  return true;
}

// ==================================================
// COMMAND UI
// ==================================================
function hasManageChannels(msg) {
  return !!msg.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels);
}
function parseEmojiInput(raw = "") {
  const input = String(raw).trim();
  if (!input || /\s/.test(input)) return null;
  const custom = input.match(/^<(a?):[A-Za-z0-9_~\-]+:(\d+)>$/);
  if (custom) return { display: input, react: custom[2] };
  return input.length <= 10 ? { display: input, react: input } : null;
}
async function validateEmojiResolvable(msg, client, emojiValue) {
  try {
    const reaction = await msg.react(emojiValue);
    try { await reaction.users.remove(client.user.id); } catch {}
    return true;
  } catch { return false; }
}
function buildUsageText() {
  return "📌 Dùng:\n`-noitu setup vi|en`\n`-noitu stop`\n`-noitu clear`\n`-noitu status`\n`-noitu emoji dung ✅`\n`-noitu emoji sai ❌`\n`-noitu emoji reset`";
}

const command = {
  name: "noitu",
  aliases: ["nt"],
  run: async (client, msg, args) => {
    if (!msg.guild) return msg.reply("❌ Lệnh này chỉ dùng được trong máy chủ.");
    if (!hasManageChannels(msg)) return msg.reply("❌ Đạo hữu không có quyền lập trận trong kênh này.");
    const sub = String(args[0] || "").toLowerCase();
    if (!sub) return msg.reply(buildUsageText());
    try { loadWordChainDictionaries(client); } catch { return msg.reply("❌ Từ điển nối từ chưa sẵn sàng."); }

    if (sub === "setup") {
      const mode = String(args[1] || "").toLowerCase();
      if (!['vi', 'en'].includes(mode)) return msg.reply("❌ Hãy chọn `vi` hoặc `en`.");
      setupChannel(client, msg.channel.id, mode);
      const st = getStatusText(client, msg.channel.id);
      return msg.reply(`✅ Đã bật **nối từ ${mode === "vi" ? "tiếng Việt" : "tiếng Anh"}**.\n📚 ${st.dictionarySize.toLocaleString("vi-VN")} từ • ${st.correctEmoji}/${st.wrongEmoji}`);
    }
    if (sub === "stop") return stopChannel(client, msg.channel.id) ? msg.reply("🛑 Đã dừng ván nối từ hiện tại.") : msg.reply("❌ Kênh này chưa lập trận nối từ.");
    if (sub === "clear") return clearChannel(client, msg.channel.id) ? msg.reply("🧹 Đã tán trận nối từ của kênh này.") : msg.reply("❌ Kênh này chưa có trận nối từ.");

    if (sub === "emoji") {
      if (!getChannelState(client, msg.channel.id)) return msg.reply("❌ Kênh này chưa lập trận nối từ.");
      const target = String(args[1] || "status").toLowerCase();
      if (target === "status") {
        const st = getStatusText(client, msg.channel.id);
        return msg.reply(`😀 Emoji đúng / sai: ${st.correctEmoji} / ${st.wrongEmoji}`);
      }
      if (target === "reset") {
        resetChannelEmojis(client, msg.channel.id);
        const st = getStatusText(client, msg.channel.id);
        return msg.reply(`♻️ Đã đưa emoji về mặc định: ${st.correctEmoji} / ${st.wrongEmoji}`);
      }
      const mapped = ["dung", "đúng", "right", "correct", "ok"].includes(target) ? "correct" : ["sai", "wrong", "fail", "x"].includes(target) ? "wrong" : null;
      if (!mapped) return msg.reply("❌ Hãy dùng `dung` hoặc `sai`.");
      const parsed = parseEmojiInput(args.slice(2).join(" "));
      if (!parsed || !(await validateEmojiResolvable(msg, client, parsed.react))) return msg.reply("❌ Bot không thể dùng emoji này.");
      setChannelEmoji(client, msg.channel.id, mapped, parsed.display);
      const st = getStatusText(client, msg.channel.id);
      return msg.reply(`✅ Emoji đúng / sai: ${st.correctEmoji} / ${st.wrongEmoji}`);
    }

    if (sub === "status") {
      const st = getStatusText(client, msg.channel.id);
      if (!st) return msg.reply("❌ Kênh này chưa lập trận nối từ.");
      const embed = new EmbedBuilder()
        .setColor(st.isStopped ? 0xe67e22 : 0x2ecc71)
        .setTitle("🎮 Trạng thái nối từ")
        .addFields(
          { name: "Chế độ", value: st.mode === "vi" ? "Tiếng Việt" : "Tiếng Anh", inline: true },
          { name: "Trạng thái", value: st.isStopped ? "Đã dừng" : "Đang hoạt động", inline: true },
          { name: "Cần nối", value: `**${st.expectedText}**`, inline: true },
          { name: "Từ gần nhất", value: st.lastEntry ? `**${st.lastEntry}**` : "Chưa có", inline: true },
          { name: "Đã dùng", value: `**${st.usedCount}**`, inline: true },
          { name: "Từ điển", value: `**${st.dictionarySize.toLocaleString("vi-VN")}** từ`, inline: true },
          { name: "Bảng tạm thời", value: st.topPlayers, inline: false }
        )
        .setFooter({ text: ROUND_RESTART_HINT });
      return msg.reply({ embeds: [embed] });
    }
    return msg.reply(`❌ Subcommand không hợp lệ.\n${buildUsageText()}`);
  },
};

module.exports = {
  commands: [command],
  ensureWordChainState,
  loadWordChainDictionaries,
  getChannelState,
  handleWordChainMessage,
};
