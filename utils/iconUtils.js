const { loadImage } = require("@napi-rs/canvas");
const path = require("path");

// Cache icons để không load nhiều lần
const cache = {};

async function getIcon(name) {
  const key = String(name || "").toLowerCase();
  if (!cache[key]) {
    const p = path.join(__dirname, "../assets/icons", `${key}.png`);
    cache[key] = loadImage(p).catch((e) => {
      // Fallback nếu thiếu icon → dùng atk.png
      if (key !== "atk") {
        const fb = path.join(__dirname, "../assets/icons", "atk.png");
        return loadImage(fb);
      }
      throw e;
    });
  }
  return cache[key];
}

module.exports = { getIcon };
