// utils/mining.js
// Roll khoáng thạch theo bậc phẩm + bonus rare từ khoáng cụ.

const path = require("path");
const { randomInt } = require("crypto");
const { TIERS } = require("./tiers");

let ORE_DB = null;
function loadOreDB() {
  if (ORE_DB) return ORE_DB;
  try {
    ORE_DB = require(path.join(__dirname, "../data/ores_db.json"));
    if (!Array.isArray(ORE_DB) || ORE_DB.length < 10) throw new Error("ores_db invalid");
  } catch (e) {
    console.error("❌ Không thể tải data/ores_db.json:", e?.message || e);
    ORE_DB = [];
  }
  return ORE_DB;
}

// Tỷ lệ mặc định (tổng = 1000)
// NOTE (giả định an toàn): phân bổ khá phổ biến để người mới vẫn thấy tiến triển.
const BASE_TIER_WEIGHTS = {
  pham: 500,
  linh: 250,
  hoang: 120,
  huyen: 60,
  dia: 30,
  thien: 20,
  tien: 15,
  than: 5,
};

const RARE_TIERS = new Set(["huyen", "dia", "thien", "tien", "than"]);

function pickWeighted(entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  if (!Number.isFinite(total) || total <= 0) return entries[0]?.[0];
  let r = randomInt(1, total + 1);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]?.[0];
}

/**
 * bonusRare (%): tăng tỷ lệ ra các bậc "hiếm" (Huyền+)
 * - ví dụ bonusRare=10 => weight hiếm *1.10
 */
function rollTier({ bonusRare = 0 } = {}) {
  const br = Math.max(0, Number(bonusRare) || 0);
  const entries = TIERS.map((t) => {
    const base = BASE_TIER_WEIGHTS[t] || 0;
    if (!RARE_TIERS.has(t) || br <= 0) return [t, base];
    const inc = Math.round(base * (br / 100));
    return [t, base + inc];
  });
  return pickWeighted(entries);
}

function rollOre({ bonusRare = 0 } = {}) {
  const db = loadOreDB();
  if (!db.length) return null;

  const tier = rollTier({ bonusRare });
  const pool = db.filter((o) => o.tier === tier);
  const use = pool.length ? pool : db;

  // pick ore trong tier theo weight (int)
  const entries = use.map((o) => [o, Math.max(1, Number(o.weight) || 1)]);
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = randomInt(1, total + 1);
  for (const [o, w] of entries) {
    r -= w;
    if (r <= 0) return o;
  }
  return entries[entries.length - 1]?.[0] || null;
}

function getOreById(id) {
  const db = loadOreDB();
  return db.find((o) => o.id === id) || null;
}

module.exports = {
  loadOreDB,
  rollOre,
  getOreById,
  BASE_TIER_WEIGHTS,
};
