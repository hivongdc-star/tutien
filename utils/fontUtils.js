const path = require("path");
const { GlobalFonts } = require("@napi-rs/canvas");

// Đăng ký font chữ (tối giản: chỉ giữ DejaVuSans để ổn định khi deploy)
function registerFonts() {
  try {
    GlobalFonts.registerFromPath(
      path.join(__dirname, "../assets/fonts/DejaVuSans.ttf"),
      "DejaVu"
    );
  } catch {}
}

// Gợi ý cách dùng font
const fonts = {
  title: "28px DejaVu",
  subtitle: "20px DejaVu",
  text: "16px DejaVu",
  number: "16px DejaVu",
};

module.exports = { registerFonts, fonts };
