// utils/pricing.js
// Quy ước giá trị (LT) cho khoáng và trang bị.
// Pricing 1B: giá bán = % của giá mua/giá rèn (craft).

const { TIERS } = require("./tiers");

// "Giá rèn" quy ước cho 1 viên khoáng theo phẩm giai.
// Chỉ dùng nội bộ để tính sell-back / cường hoá.
// Có thể chỉnh lại mà không làm hỏng dữ liệu người chơi.
const ORE_CRAFT_VALUE_LT = {
  pham: 20,
  linh: 55,
  hoang: 120,
  huyen: 260,
  dia: 520,
  thien: 950,
  tien: 1650,
  than: 2600,
};

// % bán lại.
// Ores thường là nguyên liệu thô, bán lại cao hơn trang bị để tránh người chơi bị "kẹt".
const SELL_RATE_ORE = 0.60;
const SELL_RATE_GEAR = 0.50;

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  const i = Math.floor(x);
  if (typeof max === "number") return Math.max(min, Math.min(max, i));
  return Math.max(min, i);
}

function oreCraftValueByTier(tier) {
  return Number(ORE_CRAFT_VALUE_LT[String(tier)]) || ORE_CRAFT_VALUE_LT.pham;
}

function oreSellValueByTier(tier) {
  return Math.max(1, Math.floor(oreCraftValueByTier(tier) * SELL_RATE_ORE));
}

function gearCraftValue(gear) {
  // Nếu có craftValueLt thì dùng (gear tạo mới sẽ có).
  const v = Number(gear?.craftValueLt);
  if (Number.isFinite(v) && v > 0) return Math.floor(v);

  // Fallback cho gear cũ: 5 viên khoáng cùng tier.
  const tier = String(gear?.tier || "pham");
  const base = oreCraftValueByTier(tier) * 5;
  const affCount = Array.isArray(gear?.affixes) ? gear.affixes.length : 0;
  // affix nhiều hơn => gear "đắt" hơn một chút.
  const affMult = 1 + Math.min(0.25, affCount * 0.05);
  return Math.max(1, Math.floor(base * affMult));
}

function gearSellValue(gear) {
  return Math.max(1, Math.floor(gearCraftValue(gear) * SELL_RATE_GEAR));
}

function tierOrder(tier) {
  const i = TIERS.indexOf(String(tier));
  return i >= 0 ? i : 0;
}

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

module.exports = {
  ORE_CRAFT_VALUE_LT,
  SELL_RATE_ORE,
  SELL_RATE_GEAR,
  clampInt,
  oreCraftValueByTier,
  oreSellValueByTier,
  gearCraftValue,
  gearSellValue,
  tierOrder,
  fmtLT,
};
