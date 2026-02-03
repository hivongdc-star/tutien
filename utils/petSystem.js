// utils/petSystem.js
// Pet system (Lazy tick) — additive, không phá schema cũ

const path = require("path");
const { randomInt } = require("crypto");

let ORES_DB = [];
try {
  ORES_DB = require(path.join(__dirname, "../data/ores_db.json"));
  if (!Array.isArray(ORES_DB) || ORES_DB.length < 5) throw new Error("ores_db invalid");
} catch (e) {
  console.error("❌ Không thể tải data/ores_db.json:", e?.message || e);
  ORES_DB = [];
}

// ===== Config (đã chốt) =====
const PET_TICK_INTERVAL_MS = 10 * 60 * 1000; // 10 phút
const PET_MAX_OFFLINE_MS = 12 * 60 * 60 * 1000; // 12 tiếng

const PET_EGG_ITEM_ID = "pet_egg_basic";

// Hatch rates (mỗi trứng)
// - Pet: 10%
// - Shard: 55% (1–3)
// - Nothing: 35%
const HATCH_RATE_PET = 0.10;
const HATCH_RATE_SHARD = 0.55;

const SHARDS_PER_PET = 10;

// Realm/level gate (giống nhân vật: đủ cấp mới đột phá được)
// Mỗi cảnh giới có 10 cấp (1-10, 11-20, ...)
const LEVELS_PER_REALM = 10;
function getPetLevelCap(realm) {
  realm = Math.max(1, Math.floor(Number(realm) || 1));
  return realm * LEVELS_PER_REALM;
}

// Hunger/Stamina model
const MAX_HUNGER = 100;
const MAX_STAMINA = 100;

// Per tick
const WORK_DRAIN_HUNGER = 1;
const WORK_DRAIN_STAMINA = 1;
const REST_GAIN_STAMINA = 2;
const REST_DRAIN_HUNGER = 1;

// Tăng EXP pet nhận được khi ăn cá (theo yêu cầu).
// Chỉ áp cho feed từ cá (không đụng các nguồn EXP khác).
const FEED_XP_MULT = 3;

const JOBS = ["mine", "explore", "rest"];

// ===== Pet catalog (5 loại, tên 4 chữ) =====
const PETS = [
  {
    id: "han_bang_ky_lan",
    name: "Hàn Băng Kỳ Lân",
    element: "thuy",
    image: "assets/pets/han_bang_ky_lan.png",
    // bonus nhỏ để phân biệt (an toàn)
    mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 0 },
  },
  {
    id: "huyet_nguyet_linh_ho",
    name: "Huyết Nguyệt Linh Hồ",
    element: "hoa",
    image: "assets/pets/huyet_nguyet_linh_ho.png",
    mods: { shardBonusPct: 20, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 0 },
  },
  {
    id: "loi_minh_ung_vuong",
    name: "Lôi Minh Ưng Vương",
    element: "kim",
    image: "assets/pets/loi_minh_ung_vuong.png",
    mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 15 },
  },
  {
    id: "thanh_moc_tieu_long",
    name: "Thanh Mộc Tiểu Long",
    element: "moc",
    image: "assets/pets/thanh_moc_tieu_long.png",
    mods: { shardBonusPct: 0, mineTierBonus: 1, restStaminaBonus: 0, exploreLtBonusPct: 0 },
  },
  {
    id: "kim_diem_phuong_hoang",
    name: "Kim Diễm Phượng Hoàng",
    element: "hoa",
    image: "assets/pets/kim_diem_phuong_hoang.png",
    mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 1, exploreLtBonusPct: 0 },
  },
];

const PET_BY_ID = Object.create(null);
for (const p of PETS) PET_BY_ID[p.id] = p;

function listPets() {
  return PETS.slice();
}

function getPetMeta(petId) {
  return PET_BY_ID[petId] || null;
}

function ensurePetShape(user) {
  if (!user) return null;
  if (!user.pet || typeof user.pet !== "object") user.pet = {};

  if (typeof user.pet.activePetId === "undefined") user.pet.activePetId = null;
  if (!user.pet.pets || typeof user.pet.pets !== "object") user.pet.pets = {};
  if (!user.pet.shards || typeof user.pet.shards !== "object") user.pet.shards = {};
  if (!Number.isFinite(user.pet.feedBufferXp)) user.pet.feedBufferXp = 0;

  // backfill mining store (pet mine sẽ ghi vào đây)
  if (!user.mining) user.mining = {};
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};

  // normalize pets map
  for (const petId of Object.keys(user.pet.pets)) {
    const st = user.pet.pets[petId];
    if (!st || typeof st !== "object") {
      delete user.pet.pets[petId];
      continue;
    }
    if (!Number.isFinite(st.count)) st.count = 0;
    if (!Number.isFinite(st.realm)) st.realm = 1;
    if (!Number.isFinite(st.level)) st.level = 1;
    if (!Number.isFinite(st.xp)) st.xp = 0;
    if (!Number.isFinite(st.hunger)) st.hunger = 80;
    if (!Number.isFinite(st.stamina)) st.stamina = 80;
    if (!JOBS.includes(st.job)) st.job = "rest";
    if (!Number.isFinite(st.lastTickAt)) st.lastTickAt = Date.now();

    st.hunger = clampInt(st.hunger, 0, MAX_HUNGER);
    st.stamina = clampInt(st.stamina, 0, MAX_STAMINA);
    st.count = Math.max(0, Math.floor(st.count));
    st.realm = Math.max(1, Math.floor(st.realm));
    st.level = Math.max(1, Math.floor(st.level));
    st.xp = Math.max(0, Math.floor(st.xp));
  }

  // normalize shards
  for (const petId of Object.keys(user.pet.shards)) {
    const v = user.pet.shards[petId];
    if (!Number.isFinite(v) || v <= 0) delete user.pet.shards[petId];
    else user.pet.shards[petId] = Math.floor(v);
  }

  // activePetId phải tồn tại và count>0
  if (user.pet.activePetId) {
    const st = user.pet.pets[user.pet.activePetId];
    if (!st || (st.count || 0) <= 0) user.pet.activePetId = null;
  }

  return user;
}

function clampInt(n, lo, hi) {
  n = Math.floor(Number(n) || 0);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function xpToNextLevel(level, realm) {
  // an toàn: curve tăng chậm, tránh pet lên quá nhanh
  level = Math.max(1, Math.floor(level || 1));
  realm = Math.max(1, Math.floor(realm || 1));
  return 60 + level * 25 + (realm - 1) * 20;
}

function applyPetLevelUp(petState) {
  let leveled = 0;
  const HARD_MAX_LEVEL = 999; // an toàn chống runaway
  const cap = Math.min(getPetLevelCap(petState.realm), HARD_MAX_LEVEL);

  while (petState.level < cap && petState.xp >= xpToNextLevel(petState.level, petState.realm)) {
    petState.xp -= xpToNextLevel(petState.level, petState.realm);
    petState.level += 1;
    leveled += 1;
    if (petState.level >= HARD_MAX_LEVEL) {
      petState.level = HARD_MAX_LEVEL;
      petState.xp = Math.min(petState.xp, xpToNextLevel(HARD_MAX_LEVEL, petState.realm) - 1);
      break;
    }
  }
  return leveled;
}

function addPetCount(user, petId, amount) {
  ensurePetShape(user);
  if (!PET_BY_ID[petId]) return;

  if (!user.pet.pets[petId]) {
    user.pet.pets[petId] = {
      count: 0,
      realm: 1,
      level: 1,
      xp: 0,
      hunger: 80,
      stamina: 80,
      job: "rest",
      lastTickAt: Date.now(),
    };
  }
  user.pet.pets[petId].count = Math.max(0, (user.pet.pets[petId].count || 0) + amount);

  // auto equip nếu chưa equip
  if (!user.pet.activePetId && user.pet.pets[petId].count > 0) {
    user.pet.activePetId = petId;
  }
}

function addShards(user, petId, amount) {
  ensurePetShape(user);
  if (!PET_BY_ID[petId]) return;
  user.pet.shards[petId] = (user.pet.shards[petId] || 0) + Math.max(0, Math.floor(amount || 0));
  convertShardsIfPossible(user, petId);
}

function convertShardsIfPossible(user, petId) {
  ensurePetShape(user);
  const cur = user.pet.shards[petId] || 0;
  if (cur < SHARDS_PER_PET) return 0;
  const make = Math.floor(cur / SHARDS_PER_PET);
  user.pet.shards[petId] = cur - make * SHARDS_PER_PET;
  if (user.pet.shards[petId] <= 0) delete user.pet.shards[petId];
  addPetCount(user, petId, make);
  return make;
}

function equipPet(user, petId) {
  ensurePetShape(user);
  const st = user.pet.pets[petId];
  if (!st || (st.count || 0) <= 0) return { ok: false, message: "❌ Bạn không sở hữu linh thú này." };
  user.pet.activePetId = petId;

  // apply buffer XP ngay khi equip
  const applied = applyFeedBufferToActive(user);
  return { ok: true, message: `✅ Đã trang bị **${getPetMeta(petId)?.name || petId}**.${applied > 0 ? ` (+${applied} XP từ cá tồn đọng)` : ""}` };
}

function setPetJob(user, job) {
  ensurePetShape(user);
  if (!JOBS.includes(job)) return { ok: false, message: "❌ Job không hợp lệ." };
  const pid = user.pet.activePetId;
  if (!pid) return { ok: false, message: "❌ Bạn chưa trang bị linh thú." };

  user.pet.pets[pid].job = job;
  return { ok: true, message: `✅ Linh thú chuyển sang **${job}**.` };
}

function breakthroughPet(user, petId) {
  ensurePetShape(user);
  const pid = petId || user.pet.activePetId;
  if (!pid) return { ok: false, message: "❌ Bạn chưa trang bị linh thú." };
  const st = user.pet.pets[pid];
  if (!st || (st.count || 0) <= 0) return { ok: false, message: "❌ Bạn không sở hữu linh thú này." };

  // Gate: phải đạt cấp tối đa của cảnh giới hiện tại mới được đột phá
  const capLv = getPetLevelCap(st.realm);
  if ((st.level || 1) < capLv) {
    return { ok: false, message: `❌ Linh thú chưa đủ cấp để đột phá. (Lv ${st.level}/${capLv})` };
  }

  const needTotal = st.realm + 1; // n -> n+1 cần n+1 bản
  const consume = st.realm; // tiêu hao n bản

  if ((st.count || 0) < needTotal) {
    return { ok: false, message: `❌ Cần tổng **${needTotal}** bản (hiện có ${st.count}).` };
  }

  st.count -= consume;
  st.realm += 1;

  // Sau khi tăng cảnh giới, nếu còn XP tồn thì có thể lên thêm cấp trong cap mới
  applyPetLevelUp(st);

  return { ok: true, message: `✅ **${getPetMeta(pid)?.name || pid}** đột phá thành công! (tiêu hao ${consume} bản)` };
}

function applyFeedBufferToActive(user) {
  ensurePetShape(user);
  const pid = user.pet.activePetId;
  if (!pid) return 0;
  const buf = Math.floor(user.pet.feedBufferXp || 0);
  if (buf <= 0) return 0;

  const st = user.pet.pets[pid];
  if (!st) return 0;

  st.xp += buf;
  const leveled = applyPetLevelUp(st);
  user.pet.feedBufferXp = 0;
  return buf;
}

function feedPetFromFish(user, fish, sizeCm, xpOverride) {
  ensurePetShape(user);

  // map rarity -> xp (cá save kho sẽ không vào đây)
  const rarity = String(fish?.rarity || "thường").toLowerCase();
  const baseXpByRarity = {
    // scheme A
    "thường": 6,
    "khá": 10,
    "hiếm": 15,
    "cực hiếm": 22,
    // scheme B (nếu bạn dùng tier trực tiếp)
    "phàm": 6,
    "linh": 10,
    "hoàng": 13,
    "huyền": 15,
    "địa": 22,
  };
  const baseHungerByRarity = {
    // scheme A
    "thường": 1,
    "khá": 2,
    "hiếm": 3,
    "cực hiếm": 4,
    // scheme B
    "phàm": 1,
    "linh": 2,
    "hoàng": 2,
    "huyền": 3,
    "địa": 4,
  };

  const baseXp = baseXpByRarity[rarity] ?? 6;
  const sizeBonus = Number.isFinite(sizeCm) && sizeCm > 0 ? Math.min(8, Math.floor(sizeCm / 10)) : 0;
  const computedXp = Math.max(1, baseXp + sizeBonus);
  const rawXp = Number.isFinite(xpOverride) && xpOverride > 0 ? Math.floor(xpOverride) : computedXp;
  const xpGain = Math.max(1, Math.floor(rawXp * FEED_XP_MULT));
  const hungerGain = baseHungerByRarity[rarity] ?? 1;

  const pid = user.pet.activePetId;
  if (!pid) {
    // không có pet: buffer XP (cap an toàn)
    const cap = 50_000;
    user.pet.feedBufferXp = Math.min(cap, (user.pet.feedBufferXp || 0) + xpGain);
    return { ok: true, buffered: true, xpGain, hungerGain: 0, petId: null, leveled: 0 };
  }

  const st = user.pet.pets[pid];
  if (!st || (st.count || 0) <= 0) {
    user.pet.activePetId = null;
    user.pet.feedBufferXp = Math.min(50_000, (user.pet.feedBufferXp || 0) + xpGain);
    return { ok: true, buffered: true, xpGain, hungerGain: 0, petId: null, leveled: 0 };
  }

  // feed
  st.xp += xpGain;
  st.hunger = clampInt((st.hunger || 0) + hungerGain, 0, MAX_HUNGER);

  const leveled = applyPetLevelUp(st);
  return { ok: true, buffered: false, xpGain, hungerGain, petId: pid, leveled };
}

function applyPetIdle(user, now = Date.now()) {
  ensurePetShape(user);
  const pid = user.pet.activePetId;
  if (!pid) return { ok: true, ticks: 0, summary: null };

  const st = user.pet.pets[pid];
  if (!st || (st.count || 0) <= 0) {
    user.pet.activePetId = null;
    return { ok: true, ticks: 0, summary: null };
  }

  const last = Number.isFinite(st.lastTickAt) ? st.lastTickAt : now;
  let dt = now - last;
  if (dt <= 0) {
    st.lastTickAt = now;
    return { ok: true, ticks: 0, summary: null };
  }

  dt = Math.min(dt, PET_MAX_OFFLINE_MS);
  const ticks = Math.floor(dt / PET_TICK_INTERVAL_MS);
  if (ticks <= 0) return { ok: true, ticks: 0, summary: null };

  const meta = getPetMeta(pid);
  const mods = meta?.mods || {};

  const summary = {
    job: st.job,
    ticksApplied: 0,
    ltGained: 0,
    ores: {},
    shards: {},
    stoppedBy: null,
  };

  for (let t = 0; t < ticks; t++) {
    if (st.job === "rest") {
      const bonus = Number(mods.restStaminaBonus || 0);
      st.stamina = clampInt((st.stamina || 0) + REST_GAIN_STAMINA + bonus, 0, MAX_STAMINA);
      st.hunger = clampInt((st.hunger || 0) - REST_DRAIN_HUNGER, 0, MAX_HUNGER);
      summary.ticksApplied += 1;
      continue;
    }

    // work jobs
    if ((st.stamina || 0) <= 0) {
      summary.stoppedBy = "stamina";
      break;
    }
    if ((st.hunger || 0) <= 0) {
      summary.stoppedBy = "hunger";
      break;
    }

    st.stamina = clampInt((st.stamina || 0) - WORK_DRAIN_STAMINA, 0, MAX_STAMINA);
    st.hunger = clampInt((st.hunger || 0) - WORK_DRAIN_HUNGER, 0, MAX_HUNGER);

    if (st.job === "mine") {
      const oreId = pickOreForPet(st.realm, st.level, pid);
      if (oreId) {
        user.mining.ores[oreId] = (user.mining.ores[oreId] || 0) + 1;
        summary.ores[oreId] = (summary.ores[oreId] || 0) + 1;
      }
    } else if (st.job === "explore") {
      const lt = calcExploreLt(st.realm, st.level, mods.exploreLtBonusPct || 0);
      if (lt > 0) {
        user.lt = (user.lt || 0) + lt;
        summary.ltGained += lt;
      }

      // shard chance (rất thấp)
      const shardHit = rollShardHit(mods.shardBonusPct || 0);
      if (shardHit) {
        const gotPetId = pickRandomPetId();
        addShards(user, gotPetId, 1);
        summary.shards[gotPetId] = (summary.shards[gotPetId] || 0) + 1;
      }
    }

    summary.ticksApplied += 1;
  }

  // advance lastTickAt theo ticksApplied để giữ phần lẻ
  st.lastTickAt = last + summary.ticksApplied * PET_TICK_INTERVAL_MS;
  if (st.lastTickAt > now) st.lastTickAt = now;

  if (summary.ticksApplied <= 0) return { ok: true, ticks: 0, summary: null };
  return { ok: true, ticks: summary.ticksApplied, summary };
}

function pickRandomPetId() {
  return PETS[randomInt(0, PETS.length)].id;
}

function rollShardHit(bonusPct) {
  // base 2%/tick
  const base = 2;
  const chancePct = Math.max(0, base + Math.floor(base * (Number(bonusPct || 0) / 100)));
  // randomInt(0,100) < chancePct
  return randomInt(0, 100) < chancePct;
}

function calcExploreLt(realm, level, bonusPct) {
  realm = Math.max(1, Math.floor(realm || 1));
  level = Math.max(1, Math.floor(level || 1));

  // 3–8 base, scale nhẹ theo realm/level
  const base = randomInt(3, 9);
  const mul = 1 + 0.08 * (realm - 1) + 0.02 * (level - 1);
  const bonusMul = 1 + (Number(bonusPct || 0) / 100);
  return Math.max(0, Math.floor(base * mul * bonusMul));
}

function pickOreForPet(realm, level, petId) {
  if (!ORES_DB.length) return null;
  realm = Math.max(1, Math.floor(realm || 1));
  level = Math.max(1, Math.floor(level || 1));
  const meta = getPetMeta(petId);
  const tierBonus = Number(meta?.mods?.mineTierBonus || 0);

  const tierPool = pickTierPool(realm + tierBonus, level);
  const candidates = ORES_DB.filter((o) => tierPool.includes(o.tier));
  if (!candidates.length) return ORES_DB[0]?.id || null;

  // weighted pick theo ores_db weight
  let total = 0;
  for (const it of candidates) total += Number(it.weight || 1);
  if (total <= 0) return candidates[0].id;

  let r = randomInt(1, total + 1);
  for (const it of candidates) {
    r -= Number(it.weight || 1);
    if (r <= 0) return it.id;
  }
  return candidates[candidates.length - 1].id;
}

function pickTierPool(realm, level) {
  // Pet mine: chủ yếu tier thấp, scale nhẹ
  // realm tăng sẽ mở thêm tier cao với tỉ lệ rất thấp.
  const r = Math.max(1, realm);

  // base distribution by realm
  if (r <= 1) return ["pham", "linh"]; // linh rất ít vì weight sẽ quyết định
  if (r === 2) return ["pham", "linh", "hoang"];
  if (r === 3) return ["linh", "hoang", "huyen"];
  if (r === 4) return ["hoang", "huyen", "dia", "thien"];
  if (r === 5) return ["huyen", "dia", "thien", "tien"];
  return ["dia", "thien", "tien", "than"]; // realm rất cao: mở Than cực hiếm
}

function hatchEggs(user, count) {
  ensurePetShape(user);
  count = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));

  user.inventory = user.inventory || {};
  const have = user.inventory[PET_EGG_ITEM_ID] || 0;
  if (have < count) return { ok: false, message: "❌ Không đủ trứng." };

  user.inventory[PET_EGG_ITEM_ID] = have - count;
  if (user.inventory[PET_EGG_ITEM_ID] <= 0) delete user.inventory[PET_EGG_ITEM_ID];

  const result = {
    eggs: count,
    nothing: 0,
    pets: {},
    shards: {},
    crafted: {},
  };

  for (let i = 0; i < count; i++) {
    // 0..9999
    const roll = randomInt(0, 10000);
    const petCut = Math.floor(HATCH_RATE_PET * 10000);
    const shardCut = petCut + Math.floor(HATCH_RATE_SHARD * 10000);

    if (roll < petCut) {
      const pid = pickRandomPetId();
      addPetCount(user, pid, 1);
      result.pets[pid] = (result.pets[pid] || 0) + 1;
      continue;
    }

    if (roll < shardCut) {
      const pid = pickRandomPetId();
      const shards = randomInt(1, 4); // 1..3

      const beforeCount = user.pet?.pets?.[pid]?.count || 0;
      addShards(user, pid, shards);
      result.shards[pid] = (result.shards[pid] || 0) + shards;

      const afterCount = user.pet?.pets?.[pid]?.count || 0;
      const made = Math.max(0, afterCount - beforeCount);
      if (made > 0) result.crafted[pid] = (result.crafted[pid] || 0) + made;
      continue;
    }

    result.nothing += 1;
  }

  // global craft pass (trường hợp cộng shard nhiều lần)
  for (const pid of Object.keys(user.pet.shards)) {
    const made = convertShardsIfPossible(user, pid);
    if (made > 0) result.crafted[pid] = (result.crafted[pid] || 0) + made;
  }

  return { ok: true, result };
}

function getPetImagePath(petId) {
  const meta = getPetMeta(petId);
  if (!meta?.image) return null;
  return path.join(__dirname, "..", meta.image);
}

module.exports = {
  PET_EGG_ITEM_ID,
  PET_TICK_INTERVAL_MS,
  PET_MAX_OFFLINE_MS,
  SHARDS_PER_PET,
  getPetLevelCap,
  listPets,
  getPetMeta,
  getPetImagePath,
  ensurePetShape,
  applyPetIdle,
  feedPetFromFish,
  hatchEggs,
  equipPet,
  setPetJob,
  breakthroughPet,
};
