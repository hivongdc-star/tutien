// utils/statsView.js
// Tính toán chỉ số hiển thị (-nv), bao gồm % tăng từ trang bị và tổng phụ tố.

const { tierMeta } = require("./tiers");

const AFFIX_LABELS = {
  crit: "Chí mạng",
  crit_resist: "Kháng chí mạng",
  armor_pen: "Xuyên giáp",
  crit_dmg: "Bạo kích",
  dmg_reduce: "Giảm sát thương",
  lifesteal: "Hút huyết",
  dodge: "Né tránh",
  accuracy: "Chính xác",
};

const MAIN_LABELS = {
  atk: "Công",
  def: "Thủ",
  spd: "Tốc",
  hp: "Sinh mệnh",
  mp: "Linh lực",
};

function sumAffixes(equipped) {
  const total = {};
  for (const it of Object.values(equipped || {})) {
    if (!it || !Array.isArray(it.affixes)) continue;
    for (const af of it.affixes) {
      if (!af || !af.stat) continue;
      const key = String(af.stat);
      const pct = Number(af.pct);
      if (!Number.isFinite(pct) || pct === 0) continue;
      total[key] = (total[key] || 0) + pct;
    }
  }
  return total;
}

function sumMainPercents(equipped) {
  const sum = { atk: 0, def: 0, spd: 0, hp: 0, mp: 0 };
  for (const it of Object.values(equipped || {})) {
    if (!it) continue;
    const main = it.main || it.mainPct || it.main_percent || null;
    if (!main || typeof main !== "object") continue;

    // Cho phép nhiều kiểu key để dễ tương thích tương lai
    if (Number.isFinite(main.atkPct)) sum.atk += main.atkPct;
    if (Number.isFinite(main.defPct)) sum.def += main.defPct;
    if (Number.isFinite(main.spdPct)) sum.spd += main.spdPct;
    if (Number.isFinite(main.hpPct)) sum.hp += main.hpPct;
    if (Number.isFinite(main.mpPct)) sum.mp += main.mpPct;

    if (Number.isFinite(main.atk)) sum.atk += main.atk;
    if (Number.isFinite(main.def)) sum.def += main.def;
    if (Number.isFinite(main.spd)) sum.spd += main.spd;
    if (Number.isFinite(main.hp)) sum.hp += main.hp;
    if (Number.isFinite(main.mp)) sum.mp += main.mp;
  }
  return sum;
}

function applyPct(base, pct) {
  const b = Number(base) || 0;
  const p = Number(pct) || 0;
  return Math.max(0, Math.floor(b * (1 + p / 100)));
}

function progressBar(current, max, width = 10) {
  const cur = Math.max(0, Number(current) || 0);
  const mx = Math.max(1, Number(max) || 1);
  const ratio = Math.max(0, Math.min(1, cur / mx));
  const filled = Math.round(ratio * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

function formatPct(p) {
  const n = Number(p) || 0;
  // gọn: tối đa 1 chữ số thập phân
  const rounded = Math.round(n * 10) / 10;
  return (rounded % 1 === 0) ? String(rounded.toFixed(0)) : String(rounded.toFixed(1));
}

function describeGearItem(it) {
  if (!it) return "(trống)";
  const m = tierMeta(it.tier);
  return `${m.icon} ${it.name || "Trang bị"}`;
}

module.exports = {
  AFFIX_LABELS,
  MAIN_LABELS,
  sumAffixes,
  sumMainPercents,
  applyPct,
  progressBar,
  formatPct,
  describeGearItem,
};
