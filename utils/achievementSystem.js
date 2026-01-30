// utils/achievementSystem.js
// Thành tựu (lazy update). Tự cấp danh hiệu (string) vào user.titles.

const ACHIEVEMENTS = [
  {
    id: "A_FISH_1000",
    stat: "fish",
    need: 1000,
    title: "Ngư Vương",
    desc: "Tổng câu cá đạt 1000 lần.",
  },
  {
    id: "A_MINE_500",
    stat: "mine",
    need: 500,
    title: "Khoáng Sư",
    desc: "Tổng đào khoáng đạt 500 lần.",
  },
  {
    id: "A_DG_100",
    stat: "dungeonFloor",
    need: 100,
    title: "Động Chủ",
    desc: "Tổng thông quan dungeon đạt 100 tầng (tính theo tầng).",
  },
  {
    id: "A_BOSS_500K",
    stat: "bossDamage",
    need: 500000,
    title: "Diệt Thú",
    desc: "Tổng sát thương World Boss đạt 500.000.",
  },
  {
    id: "A_ENH_PLUS10",
    stat: "enhPlus10",
    need: 1,
    title: "Rèn Thần",
    desc: "Cường hóa bất kỳ trang bị lên +10.",
  },
  {
    id: "A_ENH_PLUS15",
    stat: "enhPlus15",
    need: 1,
    title: "Rèn Tiên",
    desc: "Cường hóa bất kỳ trang bị lên +15.",
  },
];

function ensureAchv(user) {
  if (!user) return null;
  if (!user.achvStats || typeof user.achvStats !== "object") user.achvStats = {};
  if (!user.achievements || typeof user.achievements !== "object") user.achievements = {};
  if (!Array.isArray(user.titles)) user.titles = [];

  const s = user.achvStats;
  s.fish = Math.max(0, Math.floor(Number(s.fish) || 0));
  s.mine = Math.max(0, Math.floor(Number(s.mine) || 0));
  s.dungeonFloor = Math.max(0, Math.floor(Number(s.dungeonFloor) || 0));
  s.bossDamage = Math.max(0, Math.floor(Number(s.bossDamage) || 0));
  s.enhPlus10 = Math.max(0, Math.floor(Number(s.enhPlus10) || 0));
  s.enhPlus15 = Math.max(0, Math.floor(Number(s.enhPlus15) || 0));

  return user;
}

function addTitle(user, title) {
  if (!title) return false;
  if (!Array.isArray(user.titles)) user.titles = [];
  if (user.titles.includes(title)) return false;
  user.titles.push(title);
  return true;
}

function checkUnlocks(user) {
  ensureAchv(user);
  const s = user.achvStats;
  const unlocked = [];

  for (const a of ACHIEVEMENTS) {
    if (user.achievements[a.id]) continue;
    const val = Math.max(0, Math.floor(Number(s[a.stat]) || 0));
    if (val < a.need) continue;

    user.achievements[a.id] = true;
    if (addTitle(user, a.title)) unlocked.push(a.title);
  }

  return unlocked;
}

function recordEvent(user, event, amount = 1) {
  ensureAchv(user);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add) return [];

  switch (event) {
    case "fish":
      user.achvStats.fish += add;
      break;
    case "mine":
      user.achvStats.mine += add;
      break;
    case "dungeon_floor":
      user.achvStats.dungeonFloor += add;
      break;
    case "boss_damage":
      user.achvStats.bossDamage += add;
      break;
    case "enh_plus10":
      user.achvStats.enhPlus10 = Math.max(1, user.achvStats.enhPlus10);
      break;
    case "enh_plus15":
      user.achvStats.enhPlus15 = Math.max(1, user.achvStats.enhPlus15);
      break;
    default:
      break;
  }

  return checkUnlocks(user);
}

module.exports = {
  ACHIEVEMENTS,
  ensureAchv,
  recordEvent,
  checkUnlocks,
};
