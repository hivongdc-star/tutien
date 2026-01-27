// utils/forge.js
// Rèn đúc trang bị từ 5 khoáng thạch (UI sẽ gọi).
// Lưu ý: "quality" là nội bộ -> chỉ dùng để roll, KHÔNG hiển thị và KHÔNG cần lưu.

const { randomInt } = require("crypto");
const { TIERS, tierMeta, tierText } = require("./tiers");
const { getOreById, loadOreDB } = require("./mining");

const TIER_INDEX = new Map(TIERS.map((t, i) => [t, i]));
function tierIdx(t) {
  return TIER_INDEX.has(t) ? TIER_INDEX.get(t) : 0;
}
function tierByIdx(i) {
  const idx = Math.max(0, Math.min(TIERS.length - 1, Number(i) || 0));
  return TIERS[idx] || "pham";
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function rand01() {
  // 0..1
  return randomInt(0, 1_000_000) / 1_000_000;
}

function randInt(min, max) {
  const a = Math.ceil(Number(min) || 0);
  const b = Math.floor(Number(max) || 0);
  if (b <= a) return a;
  return randomInt(a, b + 1);
}

// Range nội bộ quality theo tier (chỉ dùng để skew roll)
const QUALITY_RANGE = {
  pham: [0.25, 0.60],
  linh: [0.35, 0.70],
  hoang: [0.45, 0.78],
  huyen: [0.55, 0.85],
  dia: [0.65, 0.90],
  thien: [0.72, 0.94],
  tien: [0.80, 0.97],
  than: [0.90, 1.00],
};

function rollQuality(tier) {
  const [a, b] = QUALITY_RANGE[tier] || QUALITY_RANGE.pham;
  return a + (b - a) * rand01();
}

function rollPctWithQuality(min, max, q) {
  const a = Number(min) || 0;
  const b = Number(max) || 0;
  if (b <= a) return Math.round(a);

  // Skew về phía max khi q cao.
  const qq = clamp(q, 0, 1);
  const skew = Math.pow(qq, 1.6);
  const v = a + (b - a) * skew;
  // jitter nhẹ để không "đồng dạng"
  const jitter = (rand01() - 0.5) * 0.10; // +/-5%
  const v2 = a + (v - a) * (1 + jitter);
  return Math.round(clamp(v2, a, b));
}

// Range % dòng chính theo tier
const MAIN_RANGES = {
  weapon: {
    pham: [1, 5],
    linh: [3, 8],
    hoang: [6, 12],
    huyen: [10, 18],
    dia: [14, 24],
    thien: [20, 32],
    tien: [28, 44],
    than: [40, 60],
  },
  armor: {
    pham: [1, 5],
    linh: [3, 8],
    hoang: [6, 12],
    huyen: [10, 18],
    dia: [14, 24],
    thien: [20, 32],
    tien: [28, 44],
    than: [40, 60],
  },
  boots: {
    pham: [1, 3],
    linh: [2, 5],
    hoang: [4, 8],
    huyen: [6, 12],
    dia: [9, 16],
    thien: [12, 22],
    tien: [16, 30],
    than: [24, 40],
  },
  bracelet: {
    hp: {
      pham: [2, 5],
      linh: [4, 8],
      hoang: [7, 12],
      huyen: [12, 20],
      dia: [18, 28],
      thien: [26, 40],
      tien: [36, 56],
      than: [50, 80],
    },
    mp: {
      pham: [2, 5],
      linh: [4, 8],
      hoang: [7, 12],
      huyen: [12, 20],
      dia: [18, 28],
      thien: [26, 40],
      tien: [36, 56],
      than: [50, 80],
    },
  },
};

// Pool phụ tố chung (weight tổng ~100)
const AFFIX_POOL = [
  ["crit", 22],
  ["crit_dmg", 16],
  ["crit_resist", 18],
  ["armor_pen", 18],
  ["dmg_reduce", 12],
  ["lifesteal", 14],
];

const AFFIX_COUNT_RANGE = {
  pham: [1, 2],
  linh: [1, 3],
  hoang: [2, 3],
  huyen: [2, 4],
  dia: [3, 4],
  thien: [3, 5],
  tien: [4, 5],
  than: [5, 5],
};

// Range % phụ tố theo tier
const AFFIX_RANGES = {
  crit: {
    pham: [1, 3],
    linh: [2, 4],
    hoang: [3, 6],
    huyen: [4, 8],
    dia: [6, 10],
    thien: [8, 12],
    tien: [10, 16],
    than: [14, 20],
  },
  crit_dmg: {
    pham: [4, 10],
    linh: [8, 16],
    hoang: [12, 22],
    huyen: [16, 28],
    dia: [22, 36],
    thien: [28, 44],
    tien: [36, 60],
    than: [50, 80],
  },
  crit_resist: {
    pham: [1, 3],
    linh: [2, 4],
    hoang: [3, 6],
    huyen: [4, 8],
    dia: [6, 10],
    thien: [8, 12],
    tien: [10, 16],
    than: [14, 20],
  },
  armor_pen: {
    pham: [1, 3],
    linh: [2, 4],
    hoang: [3, 6],
    huyen: [4, 8],
    dia: [6, 10],
    thien: [8, 12],
    tien: [10, 16],
    than: [14, 20],
  },
  dmg_reduce: {
    pham: [1, 2],
    linh: [1, 3],
    hoang: [2, 4],
    huyen: [3, 6],
    dia: [4, 7],
    thien: [5, 9],
    tien: [7, 12],
    than: [10, 16],
  },
  lifesteal: {
    pham: [1, 2],
    linh: [1, 3],
    hoang: [2, 4],
    huyen: [3, 5],
    dia: [4, 6],
    thien: [5, 8],
    tien: [6, 10],
    than: [8, 14],
  },
};

function pickWeightedKey(pool) {
  let total = 0;
  for (const [, w] of pool) total += Math.max(0, Number(w) || 0);
  if (total <= 0) return pool[0]?.[0] || null;
  let r = randomInt(1, total + 1);
  for (const [k, w] of pool) {
    r -= Math.max(0, Number(w) || 0);
    if (r <= 0) return k;
  }
  return pool[pool.length - 1]?.[0] || null;
}

function pickAffixStats(n) {
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < n && guard++ < 50) {
    const k = pickWeightedKey(AFFIX_POOL);
    if (!k || used.has(k)) continue;
    used.add(k);
    out.push(k);
  }
  // fallback: nếu pool weight lạ
  while (out.length < n) {
    for (const [k] of AFFIX_POOL) {
      if (!used.has(k)) {
        used.add(k);
        out.push(k);
        break;
      }
    }
    if (out.length >= AFFIX_POOL.length) break;
  }
  return out.slice(0, n);
}

function computeTierFromOres(oreIds) {
  loadOreDB();
  const ids = Array.isArray(oreIds) ? oreIds : [];
  if (ids.length !== 5) throw new Error("Cần đúng 5 khoáng thạch");
  const tiers = ids.map((id) => {
    const o = getOreById(id);
    if (!o) throw new Error(`Khoáng thạch không hợp lệ: ${id}`);
    return tierIdx(o.tier);
  });
  const avg = tiers.reduce((s, x) => s + x, 0) / 5;
  const low = Math.floor(avg);
  const high = Math.ceil(avg);
  if (low === high) return tierByIdx(low);
  const frac = avg - low;
  const countHigh = tiers.filter((x) => x >= high).length;
  let pHigh = frac + 0.15 * (countHigh / 5);
  pHigh = clamp(pHigh, 0, 0.95);
  return rand01() < pHigh ? tierByIdx(high) : tierByIdx(low);
}

function slotLabel(slot) {
  if (slot === "weapon") return "Vũ khí";
  if (slot === "armor") return "Giáp";
  if (slot === "boots") return "Giày";
  if (slot === "bracelet") return "Vòng tay";
  return slot;
}

function slotName(slot) {
  // Tên hiển thị theo vibe tiên hiệp, không lộ nội bộ.
  if (slot === "weapon") return "Bảo Binh";
  if (slot === "armor") return "Hộ Giáp";
  if (slot === "boots") return "Hành Ngoa";
  if (slot === "bracelet") return "Linh Uyển";
  return "Trang Bị";
}

function rollMain(slot, tier, q) {
  if (slot === "weapon") {
    const [a, b] = MAIN_RANGES.weapon[tier] || MAIN_RANGES.weapon.pham;
    return { atkPct: rollPctWithQuality(a, b, q) };
  }
  if (slot === "armor") {
    const [a, b] = MAIN_RANGES.armor[tier] || MAIN_RANGES.armor.pham;
    return { defPct: rollPctWithQuality(a, b, q) };
  }
  if (slot === "boots") {
    const [a, b] = MAIN_RANGES.boots[tier] || MAIN_RANGES.boots.pham;
    return { spdPct: rollPctWithQuality(a, b, q) };
  }
  if (slot === "bracelet") {
    const [ha, hb] = (MAIN_RANGES.bracelet.hp[tier] || MAIN_RANGES.bracelet.hp.pham);
    const [ma, mb] = (MAIN_RANGES.bracelet.mp[tier] || MAIN_RANGES.bracelet.mp.pham);
    return {
      hpPct: rollPctWithQuality(ha, hb, q),
      mpPct: rollPctWithQuality(ma, mb, q),
    };
  }
  // fallback
  const [a, b] = MAIN_RANGES.weapon[tier] || MAIN_RANGES.weapon.pham;
  return { atkPct: rollPctWithQuality(a, b, q) };
}

function rollAffixes(tier, qItem) {
  const [minN, maxN] = AFFIX_COUNT_RANGE[tier] || AFFIX_COUNT_RANGE.pham;
  const n = randInt(minN, maxN);
  const stats = pickAffixStats(n);
  const affixes = [];
  for (const k of stats) {
    const [a, b] = (AFFIX_RANGES[k]?.[tier] || AFFIX_RANGES[k]?.pham || [1, 2]);
    // mỗi affix có jitter quality nhẹ
    const q = clamp(qItem * 0.7 + rand01() * 0.3, 0, 1);
    affixes.push({ stat: k, pct: rollPctWithQuality(a, b, q) });
  }
  return affixes;
}

function makeGearName(slot, tier) {
  const m = tierMeta(tier);
  return `${m.label} ${slotName(slot)}`;
}

function createGearFromOres({ slot, oreIds }) {
  const tier = computeTierFromOres(oreIds);
  const q = rollQuality(tier);
  const main = rollMain(slot, tier, q);
  const affixes = rollAffixes(tier, q);
  const gid = `g_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  return {
    gid,
    slot,
    tier,
    name: makeGearName(slot, tier),
    main,
    affixes,
    createdAt: Date.now(),
    // NOTE: quality không lưu.
  };
}

function formatGearLines(it) {
  const m = tierMeta(it.tier);
  const title = `${m.icon} ${it.name} — ${tierText(it.tier)} (${slotLabel(it.slot)})`;
  const mainParts = [];
  if (Number.isFinite(it?.main?.atkPct)) mainParts.push(`Công +${it.main.atkPct}%`);
  if (Number.isFinite(it?.main?.defPct)) mainParts.push(`Thủ +${it.main.defPct}%`);
  if (Number.isFinite(it?.main?.spdPct)) mainParts.push(`Tốc +${it.main.spdPct}%`);
  if (Number.isFinite(it?.main?.hpPct)) mainParts.push(`Sinh mệnh +${it.main.hpPct}%`);
  if (Number.isFinite(it?.main?.mpPct)) mainParts.push(`Linh lực +${it.main.mpPct}%`);
  const mainLine = mainParts.length ? mainParts.join(" • ") : "(chưa có)";
  const aff = (it.affixes || []).map((a) => ({
    k: String(a.stat || ""),
    v: Number(a.pct) || 0,
  }));
  return { title, mainLine, aff };
}

module.exports = {
  computeTierFromOres,
  createGearFromOres,
  formatGearLines,
};
