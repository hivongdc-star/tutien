const { GlobalFonts } = require("@napi-rs/canvas");

// Đăng ký font chữ
function registerFonts() {
  GlobalFonts.registerFromPath("./assets/fonts/DejaVuSans.ttf", "DejaVu");
  GlobalFonts.registerFromPath("./assets/fonts/CinzelDecorative.ttf", "Cinzel");
  GlobalFonts.registerFromPath(
    "./assets/fonts/NotoSans-Regular.ttf",
    "NotoSans"
  );
}

// Gợi ý cách dùng font
const fonts = {
  title: "28px Cinzel",
  subtitle: "20px NotoSans",
  text: "16px DejaVu",
  number: "16px DejaVu",
};

module.exports = { registerFonts, fonts };
