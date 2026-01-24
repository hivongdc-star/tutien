// utils/antispam.js
const userActivity = {};
// userActivity[userId] = { count, lastReset, blockedUntil }

function canGainXp(userId) {
  const now = Date.now();

  // Nếu đang bị chặn → không cho EXP
  if (
    userActivity[userId]?.blockedUntil &&
    now < userActivity[userId].blockedUntil
  ) {
    return false;
  }

  // Reset mỗi phút
  if (!userActivity[userId] || now - userActivity[userId].lastReset >= 60000) {
    userActivity[userId] = { count: 0, lastReset: now, blockedUntil: 0 };
  }

  // Tăng số lần chat
  userActivity[userId].count++;

  // Nếu vượt 10 lần / phút → block 2 giờ
  if (userActivity[userId].count > 10) {
    userActivity[userId].blockedUntil = now + 2 * 60 * 60 * 1000; // 2 giờ
    return false;
  }

  return true; // ✅ Được cộng EXP
}

// Trả về thời gian còn bị chặn (ms)
function getBlockRemaining(userId) {
  const now = Date.now();
  if (
    userActivity[userId]?.blockedUntil &&
    now < userActivity[userId].blockedUntil
  ) {
    return userActivity[userId].blockedUntil - now;
  }
  return 0;
}

module.exports = { canGainXp, getBlockRemaining };
