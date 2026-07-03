// utils/enhanceSystem.js
// Cường hoá trang bị (2C): có thể thất bại và tụt cấp cường hoá.
// Từ bản này, cường hoá dùng linh tài trong shop thay vì trừ khoáng thạch đào được.

const { tierOrder, oreSellValueByTier } = require("./pricing");
const { tierText } = require("./tiers");
const { listItems } = require("../shop/shopUtils");

const MAX_ENH = 15;

const SUCCESS_RATE = [
  0.90, 0.85, 0.78, 0.68, 0.55,
  0.45, 0.35, 0.25, 0.18, 0.12,
  0.10, 0.08, 0.06, 0.04, 0.03,
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
  const tier = String(gear?.tier || "pham");
  const lv = Math.max(0, Math.min(MAX_ENH, Math.floor(Number(gear?.enhanceLevel) || 0)));
  const base = oreSellValueByTier(tier) * 8;
  const extra = lv > 10 ? (lv - 10) * 0.35 : 0;
  const lt = Math.max(50, Math.floor(base * (1 + lv * 0.55 + extra)));
  const materialNeed = 1 + Math.floor(lv / 2) + (lv >= 12 ? 1 : 0);
  return { lt, materialNeed, minTier: tier };
}

function listEnhanceMaterials() {
  const catalog = listItems();
  return Object.entries(catalog)
    .filter(([, it]) => it && it.type === "enhance_material")
    .map(([id, it]) => ({ id, ...it }))
    .sort((a, b) => tierOrder(a.tier) - tierOrder(b.tier));
}

function pickMaterialIdsForConsume(user, minTier, need) {
  const inv = user?.inventory || {};
  const needN = Math.max(0, Math.floor(Number(need) || 0));
  if (needN <= 0) return [];

  const minIdx = tierOrder(minTier);
  const entries = listEnhanceMaterials()
    .map((it) => ({ id: it.id, qty: Math.max(0, Number(inv[it.id]) || 0), item: it }))
    .filter((x) => x.qty > 0 && tierOrder(x.item.tier) >= minIdx)
    .sort((a, b) => {
      const ta = tierOrder(a.item.tier);
      const tb = tierOrder(b.item.tier);
      if (ta !== tb) return ta - tb;
      return String(a.item.name).localeCompare(String(b.item.name));
    });

  const picked = [];
  let left = needN;
  for (const it of entries) {
    if (left <= 0) break;
    const take = Math.min(left, it.qty);
    for (let k = 0; k < take; k++) picked.push(it.id);
    left -= take;
  }
  if (left > 0) return [];
  return picked;
}

function consumeMaterials(user, itemIds) {
  const inv = user?.inventory || {};
  for (const id of itemIds) {
    const cur = Math.max(0, Number(inv[id]) || 0);
    if (cur <= 0) continue;
    const next = cur - 1;
    if (next <= 0) delete inv[id];
    else inv[id] = next;
  }
  user.inventory = inv;
}

function attemptEnhance({ user, gear }) {
  if (!user || !gear) return { ok: false, message: "Dữ liệu pháp bảo chưa sẵn sàng." };
  ensureEnhanceFields(gear);
  const lv = gear.enhanceLevel;
  if (lv >= MAX_ENH) return { ok: false, message: "Trang bị đã đạt cấp cường hoá tối đa." };

  if (!user.inventory || typeof user.inventory !== "object") user.inventory = {};

  const cost = enhanceCost(gear);
  const ltNow = Math.max(0, Number(user.lt) || 0);
  if (ltNow < cost.lt) {
    return { ok: false, message: `Không đủ LT (cần ${cost.lt}).` };
  }

  const picked = pickMaterialIdsForConsume(user, cost.minTier, cost.materialNeed);
  if (!picked.length) {
    return { ok: false, message: `Không đủ linh tài cường hoá (cần ${cost.materialNeed} món ${tierText(cost.minTier)} trở lên).` };
  }

  user.lt = ltNow - cost.lt;
  consumeMaterials(user, picked);

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
    consumedItemIds: picked,
  };
}

module.exports = {
  MAX_ENH,
  ensureEnhanceFields,
  successRate,
  enhanceCost,
  attemptEnhance,
};
