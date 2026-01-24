const backgrounds = require("../data/br.json");

// Lấy background theo key, nếu không có thì trả về mặc định
function getBackground(key) {
  return backgrounds[key] || backgrounds.default;
}

// Danh sách tất cả background
function listBackgrounds() {
  return backgrounds;
}

// Kiểm tra key có tồn tại không
function isValidBackground(key) {
  return Boolean(backgrounds[key]);
}

module.exports = { getBackground, listBackgrounds, isValidBackground };
