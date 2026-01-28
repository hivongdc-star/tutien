// utils/dungeonEngine.js
// Engine dungeon: tạo quái, tính chỉ số hiệu lực, mô phỏng turn-based, trả log cho cinematic.

const { sumMainPercents, sumAffixes, applyPct } = require("./statsView");
const { tierMeta } = require("./tiers");
const { getRealm } = require("./xp");
const { getSkill, computePassiveTotals, ensureUserSkills } = require("./skills");

function clamp(n, min, max) {
  const x = Number(n) || 0;
  return Math.max(min, Math.min(max, x));
}

function pushLog(logs, side, text) {
  // side: 'P' (party) | 'E' (enemy)
  const prefix = side === "P" ? "🟦" : "🟥";
  logs.push({ side, text: `${prefix} ${text}` });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function diffMeta(diff) {
  if (diff === "easy") return { name: "Thường", mult: 0.95, color: 0x2ECC71 };
  if (diff === "hard") return { name: "Hung", mult: 1.18, color: 0xE67E22 };
  return { name: "Tuyệt", mult: 1.32, color: 0xE74C3C };
}

function computeEffective(user) {
  // base + % dòng chính từ trang bị + tổng phụ tố + passive skill
  const equipped = user?.gear?.equipped || {};
  const mainPct = sumMainPercents(equipped);
  const aff = sumAffixes(equipped);
  ensureUserSkills(user);
  const passive = computePassiveTotals(user);

  const baseAtk = Number(user.atk) || 0;
  const baseDef = Number(user.def) || 0;
  const baseSpd = Number(user.spd) || 0;
  const baseMaxHp = Number(user.maxHp) || 0;
  const baseMaxMp = Number(user.maxMp) || 0;

  const eff = {
    atk: applyPct(baseAtk, mainPct.atk),
    def: applyPct(baseDef, mainPct.def),
    spd: applyPct(baseSpd, mainPct.spd),
    maxHp: applyPct(baseMaxHp, mainPct.hp),
    maxMp: applyPct(baseMaxMp, mainPct.mp),
    // phụ tố (gear + passive)
    crit: (Number(aff.crit) || 0) + (Number(passive.crit) || 0),
    crit_resist: (Number(aff.crit_resist) || 0) + (Number(passive.crit_resist) || 0),
    armor_pen: (Number(aff.armor_pen) || 0) + (Number(passive.armor_pen) || 0),
    crit_dmg: (Number(aff.crit_dmg) || 0) + (Number(passive.crit_dmg) || 0),
    dmg_reduce: (Number(aff.dmg_reduce) || 0) + (Number(passive.dmg_reduce) || 0),
    lifesteal: (Number(aff.lifesteal) || 0) + (Number(passive.lifesteal) || 0),
    dodge: (Number(aff.dodge) || 0) + (Number(passive.dodge) || 0),
    accuracy: (Number(aff.accuracy) || 0) + (Number(passive.accuracy) || 0),
  };

  // clamp hợp lý
  eff.crit = clamp(eff.crit, 0, 60);
  eff.crit_resist = clamp(eff.crit_resist, 0, 60);
  eff.armor_pen = clamp(eff.armor_pen, 0, 60);
  eff.crit_dmg = clamp(eff.crit_dmg, 0, 200);
  eff.dmg_reduce = clamp(eff.dmg_reduce, 0, 50);
  eff.lifesteal = clamp(eff.lifesteal, 0, 35);
  eff.dodge = clamp(eff.dodge, 0, 40);
  eff.accuracy = clamp(eff.accuracy, 0, 40);

  return { eff, mainPct, aff, passive };
}

function makePlayerEntity(userId, user) {
  const { eff } = computeEffective(user);
  ensureUserSkills(user);
  const actives = user.skills?.equipped?.actives || [null, null, null, null];
  const passive = user.skills?.equipped?.passive || null;
  const curHp = clamp(Number(user.hp) || eff.maxHp, 0, eff.maxHp);
  const curMp = clamp(Number(user.mp) || eff.maxMp, 0, eff.maxMp);
  return {
    id: userId,
    kind: "player",
    name: user.name || "Vô danh",
    element: user.element || "kim",
    level: Number(user.level) || 1,
    realm: String(user.realm || getRealm(Number(user.level)||1) || ''),
    stats: eff,
    hp: curHp,
    mp: curMp,
    shield: 0,
    buffs: { atk: { pct: 0, turns: 0 }, def: { pct: 0, turns: 0 }, spd: { pct: 0, turns: 0 } },
    cooldowns: {},
    skills: { actives: actives.slice(0, 4), passive },
    alive: curHp > 0,
  };
}

function avgPartyStats(party) {
  const n = Math.max(1, party.length);
  const sum = { atk: 0, def: 0, spd: 0, maxHp: 0 };
  for (const p of party) {
    sum.atk += p.stats.atk;
    sum.def += p.stats.def;
    sum.spd += p.stats.spd;
    sum.maxHp += p.stats.maxHp;
  }
  return {
    atk: sum.atk / n,
    def: sum.def / n,
    spd: sum.spd / n,
    maxHp: sum.maxHp / n,
  };
}

function enemyNamePool(mapKey) {
  // Tên quái 4 chữ (hán Việt)
  const base = {
    forest: ["U Linh Thụ Yêu", "Huyết Ảnh Lang Vương", "Thanh Mộc Tà Linh", "Phong Ấn Cổ Thú"],
    lava: ["Liệt Diễm Ma Tướng", "Hỏa Ngục Huyết Linh", "Nham Tinh Cự Thú", "Viêm Vương Tàn Hồn"],
    ocean: ["Hàn Hải Xà Linh", "Thủy Ảnh Ma Ngư", "Băng Linh Cổ Thú", "Huyền Thủy Sát Tướng"],
    black: ["Hắc Vực Quỷ Tướng", "Ma Ảnh Hồn Thể", "Tà Linh Vô Diện", "U Minh Cổ Thú"],
    default: ["Tàn Điện Khôi Lỗi", "Cổ Ấn U Linh", "Thiên Cơ Tàn Hồn", "Hư Không Dị Thú"],
  };
  return base[mapKey] || base.default;
}

function generateEnemies({ party, mapKey, diff, floor, isBoss }) {
  const avg = avgPartyStats(party);
  const dm = diffMeta(diff);
  const pool = enemyNamePool(mapKey);

  // --- Enemy level/realm (dễ cân) ---
  const avgLv = Math.max(1, Math.round((party.reduce((a,p)=>a+(Number(p.level)||1),0)) / Math.max(1, party.length)));
  const diffOffset = diff === "easy" ? -2 : diff === "hard" ? 0 : 2;
  const floorOffset = Math.max(0, (Number(floor) || 1) - 1);
  const bossOffset = isBoss ? 2 : 0;
  const baseEnemyLv = avgLv + diffOffset + floorOffset + bossOffset;

  const partySize = Math.max(1, party.length);
  let count = 1;
  if (isBoss) {
    count = 1;
  } else if (partySize === 1) {
    // Solo: luôn 1 quái để tránh bất lợi "action economy"
    count = 1;
  } else {
    // Party 2-3: tầng đầu ít quái, tầng sâu nhiều quái hơn
    if (floor <= 2) count = Math.random() < 0.35 ? 2 : 1;
    else if (floor <= 4) count = Math.random() < 0.55 ? 2 : 1;
    else {
      if (partySize >= 3) count = Math.random() < 0.45 ? 3 : 2;
      else count = Math.random() < 0.70 ? 2 : 1;
    }
    count = Math.min(count, Math.min(3, partySize));
    if (count < 1) count = 1;
  }
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const name = pool[randInt(0, pool.length - 1)];
    const baseAtk = Math.max(1, Math.round(avg.atk * (0.92 + 0.06 * (floor - 1)) * dm.mult));
    const baseDef = Math.max(0, Math.round(avg.def * (0.62 + 0.05 * (floor - 1)) * dm.mult));
    const baseHp = Math.max(1, Math.round(avg.maxHp * (0.62 + 0.08 * (floor - 1)) * dm.mult));
    const baseSpd = Math.max(1, Math.round(avg.spd * (0.90 + 0.04 * (floor - 1))));

    let atk = baseAtk;
    let def = baseDef;
    let maxHp = baseHp;
    let spd = baseSpd;

    if (isBoss) {
      atk = Math.round(atk * 1.4);
      def = Math.round(def * 1.2);
      maxHp = Math.round(maxHp * 1.8);
      spd = Math.round(spd * 1.1);
    }

    // Nếu nhiều quái, giảm stat từng con để cân bằng "action economy"
    if (!isBoss && count === 3) {
      maxHp = Math.round(maxHp * 0.65);
      atk = Math.round(atk * 0.72);
      def = Math.round(def * 0.88);
    }
    if (!isBoss && count === 2) {
      maxHp = Math.round(maxHp * 0.80);
      atk = Math.round(atk * 0.82);
      def = Math.round(def * 0.92);
    }

    // Tầng 1: giảm nhẹ áp lực để người chơi có thể qua tầng 2
    if (!isBoss && floor === 1) {
      const earlyAtk = diff === "easy" ? 0.90 : diff === "hard" ? 0.93 : 0.95;
      atk = Math.round(atk * earlyAtk);
      maxHp = Math.round(maxHp * 0.95);
    }

    // Enemy level gap scaling (nhẹ, dễ cân)
    const enemyLevel = Math.max(1, baseEnemyLv + randInt(-1, 1));
    const gap = enemyLevel - avgLv;
    const mAtkDef = clamp(1 + gap * 0.02, 0.85, 1.35);
    const mHp = clamp(1 + gap * 0.03, 0.80, 1.55);
    const mSpd = clamp(1 + gap * 0.01, 0.90, 1.20);

    atk = Math.max(1, Math.round(atk * mAtkDef));
    def = Math.max(0, Math.round(def * mAtkDef));
    maxHp = Math.max(1, Math.round(maxHp * mHp));
    spd = Math.max(1, Math.round(spd * mSpd));

    const realm = String(getRealm(enemyLevel) || '');

    enemies.push({
      id: `e_${floor}_${i}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      kind: isBoss ? "boss" : "mob",
      name: isBoss ? `Boss • ${name}` : name,
      element: null,
      level: enemyLevel,
      realm,
      stats: {
        atk,
        def,
        spd,
        maxHp,
        maxMp: 0,
        crit: isBoss ? 10 : 6,
        crit_resist: isBoss ? 6 : 0,
        armor_pen: isBoss ? 8 : 0,
        crit_dmg: isBoss ? 15 : 0,
        dmg_reduce: isBoss ? 6 : 0,
        lifesteal: 0,
        dodge: isBoss ? 4 : 0,
        accuracy: isBoss ? 4 : 0,
      },
      hp: maxHp,
      mp: 0,
      shield: 0,
      buffs: { atk: { pct: 0, turns: 0 }, def: { pct: 0, turns: 0 }, spd: { pct: 0, turns: 0 } },
      cooldowns: {},
      debuffs: { atk: { pct: 0, turns: 0 }, def: { pct: 0, turns: 0 }, spd: { pct: 0, turns: 0 } },
      alive: true,
    });
  }

  return enemies;
}

function getSkillCooldown(skill) {
  if (!skill) return 0;
  const r = skill.rarity;
  const t = skill.template;
  const base = {
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

function getSkillMpCostPct(skill) {
  if (!skill) return 0;
  if (skill.rarity === "rare") return 18;
  if (skill.rarity === "epic") return 26;
  return 12;
}

function isAlive(x) {
  return x && x.alive && x.hp > 0;
}

function pickLowestHP(entities) {
  const alive = entities.filter(isAlive);
  alive.sort((a, b) => (a.hp / a.stats.maxHp) - (b.hp / b.stats.maxHp));
  return alive[0] || null;
}

function pickRandomAlive(entities) {
  const alive = entities.filter(isAlive);
  if (!alive.length) return null;
  return alive[randInt(0, alive.length - 1)];
}

function applyBuff(ent, stat, pct, turns) {
  if (!ent.buffs) ent.buffs = { atk: { pct: 0, turns: 0 }, def: { pct: 0, turns: 0 }, spd: { pct: 0, turns: 0 } };
  const b = ent.buffs[stat] || { pct: 0, turns: 0 };
  b.pct = Math.max(b.pct, pct);
  b.turns = Math.max(b.turns, turns);
  ent.buffs[stat] = b;
}

function applyDebuff(ent, stat, pct, turns) {
  if (!ent.debuffs) ent.debuffs = { atk: { pct: 0, turns: 0 }, def: { pct: 0, turns: 0 }, spd: { pct: 0, turns: 0 } };
  const d = ent.debuffs[stat] || { pct: 0, turns: 0 };
  d.pct = Math.max(d.pct, pct);
  d.turns = Math.max(d.turns, turns);
  ent.debuffs[stat] = d;
}

function tickTurns(ent) {
  for (const k of ["atk", "def", "spd"]) {
    if (ent.buffs?.[k]?.turns > 0) {
      ent.buffs[k].turns -= 1;
      if (ent.buffs[k].turns <= 0) ent.buffs[k].pct = 0;
    }
    if (ent.debuffs?.[k]?.turns > 0) {
      ent.debuffs[k].turns -= 1;
      if (ent.debuffs[k].turns <= 0) ent.debuffs[k].pct = 0;
    }
  }
  for (const [sid, cd] of Object.entries(ent.cooldowns || {})) {
    const n = Math.max(0, Number(cd) || 0);
    if (n <= 0) continue;
    ent.cooldowns[sid] = n - 1;
  }
}

function effStat(ent, key) {
  const base = Number(ent.stats[key]) || 0;
  const b = ent.buffs?.[key]?.pct ? Number(ent.buffs[key].pct) : 0;
  const d = ent.debuffs?.[key]?.pct ? Number(ent.debuffs[key].pct) : 0;
  return Math.max(0, Math.round(base * (1 + b / 100) * (1 - d / 100)));
}

function calcHit(attacker, target) {
  const acc = clamp(attacker.stats.accuracy || 0, 0, 40);
  const dodge = clamp(target.stats.dodge || 0, 0, 40);
  const missPenalty = Math.max(0, dodge - acc);
  const hitChance = clamp(100 - missPenalty * 2, 70, 100);
  return Math.random() * 100 < hitChance;
}

function calcDamage(attacker, target, rawDmg) {
  const pen = clamp(attacker.stats.armor_pen || 0, 0, 60);
  const def = Math.max(0, effStat(target, "def"));
  const reduce = clamp(target.stats.dmg_reduce || 0, 0, 50);

  // Lưu ý: cap rage ở đây phải >= cap ở simulateBattleTimeline (party có thể lên tới 2.4)
  const rage = clamp(attacker._rageMult || 1, 1, 3.0);
  const scaledRaw = Math.max(1, Math.round(rawDmg * rage));
  const isTargetPlayer = target.kind === "player";

  // ===== MOBA-like mitigation (LoL armor formula) =====
  // - Giảm dần theo đường cong (diminishing returns), hạn chế "đánh cùn" kéo 60 turn.
  // - Vẫn giữ target=player nặng hơn một chút để tránh one-shot.
  const turn = Math.max(1, Number(attacker._turn) || 1);
  const decay = turn > 18 ? clamp((turn - 18) * 0.012, 0, 0.28) : 0; // anti-stall nhẹ theo thời gian
  const armorScale = isTargetPlayer ? 2.8 : 2.1;

  const armorBase = Math.max(0, def * (1 - pen / 100));
  let armor = Math.round(armorBase * armorScale * (1 - decay));

  let mult = 1;
  if (armor >= 0) mult = 100 / (100 + armor);
  else mult = 2 - 100 / (100 - armor);

  let after = Math.max(1, Math.round(scaledRaw * mult * (1 - reduce / 100)));

  // Minimum damage floor vs enemy (không áp cho player) để không có case "đánh 1-3" mãi.
  if (!isTargetPlayer) {
    const floor = Math.max(1, Math.round(scaledRaw * 0.08));
    after = Math.max(after, floor);
  }

  return after;
}

function tryCrit(attacker, target) {
  const crit = clamp(attacker.stats.crit || 0, 0, 60);
  const res = clamp(target.stats.crit_resist || 0, 0, 60);
  const chance = clamp(crit - res, 0, 50);
  return Math.random() * 100 < chance;
}

function applyDamage(target, dmg) {
  let left = Math.max(0, Math.round(dmg));
  if (target.shield > 0) {
    const s = Math.min(target.shield, left);
    target.shield -= s;
    left -= s;
  }
  target.hp = Math.max(0, target.hp - left);
  target.alive = target.hp > 0;
  return left;
}

function heal(target, amount) {
  const a = Math.max(0, Math.round(amount));
  const before = target.hp;
  target.hp = clamp(target.hp + a, 0, target.stats.maxHp);
  target.alive = target.hp > 0;
  return target.hp - before;
}

function spendMp(actor, pct) {
  const cost = Math.max(0, Math.round((actor.stats.maxMp * pct) / 100));
  if (actor.mp < cost) return { ok: false, cost };
  actor.mp -= cost;
  return { ok: true, cost };
}


function regenMpPerTurn(ent) {
  // MP regen nhẹ để auto-combat không bị "xài hết MP rồi đánh thường mãi"
  if (!ent || ent.kind !== "player") return;
  const max = Math.max(0, Number(ent.stats?.maxMp) || 0);
  if (max <= 0) return;
  const gain = Math.max(1, Math.round((max * 4) / 100)); // 4%/turn
  ent.mp = clamp((Number(ent.mp) || 0) + gain, 0, max);
}

function choosePlayerAction(actor, allies, enemies) {
  // Auto combat: chọn skill theo "điểm" để:
  // - không spam 1 chiêu duy nhất
  // - ưu tiên kết liễu (giảm số turn)
  // - vẫn cứu đồng đội khi nguy cấp
  const ids = (actor.skills?.actives || []).filter(Boolean);
  const skills = ids
    .map((id) => ({ id, s: getSkill(id) }))
    .filter((x) => x.s && x.s.kind === "active");

  const usable = skills.filter(({ id, s }) => {
    const cd = Math.max(0, Number(actor.cooldowns?.[id]) || 0);
    if (cd > 0) return false;
    const pct = getSkillMpCostPct(s);
    const cost = Math.round((actor.stats.maxMp * pct) / 100);
    return actor.mp >= cost;
  });

  const enemyAlive = enemies.filter(isAlive);
  const enemyCount = enemyAlive.length;
  const hasBoss = enemyAlive.some((e) => e.kind === "boss");
  const boss = hasBoss ? (enemyAlive.find((e) => e.kind === "boss") || null) : null;

  const selfRatio = actor.hp / Math.max(1, actor.stats.maxHp);
  const low = pickLowestHP(allies);
  const lowRatio = low ? (low.hp / Math.max(1, low.stats.maxHp)) : 1;

  const rarityScore = (r) => (r === "epic" ? 12 : r === "rare" ? 6 : 0);
  const lastId = actor._lastSkillId || null;

  const candidates = [];

  // 1) Heal nếu nguy cấp
  if (low && lowRatio <= 0.5) {
    for (const x of usable.filter((u) => u.s.template === "HEAL")) {
      let score = 100 + rarityScore(x.s.rarity) + Math.round((0.5 - lowRatio) * 80);
      if (x.id === lastId) score -= 10;
      candidates.push({ type: "skill", ...x, target: low, score });
    }
  }

  // 2) Shield khi đang không có shield và bắt đầu nguy hiểm
  if (selfRatio <= 0.75 && (Number(actor.shield) || 0) <= 0) {
    for (const x of usable.filter((u) => u.s.template === "SHIELD")) {
      let score = 85 + rarityScore(x.s.rarity) + Math.round((0.75 - selfRatio) * 40);
      if (x.id === lastId) score -= 8;
      candidates.push({ type: "skill", ...x, target: actor, score });
    }
  }

  // 3) Buff nếu buff chưa có
  for (const x of usable.filter((u) => u.s.template === "BUFF")) {
    const st = x.s?.buff?.stat || "atk";
    const activeTurns = Number(actor.buffs?.[st]?.turns) || 0;
    if (activeTurns <= 0) {
      let score = 60 + rarityScore(x.s.rarity);
      if (x.id === lastId) score -= 6;
      candidates.push({ type: "skill", ...x, target: actor, score });
    }
  }

  // 4) Offensive: Burst/DEBUFF/AOE
  const focus = pickLowestHP(enemyAlive) || pickRandomAlive(enemyAlive);

  for (const x of usable) {
    const t = x.s.template;
    let score = -1;
    let target = null;

    if (t === "BURST") {
      score = 78 + rarityScore(x.s.rarity);
      target = focus;
      // nếu sắp kết liễu thì ưu tiên mạnh
      if (target && target.hp / Math.max(1, target.stats.maxHp) <= 0.35) score += 10;
    } else if (t === "DEBUFF") {
      score = 70 + rarityScore(x.s.rarity);
      target = boss || focus;
      // nếu mục tiêu chưa bị debuff stat đó thì ưu tiên
      const st = x.s.debuff?.stat || "atk";
      const activeTurns = Number(target?.debuffs?.[st]?.turns) || 0;
      if (activeTurns <= 0) score += 8;
    } else if (t === "AOE") {
      // có nhiều quái => AOE tốt, 1 quái thì vẫn được nhưng giảm điểm
      score = (enemyCount >= 2 ? 74 : 52) + rarityScore(x.s.rarity) + Math.min(8, (enemyCount - 1) * 4);
      target = null;
    } else {
      continue;
    }

    if (x.id === lastId) score -= 12;
    // jitter nhỏ để có cảm giác "không máy móc"
    score += randInt(0, 3);
    candidates.push({ type: "skill", ...x, target, score });
  }

  // Chọn best skill
  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score);
    const bestScore = candidates[0].score;
    const top = candidates.filter((c) => c.score >= bestScore - 4); // top gần nhau -> random
    const pick = top[randInt(0, top.length - 1)];
    return { type: "skill", id: pick.id, s: pick.s, target: pick.target };
  }

  // Fallback basic
  return { type: "basic", target: focus };
}

function doBasicAttack(actor, target, logs) {
  if (!target) return;
  if (!calcHit(actor, target)) {
    pushLog(logs, actor.kind === "player" ? "P" : "E", `${actor.name} ra tay, nhưng ${target.name} né tránh.`);
    return;
  }
  const atk = Math.max(1, effStat(actor, "atk"));
  // nhịp nhanh hơn một chút (ưu tiên tăng DPS cho người chơi để tránh timeout)
  const coef = actor.kind === "player" ? 1.18 : 1.08;
  let dmg = calcDamage(actor, target, Math.round(atk * coef));
  const crit = tryCrit(actor, target);
  if (crit) {
    const mult = 1 + (50 + (actor.stats.crit_dmg || 0)) / 100;
    dmg = Math.max(1, Math.round(dmg * mult));
  }
  const dealt = applyDamage(target, dmg);
  let tail = "";
  if (crit) tail = " (Bạo kích!)";
  pushLog(
    logs,
    actor.kind === "player" ? "P" : "E",
    `${actor.name} công kích ${target.name}, gây **${dealt}** sát thương${tail}.`
  );

  // lifesteal
  const ls = clamp(actor.stats.lifesteal || 0, 0, 35);
  if (ls > 0) {
    const healed = heal(actor, Math.round((dealt * ls) / 100));
    if (healed > 0) {
      pushLog(logs, actor.kind === "player" ? "P" : "E", `${actor.name} hút huyết, hồi **${healed}** HP.`);
    }
  }
}

function doSkill(actor, action, allies, enemies, logs) {
  const { id, s } = action;
  const cd = getSkillCooldown(s);
  const mpPct = getSkillMpCostPct(s);
  const mpRes = spendMp(actor, mpPct);
  if (!mpRes.ok) {
    // fallback basic
    doBasicAttack(actor, action.target || pickRandomAlive(enemies), logs);
    return;
  }
  actor.cooldowns[id] = cd;
  actor._lastSkillId = id;
  actor._lastSkillTemplate = s.template;

  const name = s.name || id;
  const r = s.rarity;
  const mult = r === "epic" ? 2.3 : r === "rare" ? 1.75 : 1.35;
  const aoeMult = r === "epic" ? 1.35 : r === "rare" ? 1.15 : 0.90;
  const debuffDmgMult = r === "epic" ? 1.45 : r === "rare" ? 1.20 : 0.95;

  if (s.template === "HEAL") {
    const target = action.target || pickLowestHP(allies) || actor;
    const pct = Number(s.heal?.pctMaxHp) || (r === "epic" ? 36 : r === "rare" ? 28 : 16);
    const amount = Math.round((actor.stats.maxHp * pct) / 100);
    const healed = heal(target, amount);
    pushLog(logs, "P", `${actor.name} thi triển **${name}**, hồi **${healed}** HP cho ${target.name}.`);
    return;
  }

  if (s.template === "SHIELD") {
    const pct = Number(s.shield?.pctMaxHp) || (r === "epic" ? 36 : r === "rare" ? 28 : 18);
    const amount = Math.round((actor.stats.maxHp * pct) / 100);
    actor.shield += amount;
    pushLog(logs, "P", `${actor.name} vận **${name}**, tạo hộ thuẫn **${amount}**.`);
    return;
  }

  if (s.template === "BUFF") {
    const b = s.buff || {};
    const stat = b.stat || "atk";
    const pct = Number(b.pct) || (r === "epic" ? 26 : r === "rare" ? 18 : 14);
    const turns = Number(b.turns) || 2;
    applyBuff(actor, stat, pct, turns);
    pushLog(logs, "P", `${actor.name} kích phát **${name}**, ${stat.toUpperCase()} +${pct}% (${turns} lượt).`);
    return;
  }

  if (s.template === "AOE") {
    const targets = enemies.filter(isAlive).slice(0, 3);
    const atk = Math.max(1, effStat(actor, "atk"));
    const base = Math.round(atk * aoeMult);
    let total = 0;
    for (const t of targets) {
      if (!calcHit(actor, t)) continue;
      let dmg = calcDamage(actor, t, base);
      const crit = tryCrit(actor, t);
      if (crit) {
        const m = 1 + (50 + (actor.stats.crit_dmg || 0)) / 100;
        dmg = Math.max(1, Math.round(dmg * m));
      }
      total += applyDamage(t, dmg);
    }
    pushLog(logs, "P", `${actor.name} thi triển **${name}**, quét ngang chiến trường (tổng **${total}**).`);
    return;
  }

  if (s.template === "DEBUFF") {
    const target = action.target || pickRandomAlive(enemies);
    if (!target) return;
    if (!calcHit(actor, target)) {
      pushLog(logs, "P", `${actor.name} thi triển **${name}**, nhưng ${target.name} tránh được.`);
      return;
    }
    const atk = Math.max(1, effStat(actor, "atk"));
    let dmg = calcDamage(actor, target, Math.round(atk * debuffDmgMult));
    const crit = tryCrit(actor, target);
    if (crit) {
      const m = 1 + (50 + (actor.stats.crit_dmg || 0)) / 100;
      dmg = Math.max(1, Math.round(dmg * m));
    }
    const dealt = applyDamage(target, dmg);
    const stat = s.debuff?.stat || "atk";
    const pct = Number(s.debuff?.pct) || (r === "epic" ? 26 : r === "rare" ? 18 : 12);
    const turns = Number(s.debuff?.turns) || 2;
    applyDebuff(target, stat, pct, turns);
    pushLog(
      logs,
      "P",
      `${actor.name} tung **${name}**, gây **${dealt}** và trấn áp ${stat.toUpperCase()} -${pct}% (${turns} lượt).`
    );
    return;
  }

  // BURST (single)
  const target = action.target || pickRandomAlive(enemies);
  if (!target) return;
  if (!calcHit(actor, target)) {
    pushLog(logs, "P", `${actor.name} thi triển **${name}**, nhưng ${target.name} lách mình tránh né.`);
    return;
  }
  const atk = Math.max(1, effStat(actor, "atk"));
  let dmg = calcDamage(actor, target, Math.round(atk * mult));
  const crit = tryCrit(actor, target);
  if (crit) {
    const m = 1 + (50 + (actor.stats.crit_dmg || 0)) / 100;
    dmg = Math.max(1, Math.round(dmg * m));
  }
  const dealt = applyDamage(target, dmg);
  pushLog(logs, "P", `${actor.name} xuất **${name}**, đánh trúng ${target.name} (**${dealt}**).`);
}

function pickLast2ForView(logs) {
  // logs: [{side:'P'|'E', text:string}]
  if (!logs.length) return [];
  const last2 = logs.slice(-2);
  // Nếu đã có log phe ta trong 2 dòng mới nhất => giữ nguyên
  if (last2.some((x) => x.side === "P")) return last2.map((x) => x.text);

  // Nếu 2 dòng mới nhất đều là địch, cố gắng kéo thêm 1 dòng phe ta gần nhất để người chơi thấy mình ra tay.
  let iP = -1;
  let iE = -1;
  for (let i = logs.length - 1; i >= 0; i--) {
    const side = logs[i]?.side;
    if (iE < 0 && side === "E") iE = i;
    if (iP < 0 && side === "P") iP = i;
    if (iP >= 0 && iE >= 0) break;
  }
  if (iP >= 0 && iE >= 0) {
    const pair = [
      { i: iP, t: logs[iP].text },
      { i: iE, t: logs[iE].text },
    ].sort((a, b) => a.i - b.i);
    return pair.map((x) => x.t).slice(-2);
  }
  return last2.map((x) => x.text);
}

function anyAlive(arr) {
  return arr.some(isAlive);
}

function simulateBattle({ party, enemies, maxTurns = 60 }) {
  const logs = [];
  let turn = 0;

  while (turn < maxTurns && anyAlive(party) && anyAlive(enemies)) {
    turn += 1;

    // Enrage: ưu tiên giúp người chơi kết thúc trận, tránh đánh lê thê nhưng không làm quái "snowball"
    const rageP = clamp(1 + Math.max(0, turn - 14) * 0.06, 1, 2.4);
    const rageE = clamp(1 + Math.max(0, turn - 20) * 0.04, 1, 1.6);
    for (const ent of party) ent._rageMult = rageP;
    for (const ent of enemies) ent._rageMult = rageE;
    for (const ent of [...party, ...enemies]) ent._turn = turn;
    for (const ent of party) regenMpPerTurn(ent);

    // tick cooldown/buff/debuff
    for (const ent of [...party, ...enemies]) tickTurns(ent);

    // initiative order
    const order = [...party.filter(isAlive), ...enemies.filter(isAlive)].sort((a, b) => {
      const ia = effStat(a, "spd") + Math.random() * 3;
      const ib = effStat(b, "spd") + Math.random() * 3;
      return ib - ia;
    });

    for (const actor of order) {
      if (!isAlive(actor)) continue;
      if (!anyAlive(party) || !anyAlive(enemies)) break;

      if (actor.kind === "player") {
        const action = choosePlayerAction(actor, party, enemies);
        if (action.type === "skill") doSkill(actor, action, party, enemies, logs);
        else doBasicAttack(actor, action.target, logs);
      } else {
        // enemy AI: ưu tiên đánh kẻ thấp máu
        const target = pickLowestHP(party) || pickRandomAlive(party);
        doBasicAttack(actor, target, logs);
      }

      // giữ log gọn
      if (logs.length > 12) logs.splice(0, logs.length - 12);
    }
  }

  const win = anyAlive(party) && !anyAlive(enemies);
  const lose = !anyAlive(party);
  const outcome = win ? "win" : lose ? "lose" : "timeout";
  return { outcome, turn, logs: pickLast2ForView(logs) };
}

function cloneForView(arr) {
  return arr.map((x) => ({
    id: x.id,
    kind: x.kind,
    name: x.name,
    element: x.element || null,
    level: Number(x.level) || 0,
    realm: x.realm ? String(x.realm) : '',
    alive: !!x.alive,
    hp: Math.max(0, Math.round(x.hp || 0)),
    mp: Math.max(0, Math.round(x.mp || 0)),
    shield: Math.max(0, Math.round(x.shield || 0)),
    stats: {
      atk: Math.max(0, Math.round(Number(x.stats?.atk) || 0)),
      def: Math.max(0, Math.round(Number(x.stats?.def) || 0)),
      spd: Math.max(0, Math.round(Number(x.stats?.spd) || 0)),
      maxHp: Math.max(1, Math.round(Number(x.stats?.maxHp) || 1)),
      maxMp: Math.max(0, Math.round(Number(x.stats?.maxMp) || 0)),
    },
  }));
}

function simulateBattleTimeline({ party, enemies, maxTurns = 60, keyframeEvery = 2 }) {
  const logs = [];
  let turn = 0;
  const keyframes = [];

  const pushFrame = () => {
    const last2 = pickLast2ForView(logs);
    keyframes.push({
      turn,
      party: cloneForView(party),
      enemies: cloneForView(enemies),
      logs: last2,
    });
  };

  pushFrame();

  while (turn < maxTurns && anyAlive(party) && anyAlive(enemies)) {
    turn += 1;

    // Enrage: ưu tiên giúp người chơi kết thúc trận, tránh đánh lê thê nhưng không làm quái "snowball"
    const rageP = clamp(1 + Math.max(0, turn - 14) * 0.06, 1, 2.4);
    const rageE = clamp(1 + Math.max(0, turn - 20) * 0.04, 1, 1.6);
    for (const ent of party) ent._rageMult = rageP;
    for (const ent of enemies) ent._rageMult = rageE;
    for (const ent of [...party, ...enemies]) ent._turn = turn;
    for (const ent of party) regenMpPerTurn(ent);
    for (const ent of [...party, ...enemies]) tickTurns(ent);

    const order = [...party.filter(isAlive), ...enemies.filter(isAlive)].sort((a, b) => {
      const ia = effStat(a, "spd") + Math.random() * 3;
      const ib = effStat(b, "spd") + Math.random() * 3;
      return ib - ia;
    });

    for (const actor of order) {
      if (!isAlive(actor)) continue;
      if (!anyAlive(party) || !anyAlive(enemies)) break;

      if (actor.kind === "player") {
        const action = choosePlayerAction(actor, party, enemies);
        if (action.type === "skill") doSkill(actor, action, party, enemies, logs);
        else doBasicAttack(actor, action.target, logs);
      } else {
        const target = pickLowestHP(party) || pickRandomAlive(party);
        doBasicAttack(actor, target, logs);
      }

      if (logs.length > 12) logs.splice(0, logs.length - 12);
    }

    if (turn % Math.max(1, keyframeEvery) === 0) pushFrame();
  }

  const win = anyAlive(party) && !anyAlive(enemies);
  const lose = !anyAlive(party);
  const outcome = win ? "win" : lose ? "lose" : "timeout";
  if (keyframes.length === 0 || keyframes[keyframes.length - 1].turn !== turn) pushFrame();
  return { outcome, turn, logs: pickLast2ForView(logs), keyframes };
}

module.exports = {
  diffMeta,
  computeEffective,
  makePlayerEntity,
  generateEnemies,
  simulateBattle,
  simulateBattleTimeline,
  shuffle,
};
