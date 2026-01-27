// utils/skills.js
// Quản lý kỹ năng (ngũ hành): DB kỹ năng, sở hữu / trang bị, mảnh ghép.

const fs = require("fs");
const path = require("path");

const skillsPath = path.join(__dirname, "../data/skills_db.json");

let SKILLS = null;

function loadSkillsDB() {
  if (SKILLS) return SKILLS;
  try {
    SKILLS = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
  } catch {
    SKILLS = {};
  }
  return SKILLS;
}

function getSkill(skillId) {
  const db = loadSkillsDB();
  return db[skillId] || null;
}

function listSkills(filter = {}) {
  const db = loadSkillsDB();
  const out = [];
  for (const [id, s] of Object.entries(db)) {
    if (!s) continue;
    if (filter.element && s.element !== filter.element) continue;
    if (filter.rarity && s.rarity !== filter.rarity) continue;
    if (filter.kind && s.kind !== filter.kind) continue;
    out.push({ id, ...s });
  }
  return out;
}

function ensureUserSkills(user) {
  if (!user) return;
  if (!user.skills || typeof user.skills !== "object") user.skills = {};
  if (!Array.isArray(user.skills.owned)) user.skills.owned = [];
  if (!user.skills.equipped || typeof user.skills.equipped !== "object") {
    user.skills.equipped = { actives: [null, null, null, null], passive: null };
  } else {
    if (!Array.isArray(user.skills.equipped.actives)) user.skills.equipped.actives = [null, null, null, null];
    while (user.skills.equipped.actives.length < 4) user.skills.equipped.actives.push(null);
    user.skills.equipped.actives = user.skills.equipped.actives.slice(0, 4);
    if (typeof user.skills.equipped.passive === "undefined") user.skills.equipped.passive = null;
  }

  // Mảnh ghép theo ngũ hành
  if (!user.skills.shards || typeof user.skills.shards !== "object") user.skills.shards = {};
  for (const el of ["kim", "moc", "thuy", "hoa", "tho"]) {
    if (!user.skills.shards[el] || typeof user.skills.shards[el] !== "object") {
      user.skills.shards[el] = { rare: 0, epic: 0 };
    } else {
      if (!Number.isFinite(user.skills.shards[el].rare)) user.skills.shards[el].rare = 0;
      if (!Number.isFinite(user.skills.shards[el].epic)) user.skills.shards[el].epic = 0;
    }
  }
}

function formatSkillName(skillId) {
  const s = getSkill(skillId);
  return s?.name || "(Không rõ)";
}

function rarityText(r) {
  if (r === "common") return "Thường";
  if (r === "rare") return "Hiếm";
  if (r === "epic") return "Cực hiếm";
  return r || "?";
}

function kindText(k) {
  if (k === "active") return "Chủ động";
  if (k === "passive") return "Bị động";
  return k || "?";
}

function canEquipSkill(user, skillId, slot) {
  // slot: { type:'active', idx:0..3 } | { type:'passive' }
  ensureUserSkills(user);
  const s = getSkill(skillId);
  if (!s) return { ok: false, reason: "Kỹ năng không tồn tại." };
  if (!user.skills.owned.includes(skillId)) return { ok: false, reason: "Bạn chưa sở hữu kỹ năng này." };
  if (s.element && user.element && s.element !== user.element) {
    return { ok: false, reason: "Ngũ hành không phù hợp." };
  }
  if (slot.type === "active" && s.kind !== "active") return { ok: false, reason: "Đây không phải kỹ năng chủ động." };
  if (slot.type === "passive" && s.kind !== "passive") return { ok: false, reason: "Đây không phải kỹ năng bị động." };
  return { ok: true };
}

function equipSkill(user, skillId, slot) {
  const check = canEquipSkill(user, skillId, slot);
  if (!check.ok) return check;
  if (slot.type === "active") {
    user.skills.equipped.actives[slot.idx] = skillId;
  } else {
    user.skills.equipped.passive = skillId;
  }
  return { ok: true };
}

function unequipSkill(user, slot) {
  ensureUserSkills(user);
  if (slot.type === "active") user.skills.equipped.actives[slot.idx] = null;
  else user.skills.equipped.passive = null;
}

function addOwnedSkill(user, skillId) {
  ensureUserSkills(user);
  const s = getSkill(skillId);
  if (!s) return { ok: false, reason: "Kỹ năng không tồn tại." };
  if (s.element && user.element && s.element !== user.element) {
    return { ok: false, reason: "Ngũ hành không phù hợp." };
  }
  if (user.skills.owned.includes(skillId)) return { ok: false, reason: "Bạn đã sở hữu kỹ năng này." };
  user.skills.owned.push(skillId);
  return { ok: true };
}

function addShard(user, element, rarity, amount = 1) {
  ensureUserSkills(user);
  const el = ["kim", "moc", "thuy", "hoa", "tho"].includes(element) ? element : null;
  if (!el) return;
  if (rarity === "rare") user.skills.shards[el].rare += Math.max(0, Number(amount) || 0);
  if (rarity === "epic") user.skills.shards[el].epic += Math.max(0, Number(amount) || 0);
}

function getShardCount(user, element, rarity) {
  ensureUserSkills(user);
  const el = element;
  if (!user.skills.shards[el]) return 0;
  return Math.max(0, Number(user.skills.shards[el][rarity]) || 0);
}

function spendShards(user, element, rarity, amount) {
  ensureUserSkills(user);
  const cur = getShardCount(user, element, rarity);
  const need = Math.max(0, Number(amount) || 0);
  if (cur < need) return { ok: false, reason: "Không đủ mảnh." };
  user.skills.shards[element][rarity] = cur - need;
  return { ok: true };
}

function computePassiveTotals(user) {
  // tổng các chỉ số dạng % cho combat (crit, pen, ...)
  ensureUserSkills(user);
  const out = {
    crit: 0,
    crit_resist: 0,
    armor_pen: 0,
    crit_dmg: 0,
    dmg_reduce: 0,
    lifesteal: 0,
    dodge: 0,
    accuracy: 0,
  };

  const pid = user.skills.equipped.passive;
  if (!pid) return out;
  const s = getSkill(pid);
  if (!s || s.kind !== "passive") return out;
  const p = s.passive || null;
  if (!p || !p.stat) return out;
  const key = String(p.stat);
  const pct = Number(p.pct);
  if (!Number.isFinite(pct)) return out;
  if (out[key] === undefined) out[key] = 0;
  out[key] += pct;
  return out;
}

module.exports = {
  loadSkillsDB,
  getSkill,
  listSkills,
  ensureUserSkills,
  formatSkillName,
  rarityText,
  kindText,
  equipSkill,
  unequipSkill,
  addOwnedSkill,
  addShard,
  getShardCount,
  spendShards,
  computePassiveTotals,
};
