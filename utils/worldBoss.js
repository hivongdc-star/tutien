// utils/worldBoss.js
// World Boss tuần (combo 3). Lưu state trong data/worldboss.json.
// - Reset theo ISO week (YYYY-Www)
// - Thưởng LT theo đóng góp, claim 1 lần/tuần

const fs = require("fs");
const path = require("path");
const { getISOWeekKey } = require("./questSystem");
const elements = require("./element");

const dataPath = path.join(__dirname, "../data/worldboss.json");

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  const i = Math.floor(x);
  if (typeof max === "number") return Math.max(min, Math.min(max, i));
  return Math.max(min, i);
}

function progressBar(current, max, width = 18) {
  const cur = Math.max(0, Number(current) || 0);
  const mx = Math.max(1, Number(max) || 1);
  const ratio = Math.max(0, Math.min(1, cur / mx));
  const filled = Math.round(ratio * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function loadBossState() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch {
    return { version: 1 };
  }
}

function saveBossState(state) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(state, null, 2));
  } catch {
    // ignore
  }
}

function pickBossName() {
  const pool = [
    "Huyết Linh Vương",
    "Hắc Vực Cự Thú",
    "U Minh Ma Long",
    "Thiên Ngoại Dị Thú",
    "Cổ Ấn Hung Thú",
    "Tà Ảnh Ma Vương",
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickBossElement() {
  const keys = Object.keys(elements.display || {});
  const list = keys.length ? keys : ["kim", "moc", "thuy", "hoa", "tho"];
  return list[Math.floor(Math.random() * list.length)];
}

function computeMaxHpByPopulation(users) {
  const ids = Object.keys(users || {});
  const n = ids.filter((id) => users[id] && (Number(users[id].level) || 0) > 0).length;
  const base = 800_000;
  const per = 120_000;
  return clampInt(base + n * per, 800_000, 6_000_000);
}

function ensureBoss(users, now = Date.now()) {
  const state = loadBossState();
  const wk = getISOWeekKey(now);

  if (!state.boss || state.weekKey !== wk) {
    const maxHp = computeMaxHpByPopulation(users);
    state.weekKey = wk;
    state.boss = {
      name: pickBossName(),
      element: pickBossElement(),
      maxHp,
      hp: maxHp,
      createdAt: now,
      killedAt: null,
      contributions: {},
      claimed: {},
    };
    saveBossState(state);
  }

  // sanitize
  const b = state.boss;
  b.maxHp = clampInt(b.maxHp, 1, 20_000_000);
  b.hp = clampInt(b.hp, 0, b.maxHp);
  if (!b.contributions || typeof b.contributions !== "object") b.contributions = {};
  if (!b.claimed || typeof b.claimed !== "object") b.claimed = {};

  return state;
}

function topContributors(boss, users, limit = 5) {
  const entries = Object.entries(boss.contributions || {})
    .map(([uid, dmg]) => ({ uid, dmg: Math.max(0, Number(dmg) || 0) }))
    .filter((x) => x.dmg > 0)
    .sort((a, b) => b.dmg - a.dmg)
    .slice(0, limit);

  return entries.map((x, idx) => {
    const u = users?.[x.uid];
    const name = u?.name || `@${x.uid}`;
    return { rank: idx + 1, uid: x.uid, name, dmg: x.dmg };
  });
}

function computeRewardPoolLt(boss) {
  // Pool LT tỷ lệ theo HP để scale theo server.
  // 800k -> 800 LT, 6m -> 6000 LT
  return clampInt(Math.round((Number(boss.maxHp) || 0) / 1000), 500, 10_000);
}

function computeRewardForUser(boss, userId) {
  const dmg = Math.max(0, Number(boss.contributions?.[userId]) || 0);
  const total = Object.values(boss.contributions || {}).reduce((a, v) => a + (Math.max(0, Number(v) || 0)), 0);
  if (dmg <= 0 || total <= 0) return { dmg, total, lt: 0, bonus: 0, rank: null };

  const pool = computeRewardPoolLt(boss);
  const share = Math.floor((pool * dmg) / total);

  // bonus top 3
  const sorted = Object.entries(boss.contributions || {})
    .map(([uid, d]) => ({ uid, dmg: Math.max(0, Number(d) || 0) }))
    .sort((a, b) => b.dmg - a.dmg);
  const rankIdx = sorted.findIndex((x) => x.uid === userId);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  let bonus = 0;
  if (rank === 1) bonus = 1000;
  else if (rank === 2) bonus = 600;
  else if (rank === 3) bonus = 300;

  return { dmg, total, lt: Math.max(0, share + bonus), bonus, rank };
}

function applyDamage(state, userId, dmg, now = Date.now()) {
  const boss = state?.boss;
  if (!boss) return { ok: false, message: "Boss chưa sẵn sàng." };
  if (boss.killedAt) return { ok: false, message: "Boss đã bị hạ gục." };

  const d = clampInt(dmg, 1, 2_000_000);
  boss.hp = clampInt(boss.hp - d, 0, boss.maxHp);
  boss.contributions[userId] = Math.max(0, Number(boss.contributions[userId]) || 0) + d;

  let killed = false;
  if (boss.hp <= 0) {
    boss.hp = 0;
    boss.killedAt = now;
    killed = true;
  }

  saveBossState(state);
  return { ok: true, dmg: d, killed, hp: boss.hp, maxHp: boss.maxHp };
}

function canClaim(boss, userId) {
  if (!boss?.killedAt) return false;
  if (!boss?.contributions?.[userId]) return false;
  if (boss?.claimed?.[userId]) return false;
  return true;
}

function claimReward(state, userId) {
  const boss = state?.boss;
  if (!boss) return { ok: false, message: "Boss chưa sẵn sàng." };
  if (!boss.killedAt) return { ok: false, message: "Boss chưa bị hạ gục." };
  if (!boss.contributions?.[userId]) return { ok: false, message: "Bạn không có đóng góp tuần này." };
  if (boss.claimed?.[userId]) return { ok: false, message: "Bạn đã nhận thưởng rồi." };

  const reward = computeRewardForUser(boss, userId);
  boss.claimed[userId] = true;
  saveBossState(state);

  return { ok: true, rewardLt: reward.lt, info: reward };
}

function bossSummary(state, users) {
  const boss = state?.boss;
  if (!boss) return null;

  const elTxt = elements.display?.[boss.element] || boss.element;
  const hpText = `${boss.hp.toLocaleString("vi-VN")} / ${boss.maxHp.toLocaleString("vi-VN")}`;
  const bar = progressBar(boss.hp, boss.maxHp);
  const top = topContributors(boss, users, 5);
  const pool = computeRewardPoolLt(boss);

  return {
    weekKey: state.weekKey,
    name: boss.name,
    element: boss.element,
    elementText: elTxt,
    maxHp: boss.maxHp,
    hp: boss.hp,
    hpText,
    bar,
    killedAt: boss.killedAt,
    poolLt: pool,
    top,
  };
}

module.exports = {
  loadBossState,
  saveBossState,
  ensureBoss,
  bossSummary,
  applyDamage,
  claimReward,
  canClaim,
  computeRewardForUser,
  computeRewardPoolLt,
};
