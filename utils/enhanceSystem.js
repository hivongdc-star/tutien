// utils/enhanceSystem.js
// Cường hoá trang bị (2C): có thể thất bại và tụt cấp cường hoá.

const { TIERS } = require("./tiers");
const { oreSellValueByTier, tierOrder } = require("./pricing");
const { loadOreDB, getOreById } = require("./mining");

// 2C: user chọn max +15
const MAX_ENH = 15;

// Tỷ lệ thành công theo cấp hiện tại (tăng lên cấp tiếp theo).
// Ví dụ: đang +3 -> roll theo SUCCESS_RATE[3] để lên +4.
const SUCCESS_RATE = [
  0.90, // +0 -> +1
  0.85, // +1 -> +2
  0.78, // +2 -> +3
  0.68, // +3 -> +4
  0.55, // +4 -> +5
  0.45, // +5 -> +6
  0.35, // +6 -> +7
  0.25, // +7 -> +8
  0.18, // +8 -> +9
  0.12, // +9 -> +10
  0.10, // +10 -> +11
  0.08, // +11 -> +12
  0.06, // +12 -> +13
  0.04, // +13 -> +14
  0.03, // +14 -> +15
];

function ensureEnhanceFields(gear) {
  if (!gear || typeof gear !== "object") return;
  const lv = Number(gear.enhanceLevel);
  if (!Number.isFinite(lv)) gear.enhanceLevel = 0;
  gear.enhanceLevel = Math.max(0, Math.min(MAX_ENH, Math.floor(Number(gear.enhanceLevel) || 0)));
  if (typeof gear.craftValueLt !== "undefined") {
    const v = Number(gear.craftValueLt);
    if (!Number.isFinite(v) || v <= 0) delete gear.craftValueLt;
    else gear.craftValueLt = Math.floor(v);
  }
}

function successRate(curEnh) {
  const lv = Math.max(0, Math.min(MAX_ENH, Math.floor(Number(curEnh) || 0)));
  if (lv >= MAX_ENH) return 0;
  return SUCCESS_RATE[lv] ?? 0.1;
}

function enhanceCost(gear) {
  // Cost dựa trên tier + cấp hiện tại.
  const tier = String(gear?.tier || "pham");
  const lv = Math.max(0, Math.min(MAX_ENH, Math.floor(Number(gear?.enhanceLevel) || 0)));
  // LT: tỉ lệ theo "giá khoáng" để đồng nhất economy.
  const base = oreSellValueByTier(tier) * 8;
  // lv cao (10+) tăng chi phí nhanh hơn một chút
  const extra = lv > 10 ? (lv - 10) * 0.35 : 0;
  const lt = Math.max(50, Math.floor(base * (1 + lv * 0.55 + extra)));

  // Ores: tự động tiêu thụ đá tier >= gear tier.
  // 0-9: 1..5; 10-15: tăng chậm để không "đốt" khoáng quá mạnh
  const oreNeed = 1 + Math.floor(lv / 2) + (lv >= 12 ? 1 : 0);
  return { lt, oreNeed, minTier: tier };
}

function pickOreIdsForConsume(user, minTier, need) {
  loadOreDB();
  const ores = user?.mining?.ores || {};
  const needN = Math.max(0, Math.floor(Number(need) || 0));
  if (needN <= 0) return [];

  const minIdx = tierOrder(minTier);
  // gom theo tier tăng dần, ưu tiên tier thấp nhất vẫn hợp lệ.
  const entries = Object.entries(ores)
    .map(([id, qty]) => ({ id, qty: Math.max(0, Number(qty) || 0), ore: getOreById(id) }))
    .filter((x) => x.qty > 0 && x.ore && tierOrder(x.ore.tier) >= minIdx)
    .sort((a, b) => {
      const ta = tierOrder(a.ore.tier);
      const tb = tierOrder(b.ore.tier);
      if (ta !== tb) return ta - tb;
      return String(a.ore.name).localeCompare(String(b.ore.name));
    });

  const picked = [];
  let left = needN;
  for (const it of entries) {
    if (left <= 0) break;
    const take = Math.min(left, it.qty);
    for (let k = 0; k < take; k++) picked.push(it.id);
    left -= take;
  }

  if (left > 0) return []; // không đủ đá
  return picked;
}

function consumeOres(user, oreIds) {
  const ores = user?.mining?.ores || {};
  for (const id of oreIds) {
    const cur = Math.max(0, Number(ores[id]) || 0);
    if (cur <= 0) continue;
    const next = cur - 1;
    if (next <= 0) delete ores[id];
    else ores[id] = next;
  }
  if (user?.mining) user.mining.ores = ores;
}

function attemptEnhance({ user, gear }) {
  if (!user || !gear) return { ok: false, message: "Thiếu dữ liệu." };
  ensureEnhanceFields(gear);
  const lv = gear.enhanceLevel;
  if (lv >= MAX_ENH) return { ok: false, message: "Trang bị đã đạt cấp cường hoá tối đa." };

  // shape mining
  if (!user.mining) user.mining = {};
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};

  const cost = enhanceCost(gear);
  const ltNow = Math.max(0, Number(user.lt) || 0);
  if (ltNow < cost.lt) {
    return { ok: false, message: `Không đủ LT (cần ${cost.lt}).` };
  }

  const picked = pickOreIdsForConsume(user, cost.minTier, cost.oreNeed);
  if (!picked.length) {
    return { ok: false, message: `Không đủ khoáng để cường hoá (cần ${cost.oreNeed} viên ${cost.minTier} trở lên).` };
  }

  // deduct
  user.lt = ltNow - cost.lt;
  consumeOres(user, picked);

  const rate = successRate(lv);
  const roll = Math.random();
  const success = roll < rate;
  let before = lv;
  let after = lv;
  if (success) after = Math.min(MAX_ENH, lv + 1);
  else after = Math.max(0, lv - 1);
  gear.enhanceLevel = after;

  return {
    ok: true,
    success,
    before,
    after,
    rate,
    cost,
    consumedOreIds: picked,
  };
}

module.exports = {
  MAX_ENH,
  ensureEnhanceFields,
  successRate,
  enhanceCost,
  attemptEnhance,
};
