// utils/dungeonCanvas.js
// Render cinematic card dungeon (PNG) bằng @napi-rs/canvas.
// Mục tiêu: nhìn "game" hơn: background cover, panel bo góc, avatar icon, HP/MP bar, VS.

const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const ASSETS_DIR = path.join(__dirname, "../assets");
const BG_DIR = path.join(ASSETS_DIR, "backgrounds");
const ICON_DIR = path.join(ASSETS_DIR, "icons");

try {
  GlobalFonts.registerFromPath(path.join(ASSETS_DIR, "fonts/DejaVuSans.ttf"), "DejaVu");
} catch {}

const FONT = "DejaVu";
const IMG_CACHE = new Map();

async function loadCached(fp) {
  if (IMG_CACHE.has(fp)) return IMG_CACHE.get(fp);
  const img = await loadImage(fp);
  IMG_CACHE.set(fp, img);
  return img;
}

function clamp(n, min, max) {
  const x = Number(n) || 0;
  return Math.max(min, Math.min(max, x));
}

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const nw = img.width * r;
  const nh = img.height * r;
  const nx = x + (w - nw) / 2;
  const ny = y + (h - nh) / 2;
  ctx.drawImage(img, nx, ny, nw, nh);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawBar(ctx, x, y, w, h, ratio, fg, bg) {
  const rr = Math.floor(h / 2);
  fillRoundRect(ctx, x, y, w, h, rr, bg);
  const ww = Math.max(0, Math.floor(w * clamp(ratio, 0, 1)));
  if (ww > 0) fillRoundRect(ctx, x, y, ww, h, rr, fg);
  strokeRoundRect(ctx, x, y, w, h, rr, "rgba(255,255,255,0.18)", 1);
}

async function icon(name) {
  return loadCached(path.join(ICON_DIR, name));
}

async function drawAvatar(ctx, x, y, size, team, el) {
  // team: 'party' | 'enemy'
  const pad = 3;
  const r = size / 2;

  // outer ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = team === "party" ? "rgba(116,185,255,0.35)" : "rgba(255,118,117,0.35)";
  ctx.fill();
  ctx.restore();

  // clip circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r - pad, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let img;
  if (team === "party") {
    const key = ["kim", "moc", "thuy", "hoa", "tho"].includes(el) ? el : "kim";
    img = await icon(`${key}.png`);
  } else {
    img = await icon("yeu.png");
  }
  // cover inside circle
  drawCover(ctx, img, x, y, size, size);
  ctx.restore();

  // inner stroke
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r - pad, 0, Math.PI * 2);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawHeader(ctx, W, mapName, diffName, sceneTag, floor, totalFloors, turn) {
  // top banner
  fillRoundRect(ctx, 18, 14, W - 36, 68, 16, "rgba(0,0,0,0.55)");
  strokeRoundRect(ctx, 18, 14, W - 36, 68, 16, "rgba(255,255,255,0.18)");

  ctx.font = `bold 26px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${mapName} • ${diffName}`, 36, 50);

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const t = turn ? ` • Lượt ${turn}` : "";
  ctx.fillText(`${sceneTag} • Tầng ${floor}/${totalFloors}${t}`, 36, 74);
}

async function drawSide(
  ctx,
  x,
  y,
  w,
  title,
  team,
  entities
) {
  fillRoundRect(ctx, x, y, w, 392, 18, "rgba(0,0,0,0.46)");
  strokeRoundRect(ctx, x, y, w, 392, 18, "rgba(255,255,255,0.14)");

  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = team === "party" ? "#a5d6ff" : "#ffb3b3";
  ctx.fillText(title, x + 18, y + 34);

  const hpIcon = await icon("hp.png");
  const mpIcon = await icon("mp.png");
  const atkIcon = await icon("atk.png");
  const defIcon = await icon("def.png");
  const spdIcon = await icon("spd.png");

  let cy = y + 54;
  for (const ent of entities.slice(0, 3)) {
    // block
    fillRoundRect(ctx, x + 14, cy, w - 28, 104, 16, "rgba(255,255,255,0.06)");
    strokeRoundRect(ctx, x + 14, cy, w - 28, 104, 16, "rgba(255,255,255,0.10)");

    const av = 58;
    await drawAvatar(ctx, x + 26, cy + 20, av, team, ent.element);

    // name
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = ent.alive ? "#fff" : "rgba(255,255,255,0.55)";
    ctx.fillText(String(ent.name || "?").slice(0, 18), x + 26 + av + 14, cy + 42);

    // realm/level
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    const lv = Number(ent.level) ? `Lv ${Number(ent.level)}` : "";
    const realm = ent.realm ? String(ent.realm).replace(" - Tầng ", " • Tầng ") : "";
    const meta = (lv && realm) ? `${lv} • ${realm}` : (lv || realm || "");
    if (meta) ctx.fillText(meta.slice(0, 32), x + 26 + av + 14, cy + 58);

    // HP bar
    const maxHp = Math.max(1, Number(ent.stats?.maxHp) || 1);
    const hp = clamp(ent.hp, 0, maxHp);
    const hpRatio = hp / maxHp;

    ctx.drawImage(hpIcon, x + 26 + av + 14, cy + 60, 18, 18);
    drawBar(
      ctx,
      x + 26 + av + 14 + 22,
      cy + 62,
      w - 28 - (av + 14 + 22 + 18 + 18),
      14,
      hpRatio,
      team === "party" ? "rgba(46, 204, 113, 0.9)" : "rgba(231, 76, 60, 0.9)",
      "rgba(0,0,0,0.35)"
    );
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const shield = Math.max(0, Number(ent.shield) || 0);
    const shieldTxt = shield > 0 ? ` +${shield}` : "";
    const hpTxt = `${hp}/${maxHp}${shieldTxt}`;
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillText(hpTxt, x + w - 22, cy + 74);
    ctx.restore();


    // MP bar (only for party)
    if (team === "party") {
      const maxMp = Math.max(1, Number(ent.stats?.maxMp) || 1);
      const mp = clamp(ent.mp, 0, maxMp);
      const mpRatio = mp / maxMp;
      ctx.drawImage(mpIcon, x + 26 + av + 14, cy + 76, 18, 18);
      drawBar(
        ctx,
        x + 26 + av + 14 + 22,
        cy + 78,
        w - 28 - (av + 14 + 22 + 18 + 18),
        12,
        mpRatio,
        "rgba(52, 152, 219, 0.9)",
        "rgba(0,0,0,0.30)"
      );
    }

    // stats row
    const atk = Math.max(0, Math.round(Number(ent.stats?.atk) || 0));
    const de = Math.max(0, Math.round(Number(ent.stats?.def) || 0));
    const sp = Math.max(0, Math.round(Number(ent.stats?.spd) || 0));

    const sx = x + 26 + av + 14;
    const sy = cy + 96;
    ctx.drawImage(atkIcon, sx, sy - 12, 16, 16);
    ctx.fillText(String(atk), sx + 18, sy);

    ctx.drawImage(defIcon, sx + 78, sy - 12, 16, 16);
    ctx.fillText(String(de), sx + 78 + 18, sy);

    ctx.drawImage(spdIcon, sx + 156, sy - 12, 16, 16);
    ctx.fillText(String(sp), sx + 156 + 18, sy);

    cy += 114;
  }
}

async function drawDungeonCard({ scene, map, diffName, floor, totalFloors, party, enemies, turn }) {
  const W = 1000;
  const H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  try {
    const bg = await loadCached(path.join(BG_DIR, map.file));
    drawCover(ctx, bg, 0, 0, W, H);
  } catch {
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, W, H);
  }

  // Vignette overlay
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.35, "rgba(0,0,0,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Header
  const tag = scene === "enter" ? "Nhập phòng" : scene === "result" ? "Kết thúc" : scene === "versus" ? "Đối đầu" : "Giao chiến";
  drawHeader(ctx, W, map.name, diffName, tag, floor, totalFloors, turn);

  // Middle content panels
  await drawSide(ctx, 18, 96, 460, "Đạo hữu", "party", party);
  await drawSide(ctx, 522, 96, 460, "Yêu tà", "enemy", enemies);

  // VS badge
  fillRoundRect(ctx, W / 2 - 44, 250, 88, 88, 44, "rgba(0,0,0,0.55)");
  strokeRoundRect(ctx, W / 2 - 44, 250, 88, 88, 44, "rgba(255,255,255,0.18)", 2);
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("VS", W / 2, 304);
  ctx.textAlign = "left";

  // Footer
  fillRoundRect(ctx, 18, H - 44, W - 36, 30, 12, "rgba(0,0,0,0.45)");
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Tu Tiên • Dungeon Cinematic", 36, H - 22);

  return canvas.toBuffer("image/png");
}

module.exports = { drawDungeonCard };
