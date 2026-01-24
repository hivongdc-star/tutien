// utils/xp.js
//
// Quản lý EXP, Level Up, cập nhật chỉ số theo Race + Element
// ĐÃ LOẠI BỎ hoàn toàn RELA (không có ringBonus, partnerBonus)

const { loadUsers, saveUsers } = require("./storage");
const realms = require("./realms");
const elements = require("./element");  // ✅ đúng file: element.js
const races = require("./races");
const { baseExp, expMultiplier } = require("./config");

/**
 * EXP cần để lên cấp
 */
function getExpNeeded(level) {
  return Math.floor(baseExp * Math.pow(expMultiplier, level - 1));
}

/**
 * Tính % bonus EXP chỉ từ TRANG BỊ
 * (đã bỏ bonus từ nhẫn cưới / relationships)
 */
function computeExpBonusPercent(user) {
  let bonus = 0;

  if (user && user.equipments) {
    for (const key in user.equipments) {
      const it = user.equipments[key];
      if (!it) continue;

      // exp_percent đặt trực tiếp trên item
      if (typeof it.exp_percent === "number") {
        bonus += it.exp_percent;
      }

      // bonus.exp_percent trong object con
      if (it.bonus && typeof it.bonus.exp_percent === "number") {
        bonus += it.bonus.exp_percent;
      }
    }
  }

  return bonus;
}

/**
 * Cộng tăng chỉ số theo chủng tộc mỗi lần lên cấp
 */
function applyRaceBonus(stats, raceKey) {
  const race = races[raceKey];
  if (!race || !race.gain) return stats;

  const g = race.gain;
  return {
    hp: stats.hp + (g.hp || 0),
    mp: stats.mp + (g.mp || 0),
    atk: stats.atk + (g.atk || 0),
    def: stats.def + (g.def || 0),
    spd: stats.spd + (g.spd || 0),
  };
}

/**
 * Cộng tăng chỉ số theo hệ mỗi lần lên cấp
 */
function applyElementBonus(stats, elementKey) {
  const el = elements[elementKey];
  if (!el) return stats;

  return {
    hp: stats.hp + (el.hp || 0),
    mp: stats.mp + (el.mp || 0),
    atk: stats.atk + (el.atk || 0),
    def: stats.def + (el.def || 0),
    spd: stats.spd + (el.spd || 0),
  };
}

/**
 * Thêm EXP cho 1 user
 */
function addXp(userId, amount) {
  const users = loadUsers();
  const user = users[userId];
  if (!user) return null;

  // Tính bonus EXP %
  const bonusPercent = computeExpBonusPercent(user);
  const realGain = Math.floor(amount * (1 + bonusPercent / 100));

  user.exp = (user.exp || 0) + realGain;
  if (!user.level) user.level = 1;

  let upgraded = false;

  // Nếu đủ EXP thì lên cấp nhiều lần
  while (user.exp >= getExpNeeded(user.level)) {
    user.exp -= getExpNeeded(user.level);
    user.level += 1;
    upgraded = true;

    // Đảm bảo stats có đủ field
    if (!user.stats) {
      user.stats = { hp: 0, mp: 0, atk: 0, def: 0, spd: 0 };
    }

    // Áp dụng tăng theo Race và Element
    user.stats = applyRaceBonus(user.stats, user.race);
    user.stats = applyElementBonus(user.stats, user.element);
  }

  saveUsers(users);

  return {
    user,
    gained: realGain,
    levelUp: upgraded,
    realm: getRealm(user.level),
  };
}

/**
 * Lấy cảnh giới từ level
 * Mỗi 10 level = 1 cảnh giới trong mảng realms
 */
function getRealm(level) {
  if (!level || level < 1) level = 1;
  const realmIndex = Math.floor((level - 1) / 10);
  const stage = ((level - 1) % 10) + 1;
  const name = realms[realmIndex] || "Phàm Nhân";
  return `${name} - Tầng ${stage}`;
}

module.exports = {
  getExpNeeded,
  computeExpBonusPercent,
  applyRaceBonus,
  applyElementBonus,
  getRealm,
  addXp,
};
