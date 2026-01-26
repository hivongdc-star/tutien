// utils/xp.js
//
// Quản lý EXP, Level Up, cập nhật chỉ số theo Race + Element
// ĐÃ LOẠI BỎ hoàn toàn RELA (không có ringBonus, partnerBonus)

const { loadUsers, saveUsers } = require("./storage");
const realms = require("./realms");
const elements = require("./element"); // element.js (có thêm .display)
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
 * Áp dụng tăng trưởng chỉ số đúng schema hiện tại (flat fields):
 * maxHp/maxMp/atk/def/spd (+full heal hp/mp khi lên cấp)
 */
function applyLevelStatGrowth(user) {
  const raceKey = user.race || "nhan";
  const elementKey = user.element || "kim";

  // Backfill tối thiểu
  if (!Number.isFinite(user.maxHp)) user.maxHp = Number.isFinite(user.hp) ? user.hp : 100;
  if (!Number.isFinite(user.maxMp)) user.maxMp = Number.isFinite(user.mp) ? user.mp : 100;
  if (!Number.isFinite(user.atk)) user.atk = 10;
  if (!Number.isFinite(user.def)) user.def = 10;
  if (!Number.isFinite(user.spd)) user.spd = 10;

  const raceGain = races[raceKey]?.gain || {};
  const eleGain = elements[elementKey] || {};

  // Cộng theo tộc
  if (Number.isFinite(raceGain.hp)) user.maxHp += raceGain.hp;
  if (Number.isFinite(raceGain.mp)) user.maxMp += raceGain.mp;
  if (Number.isFinite(raceGain.atk)) user.atk += raceGain.atk;
  if (Number.isFinite(raceGain.def)) user.def += raceGain.def;
  if (Number.isFinite(raceGain.spd)) user.spd += raceGain.spd;

  // Cộng theo ngũ hành
  if (Number.isFinite(eleGain.hp)) user.maxHp += eleGain.hp;
  if (Number.isFinite(eleGain.mp)) user.maxMp += eleGain.mp;
  if (Number.isFinite(eleGain.atk)) user.atk += eleGain.atk;
  if (Number.isFinite(eleGain.def)) user.def += eleGain.def;
  if (Number.isFinite(eleGain.spd)) user.spd += eleGain.spd;

  // Tăng trưởng cơ bản
  user.maxHp += 100;
  user.maxMp += 20;

  // Breakthrough (đúng theo logic fixdata.js): level % 10 === 1 (11, 21, 31, ...)
  if ((user.level || 1) % 10 === 1) {
    const multiplier = raceKey === "than" ? 1.6 : 1.5;
    user.atk = Math.floor(user.atk * multiplier);
    user.def = Math.floor(user.def * multiplier);
    user.spd = Math.floor(user.spd * multiplier);
    user.maxHp = Math.floor(user.maxHp * multiplier);
    user.maxMp = Math.floor(user.maxMp * multiplier);
  }

  // Full heal khi lên cấp (giữ nhất quán với fixdata)
  user.hp = user.maxHp;
  user.mp = user.maxMp;
}

/**
 * Thêm EXP cho 1 user
 * @returns {number} số cấp đã tăng (0 nếu không lên cấp)
 */
function addXp(userId, amount) {
  const users = loadUsers();
  const user = users[userId];
  if (!user) return 0;

  // Chuẩn hóa input
  amount = Number(amount) || 0;
  if (amount <= 0) return 0;

  // Tính bonus EXP %
  const bonusPercent = computeExpBonusPercent(user);
  const realGain = Math.floor(amount * (1 + bonusPercent / 100));

  user.exp = (Number(user.exp) || 0) + realGain;
  user.level = Number(user.level) || 1;

  let levelsGained = 0;

  // Nếu đủ EXP thì lên cấp nhiều lần
  while (user.exp >= getExpNeeded(user.level)) {
    user.exp -= getExpNeeded(user.level);
    user.level += 1;
    levelsGained += 1;

    applyLevelStatGrowth(user);
  }

  if (levelsGained > 0) {
    user.realm = getRealm(user.level);
  }

  saveUsers(users);
  return levelsGained;
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
  getRealm,
  addXp,
};
