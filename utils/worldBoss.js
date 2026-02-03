// utils/worldBoss.js
// World Boss tuần (combo 3). Lưu state trong data/worldboss.json.
// - Reset theo ISO week (YYYY-Www)
// - Thưởng LT theo đóng góp, claim 1 lần/tuần

const fs = require("fs");
const path = require("path");
const { randomInt } = require("crypto");
const { getISOWeekKey } = require("./questSystem");
const elements = require("./element");
const { loadOreDB } = require("./mining");
const { createGearFromOres } = require("./forge");

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
      // Boss loot: trang bị "đỏ" (Tiên) phân phối theo tỷ lệ sát thương
      redDrops: {}, // userId -> gear[]
      redDropTotal: 0,
      redDropsComputedAt: null,
    };
    saveBossState(state);
  }

  // sanitize
  const b = state.boss;
  b.maxHp = clampInt(b.maxHp, 1, 20_000_000);
  b.hp = clampInt(b.hp, 0, b.maxHp);
  if (!b.contributions || typeof b.contributions !== "object") b.contributions = {};
  if (!b.claimed || typeof b.claimed !== "object") b.claimed = {};
  if (!b.redDrops || typeof b.redDrops !== "object") b.redDrops = {};
  b.redDropTotal = clampInt(b.redDropTotal, 0, 10_000);
  if (b.redDropsComputedAt && !Number.isFinite(Number(b.redDropsComputedAt))) b.redDropsComputedAt = null;

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
  // Tăng mạnh phần thưởng boss: pool LT tỷ lệ theo HP.
  // 800k -> ~80k LT, 6m -> ~600k LT
  return clampInt(Math.round((Number(boss.maxHp) || 0) / 10), 50_000, 2_000_000);
}

function computeRewardForUser(boss, userId) {
  const dmg = Math.max(0, Number(boss.contributions?.[userId]) || 0);
  const total = Object.values(boss.contributions || {}).reduce((a, v) => a + (Math.max(0, Number(v) || 0)), 0);
  if (dmg <= 0 || total <= 0) return { dmg, total, lt: 0, bonus: 0, rank: null };

  const pool = computeRewardPoolLt(boss);
  const share = Math.floor((pool * dmg) / total);

  // bonus top 3 (scale theo pool, để server lớn thưởng đáng kể)
  const sorted = Object.entries(boss.contributions || {})
    .map(([uid, d]) => ({ uid, dmg: Math.max(0, Number(d) || 0) }))
    .sort((a, b) => b.dmg - a.dmg);
  const rankIdx = sorted.findIndex((x) => x.uid === userId);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  let bonus = 0;
  if (rank === 1) bonus = Math.round(pool * 0.25);
  else if (rank === 2) bonus = Math.round(pool * 0.15);
  else if (rank === 3) bonus = Math.round(pool * 0.08);

  return { dmg, total, lt: Math.max(0, share + bonus), bonus, rank };
}

function pickWeightedRemainder(list) {
  // list: { uid, w } with w>=0
  let total = 0;
  for (const it of list) total += Math.max(0, Number(it.w) || 0);
  if (!Number.isFinite(total) || total <= 0) return list[0]?.uid;
  let r = randomInt(1, Math.floor(total * 1_000_000) + 1) / 1_000_000; // 0..total (float)
  for (const it of list) {
    r -= Math.max(0, Number(it.w) || 0);
    if (r <= 0) return it.uid;
  }
  return list[list.length - 1]?.uid;
}

function computeRedDrops(boss) {
  // Only once per kill
  if (!boss || boss.redDropsComputedAt) return;
  const contribEntries = Object.entries(boss.contributions || {})
    .map(([uid, dmg]) => ({ uid, dmg: Math.max(0, Number(dmg) || 0) }))
    .filter((x) => x.dmg > 0)
    .sort((a, b) => b.dmg - a.dmg);
  const n = contribEntries.length;

  // Tổng số trang bị đỏ drop (tăng mạnh phần thưởng, nhưng có cap an toàn)
  const totalDrops = clampInt(Math.round(4 + Math.sqrt(n)), 5, 25);
  boss.redDropTotal = totalDrops;
  boss.redDrops = {};

  if (!n || totalDrops <= 0) {
    boss.redDropsComputedAt = Date.now();
    return;
  }

  const totalDmg = contribEntries.reduce((a, it) => a + it.dmg, 0);
  if (totalDmg <= 0) {
    boss.redDropsComputedAt = Date.now();
    return;
  }

  // 1) chia phần nguyên
  const alloc = {};
  const rema = [];
  let used = 0;
  for (const it of contribEntries) {
    const exact = (totalDrops * it.dmg) / totalDmg;
    const base = Math.floor(exact);
    alloc[it.uid] = base;
    used += base;
    rema.push({ uid: it.uid, w: exact - base });
  }

  // 2) chia phần dư theo remainder (weighted)
  let left = totalDrops - used;
  for (let i = 0; i < left; i++) {
    const uid = pickWeightedRemainder(rema);
    if (!uid) break;
    alloc[uid] = (alloc[uid] || 0) + 1;
  }

  // 3) generate gear tier "tien" (đỏ)
  const db = loadOreDB();
  const tienPool = Array.isArray(db) ? db.filter((o) => String(o?.tier) === "tien") : [];
  const slotPool = ["weapon", "armor", "boots", "bracelet"];

  function randomOreId() {
    const src = tienPool.length ? tienPool : db;
    if (!src.length) return null;
    const pick = src[randomInt(0, src.length)];
    return pick?.id || null;
  }

  for (const [uid, cnt0] of Object.entries(alloc)) {
    const cnt = clampInt(cnt0, 0, 99);
    if (cnt <= 0) continue;
    const list = [];
    for (let k = 0; k < cnt; k++) {
      const oreId = randomOreId();
      if (!oreId) break;
      const oreIds = [oreId, oreId, oreId, oreId, oreId];
      const slot = slotPool[randomInt(0, slotPool.length)];
      const gear = createGearFromOres({ slot, oreIds });
      list.push(gear);
    }
    if (list.length) boss.redDrops[uid] = list;
  }

  boss.redDropsComputedAt = Date.now();
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
    computeRedDrops(boss);
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

  // Nếu boss đã chết trước khi update, có thể chưa tính drop.
  if (boss.killedAt && !boss.redDropsComputedAt) computeRedDrops(boss);

  const reward = computeRewardForUser(boss, userId);
  const drops = Array.isArray(boss?.redDrops?.[userId]) ? boss.redDrops[userId] : [];
  // xoá để shrink state (claimed đã chặn double-claim)
  if (boss?.redDrops && boss.redDrops[userId]) delete boss.redDrops[userId];
  boss.claimed[userId] = true;
  saveBossState(state);

  return { ok: true, rewardLt: reward.lt, info: reward, drops };
}

function bossSummary(state, users) {
  const boss = state?.boss;
  if (!boss) return null;

  const elTxt = elements.display?.[boss.element] || boss.element;
  const hpText = `${boss.hp.toLocaleString("vi-VN")} / ${boss.maxHp.toLocaleString("vi-VN")}`;
  const bar = progressBar(boss.hp, boss.maxHp);
  const top = topContributors(boss, users, 5);
  const pool = computeRewardPoolLt(boss);

  const bonusTop1 = Math.round(pool * 0.25);
  const bonusTop2 = Math.round(pool * 0.15);
  const bonusTop3 = Math.round(pool * 0.08);

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
    bonusTop: { 1: bonusTop1, 2: bonusTop2, 3: bonusTop3 },
    redDropTotal: clampInt(boss.redDropTotal, 0, 10_000),
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
