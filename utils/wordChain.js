const fs = require("fs");
const path = require("path");
const { loadUsers } = require("./storage");
const { rewardWord } = require("./currency");
const { addXp, getRealm } = require("./xp");
const { wordChainRewardLT, wordChainRewardExp } = require("./config");

const WORD_REWARD_LT = wordChainRewardLT || 1;
const WORD_REWARD_EXP = wordChainRewardExp || 1;
const JOIN_HINT_COOLDOWN_MS = 10000;
const ROUND_RESTART_HINT = "Ván mới có thể bắt đầu bằng bất kỳ từ hợp lệ nào.";

function normalizeSpaces(text = "") {
  return text.trim().replace(/\s+/g, " ");
}

function normalizeViText(text = "") {
  if (typeof text !== "string") return null;
  const normalized = normalizeSpaces(text.normalize("NFC").toLowerCase());
  if (!normalized) return null;
  if (!/^[\p{L}\p{M}\s]+$/u.test(normalized)) return null;
  return normalized;
}

function normalizeEnText(text = "") {
  if (typeof text !== "string") return null;
  const normalized = normalizeSpaces(text.normalize("NFC").toLowerCase());
  if (!normalized) return null;
  if (normalized.includes(" ")) return null;
  if (!/^[a-z]+$/.test(normalized)) return null;
  return normalized;
}

function readDictionary(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Thiếu file từ điển: ${path.basename(filePath)}`);
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function buildViDictionary(entries) {
  const set = new Set();
  const byFirstWord = new Map();

  for (const entry of entries) {
    const normalized = normalizeViText(entry);
    if (!normalized) continue;
    set.add(normalized);

    const tokens = normalized.split(" ");
    const firstWord = tokens[0];
    addToMapSet(byFirstWord, firstWord, normalized);
  }

  return { set, byFirstWord, count: set.size };
}

function buildEnDictionary(entries) {
  const set = new Set();
  const byFirstChar = new Map();

  for (const entry of entries) {
    const normalized = normalizeEnText(entry);
    if (!normalized) continue;
    set.add(normalized);

    const firstChar = normalized[0];
    addToMapSet(byFirstChar, firstChar, normalized);
  }

  return { set, byFirstChar, count: set.size };
}

function ensureWordChainState(client) {
  if (!client.wordChain) {
    client.wordChain = {
      loaded: false,
      vi: null,
      en: null,
      channels: new Map(),
      joinPromptCooldown: new Map(),
    };
  }

  return client.wordChain;
}

function loadWordChainDictionaries(client) {
  const state = ensureWordChainState(client);
  if (state.loaded) return state;

  const viPath = path.join(__dirname, "../data/wordchain_vi.txt");
  const enPath = path.join(__dirname, "../data/wordchain_en.txt");

  const viEntries = readDictionary(viPath);
  const enEntries = readDictionary(enPath);

  state.vi = buildViDictionary(viEntries);
  state.en = buildEnDictionary(enEntries);
  state.loaded = true;

  return state;
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
  };
}

function resetRound(channelState, keepStopState = false) {
  channelState.startedAt = 0;
  channelState.lastMoveAt = 0;
  channelState.lastEntry = null;
  channelState.expectedToken = null;
  channelState.expectedChar = null;
  channelState.used = new Set();
  channelState.scores = {};
  channelState.lastPlayerId = null;
  if (!keepStopState) channelState.isStopped = false;
  return channelState;
}

function getChannelState(client, channelId) {
  return ensureWordChainState(client).channels.get(channelId) || null;
}

function isWordChainChannel(client, channelId) {
  return !!getChannelState(client, channelId);
}

function setupChannel(client, channelId, mode) {
  const state = loadWordChainDictionaries(client);
  const channelState = createChannelState(mode);
  state.channels.set(channelId, channelState);
  return channelState;
}

function stopChannel(client, channelId) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;
  resetRound(channelState, true);
  channelState.isStopped = true;
  return channelState;
}

function clearChannel(client, channelId) {
  return ensureWordChainState(client).channels.delete(channelId);
}

function getDictionaryForMode(client, mode) {
  const state = loadWordChainDictionaries(client);
  return mode === "vi" ? state.vi : state.en;
}

function shouldShowJoinHint(client, channelId, userId) {
  const state = ensureWordChainState(client);
  const key = `${channelId}:${userId}`;
  const now = Date.now();
  const last = state.joinPromptCooldown.get(key) || 0;

  if (now - last < JOIN_HINT_COOLDOWN_MS) return false;

  state.joinPromptCooldown.set(key, now);
  return true;
}

function summarizeTopPlayers(scores = {}) {
  const top = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (!top.length) return "Chưa có ai ghi điểm.";

  return top
    .map(([userId, points], index) => `${index + 1}. <@${userId}> — **${points}** từ`)
    .join("\n");
}

function hasRemainingMove(dictionary, channelState) {
  if (!channelState.lastEntry) return true;

  if (channelState.mode === "vi") {
    const candidates = dictionary.byFirstWord.get(channelState.expectedToken);
    if (!candidates || !candidates.size) return false;

    for (const candidate of candidates) {
      if (!channelState.used.has(candidate)) return true;
    }

    return false;
  }

  const candidates = dictionary.byFirstChar.get(channelState.expectedChar);
  if (!candidates || !candidates.size) return false;

  for (const candidate of candidates) {
    if (!channelState.used.has(candidate)) return true;
  }

  return false;
}

function validateMove(dictionary, channelState, rawText) {
  if (channelState.mode === "vi") {
    const normalized = normalizeViText(rawText);
    if (!normalized) {
      return { ok: false, reason: "invalid_format" };
    }

    if (!dictionary.set.has(normalized)) {
      return { ok: false, reason: "not_in_dictionary" };
    }

    if (channelState.used.has(normalized)) {
      return { ok: false, reason: "already_used" };
    }

    const tokens = normalized.split(" ");
    const firstWord = tokens[0];
    const lastWord = tokens[tokens.length - 1];

    if (channelState.lastEntry && firstWord !== channelState.expectedToken) {
      return { ok: false, reason: "wrong_link", normalized, firstWord, lastWord };
    }

    return { ok: true, normalized, firstWord, lastWord };
  }

  const normalized = normalizeEnText(rawText);
  if (!normalized) {
    return { ok: false, reason: "invalid_format" };
  }

  if (!dictionary.set.has(normalized)) {
    return { ok: false, reason: "not_in_dictionary" };
  }

  if (channelState.used.has(normalized)) {
    return { ok: false, reason: "already_used" };
  }

  const firstChar = normalized[0];
  const lastChar = normalized[normalized.length - 1];

  if (channelState.lastEntry && firstChar !== channelState.expectedChar) {
    return { ok: false, reason: "wrong_link", normalized, firstChar, lastChar };
  }

  return { ok: true, normalized, firstChar, lastChar };
}

function getStatusText(client, channelId) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;

  const dictionary = getDictionaryForMode(client, channelState.mode);

  return {
    mode: channelState.mode,
    isStopped: channelState.isStopped,
    lastEntry: channelState.lastEntry,
    expectedText:
      channelState.mode === "vi"
        ? channelState.expectedToken || "chưa có"
        : channelState.expectedChar || "chưa có",
    usedCount: channelState.used.size,
    playerCount: Object.keys(channelState.scores).length,
    lastPlayerId: channelState.lastPlayerId,
    dictionarySize: dictionary.count,
    topPlayers: summarizeTopPlayers(channelState.scores),
  };
}

async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
  } catch (_) {}
}

async function handleWordChainMessage(client, msg) {
  const channelState = getChannelState(client, msg.channel.id);
  if (!channelState || channelState.isStopped) return false;

  const content = typeof msg.content === "string" ? msg.content.trim() : "";
  if (!content) return false;

  const users = loadUsers();
  if (!users[msg.author.id]) {
    if (shouldShowJoinHint(client, msg.channel.id, msg.author.id)) {
      await msg.reply("⚠️ Bạn chưa có nhân vật. Dùng `-create` để bắt đầu tu luyện.");
    }
    return true;
  }

  const dictionary = getDictionaryForMode(client, channelState.mode);
  const result = validateMove(dictionary, channelState, content);

  if (!result.ok) {
    await safeReact(msg, "❌");
    return true;
  }

  channelState.used.add(result.normalized);
  channelState.scores[msg.author.id] = (channelState.scores[msg.author.id] || 0) + 1;
  channelState.lastPlayerId = msg.author.id;
  channelState.lastMoveAt = Date.now();
  if (!channelState.startedAt) channelState.startedAt = channelState.lastMoveAt;
  channelState.lastEntry = result.normalized;

  if (channelState.mode === "vi") {
    channelState.expectedToken = result.lastWord;
  } else {
    channelState.expectedChar = result.lastChar;
  }

  rewardWord(msg.author.id, WORD_REWARD_LT);
  const levelsGained = addXp(msg.author.id, WORD_REWARD_EXP);
  await safeReact(msg, "✅");

  if (levelsGained > 0) {
    const users = loadUsers();
    const updated = users[msg.author.id];
    const displayName = updated?.name || msg.author.username;
    await msg.channel.send(
      `⚡ **${displayName}** đã đột phá **${levelsGained} cấp** từ nối từ!\n` +
        `📖 Hiện tại cảnh giới: **${updated ? getRealm(updated.level) : "???"}**`
    );
  }

  if (!hasRemainingMove(dictionary, channelState)) {
    const summary = summarizeTopPlayers(channelState.scores);
    const endedBy = channelState.mode === "vi" ? channelState.expectedToken : channelState.expectedChar;

    await msg.channel.send(
      `🏁 **Ván nối từ đã kết thúc!**\n` +
        `Không còn từ hợp lệ bắt đầu bằng **${endedBy}**.\n\n` +
        `📊 **Kết quả:**\n${summary}\n\n` +
        `🔄 ${ROUND_RESTART_HINT}`
    );

    resetRound(channelState, false);
  }

  return true;
}

module.exports = {
  normalizeViText,
  normalizeEnText,
  ensureWordChainState,
  loadWordChainDictionaries,
  setupChannel,
  stopChannel,
  clearChannel,
  getChannelState,
  getStatusText,
  isWordChainChannel,
  handleWordChainMessage,
  ROUND_RESTART_HINT,
};
