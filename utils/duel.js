const { loadUsers, saveUsers } = require("./storage");
const skills = require("./skills");
const { calculateDamage, tickBuffs } = require("./dmg");

const battles = {};
const challenges = {};

function normalizeUser(u, id) {
  if (!u) return null;
  u.id = id;
  u.maxHp = u.maxHp || 100;
  u.hp = Math.min(u.hp ?? u.maxHp, u.maxHp);
  u.maxMp = u.maxMp || 100;
  u.mp = Math.min(u.mp ?? u.maxMp, u.maxMp);
  u.fury = u.fury ?? 0;
  u.atk = u.atk ?? 10;
  u.def = u.def ?? 10;
  u.spd = u.spd ?? 10;
  u.buffs = u.buffs || [];
  u.shield = u.shield || 0;
  u.buffCooldowns = u.buffCooldowns || {};
  return u;
}

function createBattleState(p1Id, p2Id) {
  return {
    players: [p1Id, p2Id],
    turn: p1Id,
    logs: [],
    finished: false,
    channels: {},
    battleMsgs: {},
  };
}

function startDuel(p1Id, p2Id) {
  const users = loadUsers();
  const p1 = normalizeUser(users[p1Id], p1Id);
  const p2 = normalizeUser(users[p2Id], p2Id);
  if (!p1 || !p2) return null;

  const state = createBattleState(p1Id, p2Id);
  state.logs.push(`✨ Trận đấu giữa ${p1.name} và ${p2.name} bắt đầu!`);

  battles[p1Id] = { state };
  battles[p2Id] = { state };

  delete challenges[p1Id];
  delete challenges[p2Id];
  return state;
}

function useSkill(userId, skillName) {
  const battle = battles[userId];
  if (!battle) return null;
  const state = battle.state;
  if (state.finished || state.turn !== userId) return state;

  const users = loadUsers();
  const attacker = normalizeUser(users[userId], userId);
  const defenderId = state.players.find((id) => id !== userId);
  const defender = normalizeUser(users[defenderId], defenderId);

  const skillList = skills[attacker.element] || [];
  const skill = skillList.find((s) => s.name === skillName);

  if (!skill) {
    state.logs.push(`${attacker.name} thử dùng skill không hợp lệ.`);
    return state;
  }

  // cost MP
  if (skill.cost?.mpPercent) {
    const need = Math.floor(
      (attacker.maxMp || 100) * (skill.cost.mpPercent / 100)
    );
    if (attacker.mp < need) {
      state.logs.push(`${attacker.name} không đủ MP để dùng ${skill.name}!`);
      return state;
    }
    attacker.mp -= need;
  }

  // cost Fury
  if ((skill.cost?.fury || 0) > attacker.fury) {
    state.logs.push(`${attacker.name} chưa đủ Nộ để dùng ${skill.name}!`);
    return state;
  }
  attacker.fury -= skill.cost?.fury || 0;

  // buff skill
  if (skill.type === "buff") {
    if ((attacker.buffCooldowns[skill.name] || 0) > 0) {
      state.logs.push(
        `⏳ ${attacker.name} chưa thể dùng lại ${skill.name} (CD:${
          attacker.buffCooldowns[skill.name]
        })!`
      );
      return state;
    }
    attacker.buffCooldowns[skill.name] = skill.cooldown || 3;

    attacker.buffs.push({
      name: skill.name,
      type: skill.buffType || "buff",
      value: skill.value || null,
      turns: 2, // duy trì 2 lượt bản thân
      pending: true,
      effect: skill.effect,
    });

    state.logs.push(
      `✨ ${attacker.name} chuẩn bị buff **${skill.name}**, sẽ kích hoạt từ lượt kế tiếp!`
    );
  }

  // damage skill
  let dmg = 0;
  if (skill.multiplier > 0 && skill.type !== "buff") {
    dmg = calculateDamage(attacker, defender, skill, state);
    defender.hp -= dmg;
  }

  if (skill.effect && skill.type !== "buff") {
    skill.effect(attacker, defender, dmg, state);
  }

  defender.hp = Math.max(0, defender.hp);
  attacker.fury = Math.max(
    0,
    Math.min(100, attacker.fury + (skill.furyGain || 0))
  );

  let log = `💥 ${attacker.name} dùng **${skill.name}**`;
  if (skill.type === "buff") log += ` (${skill.description})`;
  else if (dmg > 0) log += ` gây **${dmg}** sát thương cho ${defender.name}!`;
  state.logs.push(log);

  if (defender.hp <= 0) {
    state.finished = true;
    state.logs.push(`🏆 ${attacker.name} đã chiến thắng!`);
  } else {
    state.turn = defenderId;
  }

  // tick buff
  tickBuffs(attacker, state, true);

  const allUsers = loadUsers();
  allUsers[userId] = attacker;
  allUsers[defenderId] = defender;
  saveUsers(allUsers);

  return state;
}

function resetAfterBattle(state) {
  const users = loadUsers();
  for (const pid of state.players) {
    const u = normalizeUser(users[pid], pid);
    if (!u) continue;
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    u.fury = 0;
    u.shield = 0;
    u.buffs = [];
    u.buffCooldowns = {};
  }
  saveUsers(users);
  for (const pid of state.players) delete battles[pid];
}

function cancelAll() {
  for (const pid in battles) delete battles[pid];
  for (const cid in challenges) delete challenges[cid];
}

module.exports = {
  battles,
  challenges,
  startDuel,
  useSkill,
  resetAfterBattle,
  cancelAll,
};
