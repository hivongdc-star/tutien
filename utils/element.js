module.exports = {
  kim: { hp: 12, mp: 12, atk: 12, def: 12, spd: 2 }, // cân bằng
  moc: { hp: 26, mp: 6, atk: 6, def: 10, spd: 2 }, // ưu tiên máu
  thuy: { hp: 6, mp: 26, atk: 6, def: 10, spd: 2 }, // ưu tiên mana
  hoa: { hp: 6, mp: 6, atk: 26, def: 10, spd: 2 }, // ưu tiên công
  tho: { hp: 12, mp: 6, atk: 6, def: 24, spd: 2 }, // ưu tiên thủ
};

// Map hiển thị
module.exports.display = {
  kim: "⚔️ Kim",
  moc: "🌿 Mộc",
  thuy: "💧 Thủy",
  hoa: "🔥 Hỏa",
  tho: "⛰️ Thổ",
};
