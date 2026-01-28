// utils/canvasUtils.js
// Render ảnh Profile (PNG) bằng @napi-rs/canvas.
// Public API (giữ tương thích): drawProfile(userId, avatarUrl) -> Buffer | null
// Ngoài ra hỗ trợ drawProfile(userObject, avatarUrl) để reuse nội bộ.

const path = require("path");
const fs = require("fs");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const { getUser } = require("./storage");
const { getRealm, getExpNeeded } = require("./xp");
const elements = require("./element");

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

function fmtInt(n) {
  return Math.max(0, Math.round(Number(n) || 0)).toLocaleString("vi-VN");
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

function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const nw = img.width * r;
  const nh = img.height * r;
  const nx = x + (w - nw) / 2;
  const ny = y + (h - nh) / 2;
  ctx.drawImage(img, nx, ny, nw, nh);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    ctx.fillText(line, x, y + lines * lineHeight);
    lines += 1;
    if (maxLines && lines >= maxLines) return;
    line = w;
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}

function resolveBgFile(bgKey) {
  // Backward-compatible: hỗ trợ cả "bg_default" hoặc "default" hoặc "default.png".
  const key = String(bgKey || "default").trim();
  const candidates = [];
  if (key.endsWith(".png")) candidates.push(key);
  else {
    candidates.push(`${key}.png`);
    candidates.push(`bg_${key}.png`);
  }
  candidates.push("default.png");

  for (const name of candidates) {
    const fp = path.join(BG_DIR, name);
    if (fs.existsSync(fp)) return fp;
  }
  return path.join(BG_DIR, "default.png");
}

async function loadIconPng(name, fallback = null) {
  try {
    return await loadCached(path.join(ICON_DIR, name));
  } catch {
    if (!fallback) return null;
    try {
      return await loadCached(path.join(ICON_DIR, fallback));
    } catch {
      return null;
    }
  }
}

function drawBar(ctx, x, y, w, h, ratio, fg, bg) {
  const rr = Math.floor(h / 2);
  fillRoundRect(ctx, x, y, w, h, rr, bg);
  const ww = Math.max(0, Math.floor(w * clamp(ratio, 0, 1)));
  if (ww > 0) fillRoundRect(ctx, x, y, ww, h, rr, fg);
  strokeRoundRect(ctx, x, y, w, h, rr, "rgba(255,255,255,0.18)", 1);
}

async function drawAvatarCircle(ctx, avatarUrl, x, y, size) {
  const r = size / 2;

  // outer ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  ctx.restore();

  // clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r - 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const img = await loadImage(avatarUrl);
  drawCover(ctx, img, x, y, size, size);
  ctx.restore();

  // stroke
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r - 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function normalizeUserArg(userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === "object") return userOrId;
  const id = String(userOrId);
  return getUser(id);
}

async function drawProfile(userOrId, avatarUrl) {
  const u = normalizeUserArg(userOrId);
  if (!u) return null;

  const W = 1000;
  const H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ===== Background =====
  try {
    const bgFp = resolveBgFile(u?.background);
    const bg = await loadCached(bgFp);
    drawCover(ctx, bg, 0, 0, W, H);
  } catch {
    ctx.fillStyle = "#0b0e14";
    ctx.fillRect(0, 0, W, H);
  }

  // Vignette
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, "rgba(0,0,0,0.62)");
  vg.addColorStop(0.35, "rgba(0,0,0,0.22)");
  vg.addColorStop(1, "rgba(0,0,0,0.70)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // ===== Header =====
  fillRoundRect(ctx, 18, 14, W - 36, 70, 16, "rgba(0,0,0,0.55)");
  strokeRoundRect(ctx, 18, 14, W - 36, 70, 16, "rgba(255,255,255,0.18)");

  const charName = String(u?.name || "Chưa đặt tên").slice(0, 26);
  const title = u?.title ? String(u.title).slice(0, 40) : "";
  const level = Number(u?.level) || 1;
  const realm = String(u?.realm || getRealm(level) || "Phàm Nhân").slice(0, 40);
  const el = u?.element || "kim";
  const race = u?.race || "nhan";

  ctx.font = `bold 28px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(charName, 36, 48);

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const sub = title ? `${title} • ${realm}` : realm;
  ctx.fillText(sub, 36, 72);

  // Chips (right): Race + Element
  const chipH = 44;
  const chipW = 156;
  const chipGap = 10;
  const chipsTotalW = chipW * 2 + chipGap;
  let cx = W - 36 - chipsTotalW;
  const cy = 28;

  // Race chip
  try {
    const raceIcon = await loadIconPng(`${race}.png`, "nhan.png");
    if (raceIcon) {
      fillRoundRect(ctx, cx, cy, chipW, chipH, 14, "rgba(255,255,255,0.08)");
      strokeRoundRect(ctx, cx, cy, chipW, chipH, 14, "rgba(255,255,255,0.14)");
      ctx.drawImage(raceIcon, cx + 10, cy + 8, 28, 28);
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText(String(race).toUpperCase(), cx + 46, cy + 28);
    }
  } catch {}

  // Element chip
  cx += chipW + chipGap;
  try {
    const elKey = ["kim", "moc", "thuy", "hoa", "tho"].includes(el) ? el : "kim";
    const elIcon = await loadIconPng(`${elKey}.png`, "kim.png");
    if (elIcon) {
      fillRoundRect(ctx, cx, cy, chipW, chipH, 14, "rgba(255,255,255,0.08)");
      strokeRoundRect(ctx, cx, cy, chipW, chipH, 14, "rgba(255,255,255,0.14)");
      ctx.drawImage(elIcon, cx + 10, cy + 8, 28, 28);
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText(elements.display?.[elKey] || String(elKey), cx + 46, cy + 28);
    }
  } catch {}

  // ===== Main panels =====
  const leftX = 18;
  const topY = 96;
  const gap = 16;
  const leftW = 330;
  const rightX = leftX + leftW + gap;
  const rightW = W - 18 - rightX;
  const panelH = 372;

  fillRoundRect(ctx, leftX, topY, leftW, panelH, 18, "rgba(0,0,0,0.46)");
  strokeRoundRect(ctx, leftX, topY, leftW, panelH, 18, "rgba(255,255,255,0.14)");

  fillRoundRect(ctx, rightX, topY, rightW, panelH, 18, "rgba(0,0,0,0.46)");
  strokeRoundRect(ctx, rightX, topY, rightW, panelH, 18, "rgba(255,255,255,0.14)");

  // Avatar
  const avSize = 124;
  try {
    await drawAvatarCircle(ctx, avatarUrl, leftX + 26, topY + 22, avSize);
  } catch {
    // ignore
  }

  // Level + currency
  const lt = Number(u?.lt) || 0;
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(`Lv ${level}`, leftX + 26 + avSize + 18, topY + 52);

  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(`Linh thạch: ${fmtInt(lt)} 💎`, leftX + 26 + avSize + 18, topY + 78);

  // HP/MP bars
  const maxHp = Math.max(1, Number(u?.maxHp) || 1);
  const hp = clamp(u?.hp, 0, maxHp);
  const maxMp = Math.max(1, Number(u?.maxMp) || 1);
  const mp = clamp(u?.mp, 0, maxMp);

  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText("HP", leftX + 26, topY + 172);
  drawBar(ctx, leftX + 60, topY + 160, leftW - 86, 14, hp / maxHp, "rgba(46, 204, 113, 0.90)", "rgba(0,0,0,0.35)");
  ctx.save();
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText(`${fmtInt(hp)}/${fmtInt(maxHp)}`, leftX + leftW - 26, topY + 172);
  ctx.restore();

  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText("MP", leftX + 26, topY + 204);
  drawBar(ctx, leftX + 60, topY + 192, leftW - 86, 12, mp / maxMp, "rgba(52, 152, 219, 0.90)", "rgba(0,0,0,0.30)");
  ctx.save();
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText(`${fmtInt(mp)}/${fmtInt(maxMp)}`, leftX + leftW - 26, topY + 204);
  ctx.restore();

  // EXP progress
  const exp = Math.max(0, Number(u?.exp) || 0);
  const need = Math.max(1, getExpNeeded(level));
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText("EXP", leftX + 26, topY + 238);
  drawBar(ctx, leftX + 60, topY + 226, leftW - 86, 12, exp / need, "rgba(241, 196, 15, 0.88)", "rgba(0,0,0,0.30)");
  ctx.save();
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "right";
  ctx.fillText(`${fmtInt(exp)}/${fmtInt(need)}`, leftX + leftW - 26, topY + 238);
  ctx.restore();

  // Bio box
  const bio = String(u?.bio || "").trim();
  fillRoundRect(ctx, leftX + 18, topY + 260, leftW - 36, 192, 14, "rgba(255,255,255,0.06)");
  strokeRoundRect(ctx, leftX + 18, topY + 260, leftW - 36, 192, 14, "rgba(255,255,255,0.10)");
  ctx.font = `bold 16px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fillText("Tiểu sử", leftX + 34, topY + 288);
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  wrapText(ctx, bio || "(chưa có)", leftX + 34, topY + 312, leftW - 68, 18, 7);

  // ===== Right stats grid =====
  const atk = Math.max(0, Math.round(Number(u?.atk) || 0));
  const de = Math.max(0, Math.round(Number(u?.def) || 0));
  const spd = Math.max(0, Math.round(Number(u?.spd) || 0));
  const fury = Math.max(0, Math.round(Number(u?.fury) || 0));

  ctx.font = `bold 18px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("Chỉ số", rightX + 22, topY + 36);

  const boxGap = 12;
  const boxW = Math.floor((rightW - 22 * 2 - boxGap) / 2);
  const boxH = 74;
  const bx0 = rightX + 22;
  const by0 = topY + 52;

  function statBox(ix, iy, label, value) {
    const bx = bx0 + ix * (boxW + boxGap);
    const by = by0 + iy * (boxH + boxGap);
    fillRoundRect(ctx, bx, by, boxW, boxH, 14, "rgba(255,255,255,0.06)");
    strokeRoundRect(ctx, bx, by, boxW, boxH, 14, "rgba(255,255,255,0.10)");
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(label, bx + 16, by + 28);
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(value, bx + 16, by + 56);
  }

  statBox(0, 0, "Công", fmtInt(atk));
  statBox(1, 0, "Thủ", fmtInt(de));
  statBox(0, 1, "Tốc", fmtInt(spd));
  statBox(1, 1, "HP Tối đa", fmtInt(maxHp));
  statBox(0, 2, "MP Tối đa", fmtInt(maxMp));
  statBox(1, 2, "Phẫn nộ", fmtInt(fury));

  // Footer watermark
  fillRoundRect(ctx, 18, H - 44, W - 36, 30, 12, "rgba(0,0,0,0.45)");
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Tu Tiên • Profile", 36, H - 22);

  return canvas.toBuffer("image/png");
}

module.exports = {
  drawProfile,
};
