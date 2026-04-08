const fs = require("fs");
const path = require("path");
const { loadUsers } = require("./storage");
const { rewardWord } = require("./currency");
const { addXp, getRealm } = require("./xp");
const {
  wordChainRewardLT,
  wordChainRewardExp,
  wordChainCorrectEmoji,
  wordChainWrongEmoji,
} = require("./config");

const WORD_REWARD_LT = wordChainRewardLT || 1;
const WORD_REWARD_EXP = wordChainRewardExp || 1;
const DEFAULT_CORRECT_EMOJI = wordChainCorrectEmoji || "✅";
const DEFAULT_WRONG_EMOJI = wordChainWrongEmoji || "❌";
const JOIN_HINT_COOLDOWN_MS = 10000;
const ROUND_RESTART_HINT = "Ván mới có thể bắt đầu bằng bất kỳ từ hợp lệ nào.";
const WORDCHAIN_STATE_PATH = path.join(__dirname, "../data/wordchain_state.json");

const DIGIT_EMOJI_VARIANTS = {
  0: ["0️⃣", "0⃣", "⓪"],
  1: ["1️⃣", "1⃣", "①", "❶", "➊", "➀"],
  2: ["2️⃣", "2⃣", "②", "❷", "➋", "➁"],
  3: ["3️⃣", "3⃣", "③", "❸", "➌", "➂"],
  4: ["4️⃣", "4⃣", "④", "❹", "➍", "➃"],
  5: ["5️⃣", "5⃣", "⑤", "❺", "➎", "➄"],
  6: ["6️⃣", "6⃣", "⑥", "❻", "➏", "➅"],
  7: ["7️⃣", "7⃣", "⑦", "❼", "➐", "➆"],
  8: ["8️⃣", "8⃣", "⑧", "❽", "➑", "➇"],
  9: ["9️⃣", "9⃣", "⑨", "❾", "➒", "➈"],
};

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

function normalizeModeText(mode, text) {
  return mode === "en" ? normalizeEnText(text) : normalizeViText(text);
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
      persistenceLoaded: false,
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
  if (!state.loaded) {
    const viPath = path.join(__dirname, "../data/wordchain_vi.txt");
    const enPath = path.join(__dirname, "../data/wordchain_en.txt");

    const viEntries = readDictionary(viPath);
    const enEntries = readDictionary(enPath);

    state.vi = buildViDictionary(viEntries);
    state.en = buildEnDictionary(enEntries);
    state.loaded = true;
  }

  if (!state.persistenceLoaded) {
    loadPersistedChannels(client);
  }

  return state;
}

function createEmojiState(correctEmoji = DEFAULT_CORRECT_EMOJI, wrongEmoji = DEFAULT_WRONG_EMOJI) {
  return {
    correctEmoji,
    wrongEmoji,
  };
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
    emojis: createEmojiState(),
  };
}

function coerceTimestamp(value) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sanitizeScores(scores) {
  const safeScores = {};
  if (!scores || typeof scores !== "object") return safeScores;

  for (const [userId, rawScore] of Object.entries(scores)) {
    const score = Number(rawScore);
    if (typeof userId === "string" && userId && Number.isFinite(score) && score > 0) {
      safeScores[userId] = Math.floor(score);
    }
  }

  return safeScores;
}

function sanitizeEmojiValue(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function deriveExpectedTokenFromEntry(mode, entry) {
  if (!entry) return null;
  if (mode === "vi") {
    const tokens = entry.split(" ");
    return tokens[tokens.length - 1] || null;
  }
  return entry[entry.length - 1] || null;
}

function serializeChannelState(channelState) {
  return {
    mode: channelState.mode,
    isStopped: !!channelState.isStopped,
    startedAt: coerceTimestamp(channelState.startedAt),
    lastMoveAt: coerceTimestamp(channelState.lastMoveAt),
    lastEntry: channelState.lastEntry || null,
    expectedToken: channelState.expectedToken || null,
    expectedChar: channelState.expectedChar || null,
    used: Array.from(channelState.used || []),
    scores: sanitizeScores(channelState.scores),
    lastPlayerId: channelState.lastPlayerId || null,
    emojis: {
      correctEmoji: sanitizeEmojiValue(channelState.emojis?.correctEmoji, DEFAULT_CORRECT_EMOJI),
      wrongEmoji: sanitizeEmojiValue(channelState.emojis?.wrongEmoji, DEFAULT_WRONG_EMOJI),
    },
  };
}

function deserializeChannelState(rawState) {
  if (!rawState || typeof rawState !== "object") return null;
  const mode = rawState.mode === "en" ? "en" : rawState.mode === "vi" ? "vi" : null;
  if (!mode) return null;

  const channelState = createChannelState(mode);
  channelState.isStopped = !!rawState.isStopped;
  channelState.startedAt = coerceTimestamp(rawState.startedAt);
  channelState.lastMoveAt = coerceTimestamp(rawState.lastMoveAt);
  channelState.scores = sanitizeScores(rawState.scores);
  channelState.lastPlayerId = typeof rawState.lastPlayerId === "string" && rawState.lastPlayerId
    ? rawState.lastPlayerId
    : null;

  channelState.emojis = createEmojiState(
    sanitizeEmojiValue(rawState.emojis?.correctEmoji, DEFAULT_CORRECT_EMOJI),
    sanitizeEmojiValue(rawState.emojis?.wrongEmoji, DEFAULT_WRONG_EMOJI)
  );

  const usedEntries = Array.isArray(rawState.used) ? rawState.used : [];
  const safeUsed = new Set();
  for (const entry of usedEntries) {
    const normalized = normalizeModeText(mode, entry);
    if (normalized) safeUsed.add(normalized);
  }
  channelState.used = safeUsed;

  const lastEntry = normalizeModeText(mode, rawState.lastEntry);
  channelState.lastEntry = lastEntry;
  if (lastEntry && !channelState.used.has(lastEntry)) {
    channelState.used.add(lastEntry);
  }

  if (mode === "vi") {
    const expectedToken = typeof rawState.expectedToken === "string" && rawState.expectedToken.trim()
      ? normalizeViText(rawState.expectedToken)
      : null;
    channelState.expectedToken = expectedToken || deriveExpectedTokenFromEntry(mode, lastEntry);
    channelState.expectedChar = null;
  } else {
    const expectedChar = typeof rawState.expectedChar === "string" && /^[a-z]$/i.test(rawState.expectedChar)
      ? rawState.expectedChar.toLowerCase()
      : null;
    channelState.expectedChar = expectedChar || deriveExpectedTokenFromEntry(mode, lastEntry);
    channelState.expectedToken = null;
  }

  if (!lastEntry) {
    channelState.expectedToken = null;
    channelState.expectedChar = null;
  }

  return channelState;
}

function savePersistedChannels(client) {
  const state = ensureWordChainState(client);
  const payload = {
    version: 1,
    channels: {},
  };

  for (const [channelId, channelState] of state.channels.entries()) {
    payload.channels[channelId] = serializeChannelState(channelState);
  }

  try {
    fs.writeFileSync(WORDCHAIN_STATE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("⚠️ Không thể lưu trạng thái nối từ:", error.message);
  }
}

function loadPersistedChannels(client) {
  const state = ensureWordChainState(client);
  if (state.persistenceLoaded) return state;
  state.persistenceLoaded = true;

  if (!fs.existsSync(WORDCHAIN_STATE_PATH)) {
    return state;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(WORDCHAIN_STATE_PATH, "utf8"));
    const channels = raw?.channels;
    if (!channels || typeof channels !== "object") return state;

    for (const [channelId, rawChannelState] of Object.entries(channels)) {
      if (!channelId) continue;
      const channelState = deserializeChannelState(rawChannelState);
      if (!channelState) continue;
      state.channels.set(channelId, channelState);
    }
  } catch (error) {
    console.error("⚠️ Không thể nạp trạng thái nối từ:", error.message);
  }

  return state;
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
  loadWordChainDictionaries(client);
  return ensureWordChainState(client).channels.get(channelId) || null;
}

function isWordChainChannel(client, channelId) {
  return !!getChannelState(client, channelId);
}

function setupChannel(client, channelId, mode) {
  loadWordChainDictionaries(client);
  const channelState = createChannelState(mode);
  ensureWordChainState(client).channels.set(channelId, channelState);
  savePersistedChannels(client);
  return channelState;
}

function stopChannel(client, channelId) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;
  resetRound(channelState, true);
  channelState.isStopped = true;
  savePersistedChannels(client);
  return channelState;
}

function clearChannel(client, channelId) {
  loadWordChainDictionaries(client);
  const deleted = ensureWordChainState(client).channels.delete(channelId);
  if (deleted) savePersistedChannels(client);
  return deleted;
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

function setChannelEmoji(client, channelId, type, emoji) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;

  if (!channelState.emojis) channelState.emojis = createEmojiState();

  if (type === "correct") {
    channelState.emojis.correctEmoji = emoji;
  } else if (type === "wrong") {
    channelState.emojis.wrongEmoji = emoji;
  } else {
    return null;
  }

  savePersistedChannels(client);
  return channelState;
}

function resetChannelEmojis(client, channelId) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;
  channelState.emojis = createEmojiState();
  savePersistedChannels(client);
  return channelState;
}

function getChannelEmojis(channelState) {
  if (!channelState?.emojis) return createEmojiState();
  return {
    correctEmoji: channelState.emojis.correctEmoji || DEFAULT_CORRECT_EMOJI,
    wrongEmoji: channelState.emojis.wrongEmoji || DEFAULT_WRONG_EMOJI,
  };
}

function getStatusText(client, channelId) {
  const channelState = getChannelState(client, channelId);
  if (!channelState) return null;

  const dictionary = getDictionaryForMode(client, channelState.mode);

  const emojis = getChannelEmojis(channelState);

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
    correctEmoji: emojis.correctEmoji,
    wrongEmoji: emojis.wrongEmoji,
  };
}

function resolveReactionEmoji(emoji) {
  if (typeof emoji !== "string") return emoji;
  const customMatch = emoji.match(/^<(a?):[A-Za-z0-9_~\-]+:(\d+)>$/);
  if (customMatch) return customMatch[2];
  return emoji;
}

function getCountReactionEmojis(count) {
  const safeCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  const digits = String(safeCount).split("");
  const seenPerDigit = {};

  return digits
    .map((digit) => {
      const numericDigit = Number(digit);
      const variants = DIGIT_EMOJI_VARIANTS[numericDigit] || [];
      const index = seenPerDigit[digit] || 0;
      seenPerDigit[digit] = index + 1;
      return variants[index] || "🔢";
    })
    .filter(Boolean);
}

async function safeReact(message, emoji) {
  try {
    await message.react(resolveReactionEmoji(emoji));
  } catch (_) {}
}

async function safeReactCount(message, count) {
  const emojis = getCountReactionEmojis(count);
  for (const emoji of emojis) {
    await safeReact(message, emoji);
  }
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

  const emojis = getChannelEmojis(channelState);

  if (channelState.lastPlayerId && channelState.lastPlayerId === msg.author.id) {
    await safeReact(msg, emojis.wrongEmoji);
    await safeReactCount(msg, channelState.used.size);
    return true;
  }

  const dictionary = getDictionaryForMode(client, channelState.mode);
  const result = validateMove(dictionary, channelState, content);

  if (!result.ok) {
    await safeReact(msg, emojis.wrongEmoji);
    await safeReactCount(msg, channelState.used.size);
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
  savePersistedChannels(client);

  await safeReact(msg, emojis.correctEmoji);
  await safeReactCount(msg, channelState.used.size);

  if (levelsGained > 0) {
    const updatedUsers = loadUsers();
    const updated = updatedUsers[msg.author.id];
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
    savePersistedChannels(client);
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
  setChannelEmoji,
  resetChannelEmojis,
  getStatusText,
  isWordChainChannel,
  handleWordChainMessage,
  ROUND_RESTART_HINT,
};
