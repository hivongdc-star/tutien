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

// =========================
// Skill description helpers
// =========================

const PASSIVE_STAT_LABELS = {
  crit: "Tỷ lệ bạo kích",
  crit_resist: "Kháng bạo kích",
  armor_pen: "Xuyên giáp",
  crit_dmg: "Sát thương bạo kích",
  dmg_reduce: "Giảm sát thương",
  lifesteal: "Hút máu",
  dodge: "Né tránh",
  accuracy: "Chính xác",
};

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function templateText(tpl) {
  if (tpl === "BURST") return "Đột kích";
  if (tpl === "AOE") return "Quét ngang";
  if (tpl === "HEAL") return "Hồi phục";
  if (tpl === "SHIELD") return "Hộ thuẫn";
  if (tpl === "BUFF") return "Cường hóa";
  if (tpl === "DEBUFF") return "Trấn áp";
  return String(tpl || "?");
}

function getDisplayCooldown(skill) {
  // Đồng bộ 1:1 với utils/dungeonEngine.js (getSkillCooldown) — chỉ để hiển thị.
  if (!skill) return 0;
  const r = skill.rarity;
  const t = skill.template;
  const base =
    {
      BURST: 3,
      AOE: 4,
      DEBUFF: 4,
      SHIELD: 4,
      HEAL: 4,
      BUFF: 4,
    }[t] || 4;
  if (r === "rare") return base + 1;
  if (r === "epic") return base + 2;
  return base;
}

function getDisplayMpCostPct(skill) {
  // Đồng bộ 1:1 với utils/dungeonEngine.js (getSkillMpCostPct) — chỉ để hiển thị.
  if (!skill) return 0;
  if (skill.rarity === "rare") return 18;
  if (skill.rarity === "epic") return 26;
  return 12;
}

function getDisplayMultipliers(skill) {
  // Đồng bộ với dungeonEngine (chỉ để hiển thị)
  const r = skill?.rarity;
  return {
    burst: r === "epic" ? 2.3 : r === "rare" ? 1.75 : 1.35,
    aoe: r === "epic" ? 1.35 : r === "rare" ? 1.15 : 0.90,
    debuff: r === "epic" ? 1.45 : r === "rare" ? 1.20 : 0.95,
  };
}

function shorten100(s) {
  const str = String(s || "").replace(/\s+/g, " ").trim();
  if (str.length <= 100) return str;
  return str.slice(0, 97).trimEnd() + "…";
}

const COMBAT_STAT_LABELS = {
  atk: "Công",
  def: "Thủ",
  spd: "Tốc",
};

function combatStatLabel(statKey) {
  const k = String(statKey || "").toLowerCase().trim();
  return COMBAT_STAT_LABELS[k] || k.toUpperCase() || "?";
}

function describeSkillShort(skill) {
  if (!skill) return "";
  const kind = kindText(skill.kind);
  const tpl = templateText(skill.template);
  const cd = getDisplayCooldown(skill);
  const mp = getDisplayMpCostPct(skill);

  if (skill.kind === "passive") {
    const st = String(skill.passive?.stat || "");
    const pct = Number(skill.passive?.pct);
    const lbl = PASSIVE_STAT_LABELS[st] || st || "Chỉ số";
    const ptxt = Number.isFinite(pct) ? `+${pct}%` : "+?%";
    return shorten100(`${kind}: ${ptxt} ${lbl}`);
  }

  if (skill.template === "HEAL") {
    const pct = Number(skill.heal?.pctMaxHp);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 36 : skill.rarity === "rare" ? 28 : 16;
    return shorten100(`${tpl}: Hồi ${p}% HP tối đa • CD${cd} • MP${mp}% MaxMP`);
  }
  if (skill.template === "SHIELD") {
    const pct = Number(skill.shield?.pctMaxHp);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 36 : skill.rarity === "rare" ? 28 : 18;
    return shorten100(`${tpl}: Khiên ${p}% HP tối đa • CD${cd} • MP${mp}% MaxMP`);
  }
  if (skill.template === "BUFF") {
    const st = String(skill.buff?.stat || "atk");
    const pct = Number(skill.buff?.pct);
    const turns = Number(skill.buff?.turns);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 26 : skill.rarity === "rare" ? 18 : 14;
    const t = Number.isFinite(turns) ? turns : 2;
    return shorten100(`${tpl}: +${p}% ${combatStatLabel(st)} (${t}L) • CD${cd} • MP${mp}% MaxMP`);
  }
  if (skill.template === "DEBUFF") {
    const st = String(skill.debuff?.stat || "atk");
    const pct = Number(skill.debuff?.pct);
    const turns = Number(skill.debuff?.turns);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 26 : skill.rarity === "rare" ? 18 : 12;
    const t = Number.isFinite(turns) ? turns : 2;
    const m = getDisplayMultipliers(skill).debuff;
    return shorten100(`${tpl}: -${p}% ${combatStatLabel(st)} (${t}L) • ~${m}×ATK • CD${cd} • MP${mp}% MaxMP`);
  }
  if (skill.template === "AOE") {
    const m = getDisplayMultipliers(skill).aoe;
    return shorten100(`${tpl}: Tối đa 3 mục tiêu • ~${m}×ATK • CD${cd} • MP${mp}% MaxMP`);
  }

  // BURST / mặc định
  const m = getDisplayMultipliers(skill).burst;
  return shorten100(`${tpl}: Đơn mục tiêu • ~${m}×ATK • CD${cd} • MP${mp}% MaxMP`);
}

function describeSkillLong(skill) {
  if (!skill) return "";
  const r = rarityText(skill.rarity);
  const k = kindText(skill.kind);
  const tpl = templateText(skill.template);
  const cd = getDisplayCooldown(skill);
  const mp = getDisplayMpCostPct(skill);

  if (skill.kind === "passive") {
    const st = String(skill.passive?.stat || "");
    const pct = Number(skill.passive?.pct);
    const lbl = PASSIVE_STAT_LABELS[st] || st || "Chỉ số";
    const ptxt = Number.isFinite(pct) ? `+${pct}%` : "+?%";
    return (
      `${r} • ${k}\n` +
      `• ${ptxt} ${lbl}\n` +
      `• Hiệu lực: luôn kích hoạt khi trang bị slot **Bị động**.`
    );
  }

  let detail = "";
  const mults = getDisplayMultipliers(skill);
  if (skill.template === "HEAL") {
    const pct = Number(skill.heal?.pctMaxHp);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 36 : skill.rarity === "rare" ? 28 : 16;
    detail = `• Hồi ${p}% HP tối đa cho 1 đồng minh (ưu tiên thấp máu).`;
  } else if (skill.template === "SHIELD") {
    const pct = Number(skill.shield?.pctMaxHp);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 36 : skill.rarity === "rare" ? 28 : 18;
    detail = `• Tạo hộ thuẫn ${p}% HP tối đa lên bản thân.`;
  } else if (skill.template === "BUFF") {
    const st = String(skill.buff?.stat || "atk");
    const pct = Number(skill.buff?.pct);
    const turns = Number(skill.buff?.turns);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 26 : skill.rarity === "rare" ? 18 : 14;
    const t = Number.isFinite(turns) ? turns : 2;
    detail = `• Tăng ${combatStatLabel(st)} +${p}% trong ${t} lượt.`;
  } else if (skill.template === "DEBUFF") {
    const st = String(skill.debuff?.stat || "atk");
    const pct = Number(skill.debuff?.pct);
    const turns = Number(skill.debuff?.turns);
    const p = Number.isFinite(pct) ? pct : skill.rarity === "epic" ? 26 : skill.rarity === "rare" ? 18 : 12;
    const t = Number.isFinite(turns) ? turns : 2;
    detail = `• Gây sát thương ~${mults.debuff}×ATK và giảm ${combatStatLabel(st)} -${p}% trong ${t} lượt.`;
  } else if (skill.template === "AOE") {
    detail = `• Tấn công diện rộng tối đa 3 mục tiêu, sát thương ~${mults.aoe}×ATK.`;
  } else {
    detail = `• Tấn công đơn mục tiêu, sát thương ~${mults.burst}×ATK.`;
  }

  return (
    `${r} • ${k} • ${tpl}\n` +
    `${detail}\n` +
    `• CD: ${cd} lượt\n` +
    `• MP: ${mp}% MaxMP`
  );
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

function craftSkill(user, arg) {
  // Hỗ trợ 2 kiểu gọi:
  // - craftSkill(user, "<skillId>") (bag.js version mới)
  // - craftSkill(user, { element, rarity, skillId }) (bag.js version cũ)
  ensureUserSkills(user);

  let skillId = null;
  let element = null;
  let rarity = null;

  if (typeof arg === "string") {
    skillId = arg;
  } else if (arg && typeof arg === "object") {
    skillId = arg.skillId;
    element = arg.element;
    rarity = arg.rarity;
  }

  if (!skillId) return { ok: false, message: "⚠️ Chưa chọn bí kíp." };

  const sk = getSkill(skillId);
  if (!sk) return { ok: false, message: "❌ Bí kíp không tồn tại." };

  element = element || sk.element || user.element;
  rarity = rarity || sk.rarity;

  if (sk.element && user.element && sk.element !== user.element) {
    return { ok: false, message: "⚠️ Bí kíp không cùng hệ với bạn." };
  }
  if (user.skills.owned.includes(skillId)) {
    return { ok: false, message: "⚠️ Bạn đã sở hữu bí kíp này." };
  }
  if (rarity !== "rare" && rarity !== "epic") {
    return { ok: false, message: "⚠️ Chỉ có thể ghép bí kíp Hiếm/Cực hiếm." };
  }

  const need = rarity === "epic" ? 40 : 12;
  const have = getShardCount(user, element, rarity);
  if (have < need) {
    return { ok: false, message: `⚠️ Không đủ mảnh để ghép. Cần ${need}, hiện có ${have}.` };
  }

  const spend = spendShards(user, element, rarity, need);
  if (!spend.ok) return { ok: false, message: "⚠️ Không đủ mảnh để ghép." };

  const add = addOwnedSkill(user, skillId);
  if (!add.ok) {
    // rollback shards trong trường hợp cực hiếm
    addShard(user, element, rarity, need);
    return { ok: false, message: `❌ Ghép thất bại: ${add.reason || "không rõ"}` };
  }

  return {
    ok: true,
    message: `Ghép thành công **${sk.name}** (${rarityText(sk.rarity)}). Tốn **${need}** mảnh.`,
  };
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
  describeSkillShort,
  describeSkillLong,
  equipSkill,
  unequipSkill,
  addOwnedSkill,
  addShard,
  getShardCount,
  spendShards,
  craftSkill,
  computePassiveTotals,
};
