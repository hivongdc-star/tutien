// utils/dungeonCanvas.js
// Render cinematic card dungeon (PNG) bằng @napi-rs/canvas.

const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

try {
  GlobalFonts.registerFromPath(path.join(__dirname, "../assets/fonts/DejaVuSans.ttf"), "DejaVu");
} catch {}

const FONT = "DejaVu";

function bar(ctx, x, y, w, h, ratio, fg = "#4fc3f7", bg = "rgba(0,0,0,0.35)") {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, Math.max(0, Math.floor(w * ratio)), h);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.strokeRect(x, y, w, h);
}

function drawPanel(ctx, x, y, w, h) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(x, y, w, h);
}

async function drawDungeonCard({ scene, map, diffName, floor, totalFloors, party, enemies, turn }) {
  const canvas = createCanvas(900, 420);
  const ctx = canvas.getContext("2d");

  // Background
  try {
    const bg = await loadImage(`./assets/backgrounds/${map.file}`);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  } catch {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Header overlay
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, 64);

  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = "#fff";
  ctx.fillText(`${map.name}  •  ${diffName}`, 20, 40);

  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = "#ddd";
  const tag = scene === "enter" ? "Nhập phòng" : scene === "result" ? "Kết thúc" : "Giao chiến";
  ctx.fillText(`${tag}  •  Tầng ${floor}/${totalFloors}` + (turn ? `  •  Lượt ${turn}` : ""), 20, 60);

  // Panels
  drawPanel(ctx, 18, 78, 410, 320);
  drawPanel(ctx, 472, 78, 410, 320);

  // Party
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = "#a5d6ff";
  ctx.fillText("Đạo hữu", 34, 110);

  ctx.font = `18px ${FONT}`;
  let y = 140;
  for (const p of party.slice(0, 3)) {
    const max = Math.max(1, p.stats.maxHp);
    const ratio = Math.max(0, Math.min(1, p.hp / max));
    ctx.fillStyle = p.alive ? "#fff" : "#888";
    ctx.fillText(p.name.slice(0, 18), 34, y);
    bar(ctx, 34, y + 10, 320, 14, ratio);
    ctx.fillStyle = "#ddd";
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`${p.hp}/${max}` + (p.shield > 0 ? `  +${p.shield}` : ""), 360, y + 22);
    ctx.font = `18px ${FONT}`;
    y += 64;
  }

  // Enemies
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = "#ffb3b3";
  ctx.fillText("Yêu tà", 488, 110);

  ctx.font = `18px ${FONT}`;
  y = 140;
  for (const e of enemies.slice(0, 3)) {
    const max = Math.max(1, e.stats.maxHp);
    const ratio = Math.max(0, Math.min(1, e.hp / max));
    ctx.fillStyle = e.alive ? "#fff" : "#888";
    ctx.fillText(e.name.slice(0, 18), 488, y);
    bar(ctx, 488, y + 10, 320, 14, ratio, "#ff6b6b");
    ctx.fillStyle = "#ddd";
    ctx.font = `14px ${FONT}`;
    ctx.fillText(`${e.hp}/${max}` + (e.shield > 0 ? `  +${e.shield}` : ""), 814, y + 22);
    ctx.font = `18px ${FONT}`;
    y += 64;
  }

  // Footer
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 392, canvas.width, 28);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "#ccc";
  ctx.fillText("Tu Tiên • Dungeon Cinematic", 20, 412);

  return canvas.toBuffer("image/png");
}

module.exports = { drawDungeonCard };
