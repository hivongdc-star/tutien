// utils/achievementSystem.js
// Thành tựu (lazy update). Tự cấp danh hiệu (string) vào user.titles.
// Lưu ý: chỉ additive, không phá các id cũ.

const ACHIEVEMENTS = [
  // =====================
  // Câu cá
  // =====================
  {
    id: "A_FISH_1000",
    stat: "fish",
    need: 1000,
    title: "Ngư Vương",
    desc: "Câu cá 1.000 lần — ngư tâm bất loạn, thủy đạo tự khai.",
    group: "fish",
  },
  {
    id: "A_FISH_2000",
    stat: "fish",
    need: 2000,
    title: "Ngư Thống",
    desc: "Câu cá 2.000 lần — một cần định sóng, bầy cá quy phục.",
    group: "fish",
  },
  {
    id: "A_FISH_10000",
    stat: "fish",
    need: 10000,
    title: "Ngư Thánh",
    desc: "Câu cá 10.000 lần — thủy vực nghe danh, linh ngư tự đến.",
    group: "fish",
  },
  {
    id: "A_FISH_50000",
    stat: "fish",
    need: 50000,
    title: "Ngư Tiên",
    desc: "Câu cá 50.000 lần — một niệm thông thiên, vạn thủy triều bái.",
    group: "fish",
  },

  // =====================
  // Khoáng / đào
  // =====================
  {
    id: "A_MINE_500",
    stat: "mine",
    need: 500,
    title: "Khoáng Sư",
    desc: "Đào khoáng 500 lần — khai mạch lập công.",
    group: "mine",
  },
  {
    id: "A_MINE_2500",
    stat: "mine",
    need: 2500,
    title: "Khoáng Tướng",
    desc: "Đào khoáng 2.500 lần — một búa định mạch, địa khí tụ về.",
    group: "mine",
  },
  {
    id: "A_MINE_10000",
    stat: "mine",
    need: 10000,
    title: "Khoáng Tổ",
    desc: "Đào khoáng 10.000 lần — mở khoáng mạch, dựng nền tông môn.",
    group: "mine",
  },
  {
    id: "A_MINE_50000",
    stat: "mine",
    need: 50000,
    title: "Khoáng Đế",
    desc: "Đào khoáng 50.000 lần — địa mạch cúi đầu, thạch linh xưng thần.",
    group: "mine",
  },

  // =====================
  // Dungeon
  // =====================
  {
    id: "A_DG_100",
    stat: "dungeonFloor",
    need: 100,
    title: "Động Chủ",
    desc: "Thông quan 100 tầng — vào động phủ như về nhà.",
    group: "dungeon",
  },
  {
    id: "A_DG_500",
    stat: "dungeonFloor",
    need: 500,
    title: "Kiếp Đồ",
    desc: "Thông quan 500 tầng — mỗi tầng một kiếp, tâm không động.",
    group: "dungeon",
  },
  {
    id: "A_DG_2000",
    stat: "dungeonFloor",
    need: 2000,
    title: "Kiếp Chủ",
    desc: "Thông quan 2.000 tầng — kiếp nạn tới, ngươi định kiếp.",
    group: "dungeon",
  },
  {
    id: "A_DG_10000",
    stat: "dungeonFloor",
    need: 10000,
    title: "Vạn Kiếp Bất Tử",
    desc: "Thông quan 10.000 tầng — vạn kiếp không rã, thân tâm như sắt.",
    group: "dungeon",
  },

  // =====================
  // World Boss
  // =====================
  {
    id: "A_BOSS_500K",
    stat: "bossDamage",
    need: 500000,
    title: "Diệt Thú",
    desc: "Tổng sát thương World Boss 500.000 — một đao trấn hung.",
    group: "boss",
  },
  {
    id: "A_BOSS_2M",
    stat: "bossDamage",
    need: 2000000,
    title: "Ma Uyên Sát",
    desc: "Tổng sát thương World Boss 2.000.000 — máu ma nhuộm áo.",
    group: "boss",
  },
  {
    id: "A_BOSS_10M",
    stat: "bossDamage",
    need: 10000000,
    title: "Ma Uyên Kẻ Chém",
    desc: "Tổng sát thương World Boss 10.000.000 — một chém định thiên uy.",
    group: "boss",
  },
  {
    id: "A_BOSS_RANK1",
    stat: "bossRank1",
    need: 1,
    title: "Đệ Nhất Trảm Ma",
    desc: "Đạt Top #1 đóng góp World Boss trong một tuần.",
    group: "boss",
  },

  // =====================
  // Cường hoá
  // =====================
  {
    id: "A_ENH_PLUS5",
    stat: "enhPlus5",
    need: 1,
    title: "Linh Khí Sơ Thành",
    desc: "Cường hoá bất kỳ trang bị lên +5 — linh khí bắt đầu tụ.",
    group: "enhance",
  },
  {
    id: "A_ENH_PLUS10",
    stat: "enhPlus10",
    need: 1,
    title: "Rèn Thần",
    desc: "Cường hóa bất kỳ trang bị lên +10.",
    group: "enhance",
  },
  {
    id: "A_ENH_PLUS15",
    stat: "enhPlus15",
    need: 1,
    title: "Rèn Tiên",
    desc: "Cường hóa bất kỳ trang bị lên +15.",
    group: "enhance",
  },
  {
    id: "A_ENH_FAIL_50",
    stat: "enhFail",
    need: 50,
    title: "Bại Mà Không Nản",
    desc: "Thất bại cường hoá 50 lần — bại để luyện tâm.",
    group: "enhance",
  },
  {
    id: "A_ENH_FAIL_200",
    stat: "enhFail",
    need: 200,
    title: "Kiếp Hỏa Tôi Luyện",
    desc: "Thất bại cường hoá 200 lần — kiếp hỏa rèn xương.",
    group: "enhance",
  },

  // =====================
  // Kinh tế (bán đồ)
  // =====================
  {
    id: "A_SELL_ORE_500",
    stat: "oreSold",
    need: 500,
    title: "Tán Tài Luyện Đạo",
    desc: "Bán tổng 500 viên khoáng — tán tài để đổi đại đạo.",
    group: "economy",
  },
  {
    id: "A_SELL_ORE_5000",
    stat: "oreSold",
    need: 5000,
    title: "Đổi Đá Luyện Tâm",
    desc: "Bán tổng 5.000 viên khoáng — đá đi, tâm sáng.",
    group: "economy",
  },
  {
    id: "A_SELL_GEAR_50",
    stat: "gearSold",
    need: 50,
    title: "Phế Binh Tái Tạo",
    desc: "Bán 50 món trang bị — bỏ cũ lập mới, đạo lộ thông suốt.",
    group: "economy",
  },
];

function ensureAchv(user) {
  if (!user) return null;
  if (!user.achvStats || typeof user.achvStats !== "object") user.achvStats = {};
  if (!user.achievements || typeof user.achievements !== "object") user.achievements = {};
  if (!Array.isArray(user.titles)) user.titles = [];

  const s = user.achvStats;

  // core
  s.fish = Math.max(0, Math.floor(Number(s.fish) || 0));
  s.mine = Math.max(0, Math.floor(Number(s.mine) || 0));
  s.dungeonFloor = Math.max(0, Math.floor(Number(s.dungeonFloor) || 0));
  s.bossDamage = Math.max(0, Math.floor(Number(s.bossDamage) || 0));

  // boss
  s.bossRank1 = Math.max(0, Math.floor(Number(s.bossRank1) || 0));

  // enhance
  s.enhPlus5 = Math.max(0, Math.floor(Number(s.enhPlus5) || 0));
  s.enhPlus10 = Math.max(0, Math.floor(Number(s.enhPlus10) || 0));
  s.enhPlus15 = Math.max(0, Math.floor(Number(s.enhPlus15) || 0));
  s.enhFail = Math.max(0, Math.floor(Number(s.enhFail) || 0));

  // economy
  s.oreSold = Math.max(0, Math.floor(Number(s.oreSold) || 0));
  s.gearSold = Math.max(0, Math.floor(Number(s.gearSold) || 0));

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
    case "boss_rank1":
      user.achvStats.bossRank1 += add;
      break;

    case "enh_plus5":
      user.achvStats.enhPlus5 = Math.max(1, user.achvStats.enhPlus5);
      break;
    case "enh_plus10":
      user.achvStats.enhPlus10 = Math.max(1, user.achvStats.enhPlus10);
      break;
    case "enh_plus15":
      user.achvStats.enhPlus15 = Math.max(1, user.achvStats.enhPlus15);
      break;
    case "enh_fail":
      user.achvStats.enhFail += add;
      break;

    case "sell_ore":
      user.achvStats.oreSold += add;
      break;
    case "sell_gear":
      user.achvStats.gearSold += add;
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
