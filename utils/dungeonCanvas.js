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

function fmtInt(n) {
  return Math.max(0, Math.round(Number(n) || 0)).toLocaleString("vi-VN");
}

function formatBuffDebuffLine(ent) {
  // ent.buffs/debuffs: { atk|def|spd: {pct, turns} } (được clone ra từ dungeonEngine)
  const parts = [];
  const order = ["atk", "def", "spd"];
  for (const st of order) {
    const b = ent?.buffs?.[st];
    const d = ent?.debuffs?.[st];
    const bPct = Math.round(Number(b?.pct) || 0);
    const bTurns = Math.round(Number(b?.turns) || 0);
    const dPct = Math.round(Number(d?.pct) || 0);
    const dTurns = Math.round(Number(d?.turns) || 0);
    if (bPct > 0 && bTurns > 0) parts.push(`${st.toUpperCase()} +${bPct}% (${bTurns})`);
    if (dPct > 0 && dTurns > 0) parts.push(`${st.toUpperCase()} -${dPct}% (${dTurns})`);
  }
  return parts.slice(0, 3).join(" • ");
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

function drawHeader(ctx, W, mapName, diffName, sceneTag, floor, totalFloors, turn, resultChip) {
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

  if (resultChip) {
    const txt = String(resultChip).toUpperCase();
    const padX = 14;
    const padY = 8;
    ctx.font = `bold 16px ${FONT}`;
    const tw = ctx.measureText(txt).width;
    const chipW = Math.ceil(tw + padX * 2);
    const chipH = 32;
    const cx = W - 36 - chipW;
    const cy = 26;

    let fg = "rgba(255,255,255,0.92)";
    let bg = "rgba(0,0,0,0.45)";
    if (txt.includes("THẮNG") || txt.includes("WIN")) bg = "rgba(46, 204, 113, 0.28)";
    else if (txt.includes("THUA") || txt.includes("LOSE")) bg = "rgba(231, 76, 60, 0.30)";
    else if (txt.includes("TIME")) bg = "rgba(241, 196, 15, 0.28)";

    fillRoundRect(ctx, cx, cy, chipW, chipH, 16, bg);
    strokeRoundRect(ctx, cx, cy, chipW, chipH, 16, "rgba(255,255,255,0.18)");
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.fillText(txt, cx + chipW / 2, cy + chipH / 2 + 6);
    ctx.textAlign = "left";
  }
}

function ellipsize(ctx, text, maxWidth) {
  const s = String(text || "");
  if (ctx.measureText(s).width <= maxWidth) return s;
  const ell = "…";
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = s.slice(0, mid).trimEnd() + ell;
    if (ctx.measureText(t).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  const cut = Math.max(0, lo - 1);
  return s.slice(0, cut).trimEnd() + ell;
}

async function drawSide(ctx, x, y, w, h, title, team, entities) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(0,0,0,0.46)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.14)");

  ctx.font = `bold 20px ${FONT}`;
  ctx.fillStyle = team === "party" ? "#a5d6ff" : "#ffb3b3";
  ctx.fillText(title, x + 18, y + 34);

  const hpIcon = await icon("hp.png");
  const mpIcon = await icon("mp.png");
  const atkIcon = await icon("atk.png");
  const defIcon = await icon("def.png");
  const spdIcon = await icon("spd.png");

  if (!entities || entities.length === 0) {
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("(trống)", x + 18, y + 72);
    return;
  }

  const list = (entities || []).slice(0, 3);
  // Fit 3 slots trong 1000x520: nén chiều cao block để không đè footer.
  const blockGap = 10;
  const topPad = 54;
  const bottomPad = 16;
  const blockH = Math.max(92, Math.floor((h - topPad - bottomPad - blockGap * (list.length - 1)) / Math.max(1, list.length)));

  let cy = y + topPad;
  for (const ent of list) {
    const isBoss = ent.kind === "boss" || String(ent.name || "").toLowerCase().includes("boss");
    // block
    fillRoundRect(ctx, x + 14, cy, w - 28, blockH, 16, "rgba(255,255,255,0.06)");
    strokeRoundRect(ctx, x + 14, cy, w - 28, blockH, 16, "rgba(255,255,255,0.10)");
    if (isBoss) {
      strokeRoundRect(ctx, x + 14, cy, w - 28, blockH, 16, "rgba(241, 196, 15, 0.22)", 2);
    }

    const av = Math.min(56, Math.max(50, Math.floor(blockH * 0.56)));
    await drawAvatar(ctx, x + 26, cy + 16, av, team, ent.element);

    // name
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = ent.alive ? "#fff" : "rgba(255,255,255,0.55)";
    const nameX = x + 26 + av + 14;
    const nameMaxW = w - 28 - (av + 14 + 26);
    ctx.fillText(ellipsize(ctx, String(ent.name || "?"), nameMaxW), nameX, cy + 34);

    // realm/level
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    const lv = Number(ent.level) ? `Lv ${Number(ent.level)}` : "";
    const realm = ent.realm ? String(ent.realm).replace(" - Tầng ", " • Tầng ") : "";
    const meta = (lv && realm) ? `${lv} • ${realm}` : (lv || realm || "");
    if (meta) {
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(ellipsize(ctx, meta, nameMaxW), nameX, cy + 52);
    }

    // HP bar (+shield)
    const maxHp = Math.max(1, Number(ent.stats?.maxHp) || 1);
    const hp = clamp(ent.hp, 0, maxHp);
    const shield = Math.max(0, Number(ent.shield) || 0);
    const hpRatio = hp / maxHp;
    const totalRatio = clamp((hp + shield) / maxHp, 0, 1);

    const barX = nameX + 22;
    const barY = cy + 56;
    const barW = w - 28 - (av + 14 + 22 + 18 + 18);
    const barH = 14;

    ctx.drawImage(hpIcon, nameX, cy + 54, 18, 18);

    const rr = Math.floor(barH / 2);
    fillRoundRect(ctx, barX, barY, barW, barH, rr, "rgba(0,0,0,0.35)");
    const hpW = Math.floor(barW * clamp(hpRatio, 0, 1));
    if (hpW > 0) {
      fillRoundRect(
        ctx,
        barX,
        barY,
        hpW,
        barH,
        rr,
        team === "party" ? "rgba(46, 204, 113, 0.9)" : "rgba(231, 76, 60, 0.9)"
      );
    }
    const totW = Math.floor(barW * clamp(totalRatio, 0, 1));
    if (shield > 0 && totW > hpW) {
      ctx.fillStyle = "rgba(116, 185, 255, 0.65)";
      if (hpW === 0) fillRoundRect(ctx, barX, barY, totW, barH, rr, ctx.fillStyle);
      else ctx.fillRect(barX + hpW, barY, totW - hpW, barH);
    }
    strokeRoundRect(ctx, barX, barY, barW, barH, rr, "rgba(255,255,255,0.18)", 1);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const shieldTxt = shield > 0 ? ` (+${fmtInt(shield)})` : "";
    const hpTxt = `${fmtInt(hp)}/${fmtInt(maxHp)}${shieldTxt}`;
    ctx.save();
    ctx.textAlign = "right";
    ctx.fillText(hpTxt, x + w - 22, cy + 68);
    ctx.restore();


    // MP bar (only for party)
    if (team === "party") {
      const maxMp = Math.max(1, Number(ent.stats?.maxMp) || 1);
      const mp = clamp(ent.mp, 0, maxMp);
      const mpRatio = mp / maxMp;
      ctx.drawImage(mpIcon, nameX, cy + 70, 18, 18);
      drawBar(
        ctx,
        barX,
        cy + 72,
        w - 28 - (av + 14 + 22 + 18 + 18),
        12,
        mpRatio,
        "rgba(52, 152, 219, 0.9)",
        "rgba(0,0,0,0.30)"
      );

      // MP text
      ctx.save();
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.textAlign = "right";
      ctx.fillText(`${fmtInt(mp)}/${fmtInt(maxMp)}`, x + w - 22, cy + 84);
      ctx.restore();
    }

    // stats row
    const atk = Math.max(0, Math.round(Number(ent.stats?.atk) || 0));
    const de = Math.max(0, Math.round(Number(ent.stats?.def) || 0));
    const sp = Math.max(0, Math.round(Number(ent.stats?.spd) || 0));

    const sx = x + 26 + av + 14;
    const sy = cy + Math.max(82, blockH - 12);
    const tag = (st) => {
      const b = Math.round(Number(ent?.buffs?.[st]?.pct) || 0);
      const bt = Math.round(Number(ent?.buffs?.[st]?.turns) || 0);
      const d = Math.round(Number(ent?.debuffs?.[st]?.pct) || 0);
      const dt = Math.round(Number(ent?.debuffs?.[st]?.turns) || 0);
      if (b > 0 && bt > 0) return { t: `↑${b}%`, c: "rgba(46, 204, 113, 0.95)" };
      if (d > 0 && dt > 0) return { t: `↓${d}%`, c: "rgba(231, 76, 60, 0.95)" };
      return null;
    };

    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.86)";

    ctx.drawImage(atkIcon, sx, sy - 12, 16, 16);
    const atkStr = String(atk);
    ctx.fillText(atkStr, sx + 18, sy);
    const atkTag = tag("atk");
    if (atkTag) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = atkTag.c;
      ctx.fillText(atkTag.t, sx + 18 + ctx.measureText(atkStr).width + 6, sy);
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.86)";
    }

    ctx.drawImage(defIcon, sx + 78, sy - 12, 16, 16);
    const deStr = String(de);
    ctx.fillText(deStr, sx + 78 + 18, sy);
    const defTag = tag("def");
    if (defTag) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = defTag.c;
      ctx.fillText(defTag.t, sx + 78 + 18 + ctx.measureText(deStr).width + 6, sy);
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.86)";
    }

    ctx.drawImage(spdIcon, sx + 156, sy - 12, 16, 16);
    const spStr = String(sp);
    ctx.fillText(spStr, sx + 156 + 18, sy);
    const spdTag = tag("spd");
    if (spdTag) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = spdTag.c;
      ctx.fillText(spdTag.t, sx + 156 + 18 + ctx.measureText(spStr).width + 6, sy);
    }

    cy += blockH + blockGap;
  }
}

async function drawDungeonCard({ scene, map, diffName, floor, totalFloors, party, enemies, turn, logs }) {
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
  let resultChip = null;
  if (scene === "result") {
    const pAlive = Array.isArray(party) && party.some((e) => e && e.alive && Number(e.hp) > 0);
    const eAlive = Array.isArray(enemies) && enemies.some((e) => e && e.alive && Number(e.hp) > 0);
    resultChip = pAlive && !eAlive ? "Thắng" : !pAlive ? "Thua" : "Time Out";
  }
  drawHeader(ctx, W, map.name, diffName, tag, floor, totalFloors, turn, resultChip);

  // Layout: body + bottom bar (tránh đè nhau ở 1000x520)
  const bodyY = 92;
  const bottomBarH = 40;
  const bottomBarY = H - 14 - bottomBarH;
  const panelH = bottomBarY - bodyY - 8;

  // Middle content panels
  await drawSide(ctx, 18, bodyY, 460, panelH, "Đạo hữu", "party", party);
  await drawSide(ctx, 522, bodyY, 460, panelH, "Yêu tà", "enemy", enemies);

  // VS badge
  const badgeY = bodyY + Math.floor(panelH / 2) - 44;
  fillRoundRect(ctx, W / 2 - 44, badgeY, 88, 88, 44, "rgba(0,0,0,0.55)");
  strokeRoundRect(ctx, W / 2 - 44, badgeY, 88, 88, 44, "rgba(255,255,255,0.18)", 2);
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("VS", W / 2, badgeY + 54);
  ctx.textAlign = "left";

  // Bottom bar: watermark (không hiển thị log nữa theo yêu cầu)
  fillRoundRect(ctx, 18, bottomBarY, W - 36, bottomBarH, 12, "rgba(0,0,0,0.45)");
  strokeRoundRect(ctx, 18, bottomBarY, W - 36, bottomBarH, 12, "rgba(255,255,255,0.12)");

  const lines = (Array.isArray(logs) ? logs : []).filter(Boolean).slice(-2);
  if (lines.length) {
    // Nếu tương lai muốn bật log lại, chỉ cần truyền logs (array string) vào.
    const leftTxt = lines.map((s) => `• ${s}`).join("\n");
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    const maxW = W - 36 - 220;
    const parts = String(leftTxt).split("\n");
    for (let i = 0; i < Math.min(2, parts.length); i++) {
      const t = ellipsize(ctx, parts[i], maxW);
      ctx.fillText(t, 36, bottomBarY + 18 + i * 16);
    }
  }

  ctx.save();
  ctx.textAlign = "right";
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.fillText("Tu Tiên • Dungeon", W - 36, bottomBarY + 26);
  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = { drawDungeonCard };
