// utils/questSystem.js
// Nhiệm vụ ngày/tuần (lazy update) — additive, không phá schema cũ.

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getDailyKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ISO week key: YYYY-Www
function getISOWeekKey(now = Date.now()) {
  const d = new Date(now);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; // 1..7 (Mon..Sun)
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // shift to Thursday
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${pad2(weekNo)}`;
}

const DAILY_QUESTS = [
  {
    id: "D_FISH_15",
    scope: "daily",
    event: "fish",
    target: 15,
    rewardLt: 160,
    name: "Ngư Tang Nhất Nhật",
    desc: "Câu cá 15 lần.",
  },
  {
    id: "D_MINE_10",
    scope: "daily",
    event: "mine",
    target: 10,
    rewardLt: 180,
    name: "Khai Mạch Nhất Nhật",
    desc: "Đào khoáng 10 lần.",
  },
  {
    id: "D_DG_8",
    scope: "daily",
    event: "dungeon_floor",
    target: 8,
    rewardLt: 220,
    name: "Động Phủ Nhất Nhật",
    desc: "Thông quan 8 tầng dungeon (tính theo tầng).",
  },
  {
    id: "D_BOSS_20K",
    scope: "daily",
    event: "boss_damage",
    target: 20000,
    rewardLt: 260,
    name: "Thí Luyện Nhất Nhật",
    desc: "Gây 20.000 sát thương lên World Boss.",
  },
];

const WEEKLY_QUESTS = [
  {
    id: "W_FISH_200",
    scope: "weekly",
    event: "fish",
    target: 200,
    rewardLt: 1800,
    name: "Ngư Hải Nhất Chu",
    desc: "Câu cá 200 lần.",
  },
  {
    id: "W_MINE_120",
    scope: "weekly",
    event: "mine",
    target: 120,
    rewardLt: 2200,
    name: "Khoáng Hải Nhất Chu",
    desc: "Đào khoáng 120 lần.",
  },
  {
    id: "W_DG_60",
    scope: "weekly",
    event: "dungeon_floor",
    target: 60,
    rewardLt: 2800,
    name: "Động Chủ Nhất Chu",
    desc: "Thông quan 60 tầng dungeon (tính theo tầng).",
  },
  {
    id: "W_BOSS_200K",
    scope: "weekly",
    event: "boss_damage",
    target: 200000,
    rewardLt: 2400,
    name: "Tru Thú Nhất Chu",
    desc: "Gây 200.000 sát thương lên World Boss.",
  },
];

function ensureQuestScope(scopeState, key, defs) {
  if (!scopeState || typeof scopeState !== "object") return;

  if (scopeState.key !== key || !scopeState.items || typeof scopeState.items !== "object") {
    scopeState.key = key;
    scopeState.items = {};
    for (const q of defs) {
      scopeState.items[q.id] = { progress: 0, claimed: false };
    }
    return;
  }

  for (const q of defs) {
    if (!scopeState.items[q.id]) scopeState.items[q.id] = { progress: 0, claimed: false };
    const it = scopeState.items[q.id];
    if (!Number.isFinite(it.progress)) it.progress = 0;
    it.progress = Math.max(0, Math.floor(it.progress));
    if (typeof it.claimed !== "boolean") it.claimed = Boolean(it.claimed);
  }
}

function ensureQuestState(user, now = Date.now()) {
  if (!user) return null;
  if (!user.quests || typeof user.quests !== "object") user.quests = {};
  if (!user.quests.daily || typeof user.quests.daily !== "object") user.quests.daily = {};
  if (!user.quests.weekly || typeof user.quests.weekly !== "object") user.quests.weekly = {};

  ensureQuestScope(user.quests.daily, getDailyKey(now), DAILY_QUESTS);
  ensureQuestScope(user.quests.weekly, getISOWeekKey(now), WEEKLY_QUESTS);

  return user;
}

function getQuestDefs(scope) {
  return scope === "weekly" ? WEEKLY_QUESTS : DAILY_QUESTS;
}

function recordEvent(user, event, amount = 1, now = Date.now()) {
  if (!user) return false;
  ensureQuestState(user, now);

  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add) return false;

  let changed = false;

  for (const scope of ["daily", "weekly"]) {
    const defs = getQuestDefs(scope);
    const st = user.quests?.[scope];
    if (!st?.items) continue;

    for (const q of defs) {
      if (q.event !== event) continue;
      const it = st.items[q.id];
      if (!it || it.claimed) continue;
      const before = it.progress || 0;
      const after = Math.min(q.target, before + add);
      if (after !== before) {
        it.progress = after;
        changed = true;
      }
    }
  }

  return changed;
}

function getQuestProgress(user, scope, now = Date.now()) {
  ensureQuestState(user, now);
  const defs = getQuestDefs(scope);
  const st = user.quests?.[scope];
  const items = st?.items || {};

  return defs.map((q) => {
    const it = items[q.id] || { progress: 0, claimed: false };
    const prog = Math.max(0, Math.floor(Number(it.progress) || 0));
    return {
      ...q,
      progress: Math.min(q.target, prog),
      claimed: Boolean(it.claimed),
      done: prog >= q.target,
    };
  });
}

function canClaim(user, scope, questId, now = Date.now()) {
  const list = getQuestProgress(user, scope, now);
  const q = list.find((x) => x.id === questId);
  return Boolean(q && q.done && !q.claimed);
}

function claim(user, scope, questId, now = Date.now()) {
  if (!user) return { ok: false, message: "❌ Không có user." };
  ensureQuestState(user, now);

  const defs = getQuestDefs(scope);
  const q = defs.find((x) => x.id === questId);
  if (!q) return { ok: false, message: "❌ Nhiệm vụ không hợp lệ." };

  const st = user.quests?.[scope];
  if (!st?.items?.[questId]) st.items[questId] = { progress: 0, claimed: false };

  const it = st.items[questId];
  if (it.claimed) return { ok: false, message: "⚠️ Bạn đã nhận thưởng nhiệm vụ này rồi." };

  const prog = Math.max(0, Math.floor(Number(it.progress) || 0));
  if (prog < q.target) return { ok: false, message: "❌ Chưa hoàn thành nhiệm vụ." };

  it.claimed = true;
  const lt = Math.max(0, Math.floor(Number(q.rewardLt) || 0));
  user.lt = (Number(user.lt) || 0) + lt;

  return { ok: true, rewardLt: lt };
}

module.exports = {
  getDailyKey,
  getISOWeekKey,
  ensureQuestState,
  recordEvent,
  getQuestProgress,
  canClaim,
  claim,
  DAILY_QUESTS,
  WEEKLY_QUESTS,
};
