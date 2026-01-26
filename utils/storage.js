const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "../data/users.json");

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(dataPath, JSON.stringify(users, null, 2));
}

/**
 * Lấy user theo id, đồng thời đảm bảo có đủ field mặc định
 */
function getUser(id) {
  const users = loadUsers();
  const u = users[id];
  if (!u) return null;

  // Backfill các field nếu thiếu
  if (u.lt === undefined) u.lt = 0;
  if (u.fury === undefined) u.fury = 0;
  if (!u.inventory) u.inventory = {};
  if (!u.equipments) u.equipments = {};
  if (!u.titles) u.titles = [];
  if (typeof u.title === "undefined") u.title = null;
  if (!u.relationships) u.relationships = { partners: {} };
  if (!u.dailyStones) u.dailyStones = { date: null, earned: 0 };
  if (!u.buffs) u.buffs = [];
  if (!u.shield) u.shield = 0;
  if (!u.background) u.background = "default";

  // ===== Mining + Gear (mở rộng an toàn, không phá schema cũ) =====
  if (!u.mining) u.mining = {};
  if (!Array.isArray(u.mining.tools)) u.mining.tools = [];
  if (typeof u.mining.activeToolId === "undefined") u.mining.activeToolId = null;
  if (!Number.isFinite(u.mining.lastMineAt)) u.mining.lastMineAt = 0;
  if (!u.mining.ores || typeof u.mining.ores !== "object") u.mining.ores = {};

  if (!u.gear) u.gear = {};
  if (!u.gear.equipped || typeof u.gear.equipped !== "object") {
    u.gear.equipped = { weapon: null, armor: null, boots: null, bracelet: null };
  } else {
    if (typeof u.gear.equipped.weapon === "undefined") u.gear.equipped.weapon = null;
    if (typeof u.gear.equipped.armor === "undefined") u.gear.equipped.armor = null;
    if (typeof u.gear.equipped.boots === "undefined") u.gear.equipped.boots = null;
    if (typeof u.gear.equipped.bracelet === "undefined") u.gear.equipped.bracelet = null;
  }
  if (!Array.isArray(u.gear.bag)) u.gear.bag = [];

  return u;
}

/**
 * Tạo user mới với đầy đủ field mặc định
 */
function createUser(id, race, element) {
  const users = loadUsers();
  if (!users[id]) {
    let hp = 100,
      mp = 100,
      atk = 10,
      def = 10,
      spd = 10;

    let user = {
      id,
      name: "Chưa đặt tên",
      exp: 0,
      level: 1,
      realm: "Luyện Khí - Tầng 1",
      race,
      element,
      hp,
      maxHp: hp,
      mp,
      maxMp: mp,
      atk,
      def,
      spd,
      fury: 0,
      lt: 0,
      bio: "",
      inventory: {},
      equipments: {},
      titles: [],
      title: null,
      relationships: { partners: {} },
      dailyStones: { date: null, earned: 0 },
      buffs: [],
      shield: 0,
      background: "default",

      // Mining + Gear (mới)
      mining: {
        tools: [],
        activeToolId: null,
        lastMineAt: 0,
        ores: {},
      },
      gear: {
        equipped: { weapon: null, armor: null, boots: null, bracelet: null },
        bag: [],
      },
    };

    users[id] = user;
    saveUsers(users);
  }
  return users[id];
}

/**
 * Cập nhật user với dữ liệu mới
 */
function updateUser(id, data) {
  const users = loadUsers();
  if (!users[id]) return null;
  users[id] = { ...users[id], ...data };
  saveUsers(users);
  return users[id];
}

module.exports = { loadUsers, saveUsers, getUser, createUser, updateUser };
