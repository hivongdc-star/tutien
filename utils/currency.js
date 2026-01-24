const { loadUsers, saveUsers } = require("./storage");
const { dailyReward, maxDailyChatStones } = require("./config");

const chatTracker = {}; // track LT từ chat

// --- Cộng LT ---
function addLT(userId, amount) {
  const users = loadUsers();
  if (!users[userId]) return;

  users[userId].lt = (users[userId].lt || 0) + amount;
  saveUsers(users);
}

// --- Trừ LT ---
function removeLT(userId, amount) {
  const users = loadUsers();
  if (!users[userId]) return;

  users[userId].lt = Math.max(0, (users[userId].lt || 0) - amount);
  saveUsers(users);
}

// --- Lấy LT hiện tại ---
function getLT(userId) {
  const users = loadUsers();
  return users[userId]?.lt || 0;
}

// --- Kiếm LT từ chat ---
function earnFromChat(userId) {
  const today = new Date().toDateString();
  if (!chatTracker[userId]) chatTracker[userId] = { date: today, earned: 0 };

  if (chatTracker[userId].date !== today) {
    chatTracker[userId] = { date: today, earned: 0 };
  }

  if (chatTracker[userId].earned < maxDailyChatStones) {
    addLT(userId, 1);
    chatTracker[userId].earned++;
  }
}

// --- Nhận LT Daily ---
function claimDaily(userId) {
  const users = loadUsers();
  if (!users[userId])
    return { success: false, message: "Bạn chưa tạo nhân vật." };

  const today = new Date().toDateString();
  if (users[userId].lastDaily === today) {
    return { success: false, message: "❌ Bạn đã nhận daily hôm nay rồi." };
  }

  users[userId].lastDaily = today;
  users[userId].dailyStreak = (users[userId].dailyStreak || 0) + 1;

  const reward = dailyReward + (users[userId].dailyStreak - 1) * 5;
  users[userId].lt = (users[userId].lt || 0) + reward;

  saveUsers(users);

  return {
    success: true,
    message: `✅ Bạn đã nhận ${reward} 💎 Linh thạch (chuỗi ${users[userId].dailyStreak} ngày).`,
  };
}

//
// --- Phần mới: hỗ trợ Game nối từ ---
//

// +1 LT cho mỗi từ hợp lệ
function rewardWord(userId, amount = 1) {
  addLT(userId, amount);
}

// Trao thưởng khi game kết thúc
// players = { userId: số từ đã nhập }
function rewardGameResults(players) {
  const results = [];
  for (const [userId, words] of Object.entries(players)) {
    const reward = words; // mỗi từ = 1 LT (có thể thêm bonus top ở đây)
    addLT(userId, reward);
    results.push({ userId, reward, words });
  }

  // Sắp xếp kết quả theo số từ giảm dần
  results.sort((a, b) => b.words - a.words);

  return results;
}

// Xuất ra đầy đủ
module.exports = {
  addLT,
  removeLT,
  getLT,
  earnFromChat,
  claimDaily,
  rewardWord,
  rewardGameResults,
  addStones: addLT, // alias cho code cũ
};
