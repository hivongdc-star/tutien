const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { getUser, loadUsers, saveUsers } = require("../utils/storage");
const skills = require("../utils/skills");

// ==================================================
// STATE
// ==================================================
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

// ==================================================
// DAMAGE / BUFF
// ==================================================
function applyBuffs(user, target, baseAtk, baseDef) {
  let atk = baseAtk;
  let def = baseDef;
  let ignoreArmor = 0;

  for (const buff of user.buffs || []) {
    const val = Number(buff.value) || 0;
    if (buff.type === "buffAtk") atk = Math.floor(atk * (1 + val));
    if (buff.type === "buffIgnoreArmor") ignoreArmor = Math.max(ignoreArmor, val);
  }
  for (const buff of target.buffs || []) {
    const val = Number(buff.value) || 0;
    if (buff.type === "buffDef") def = Math.floor(def * (1 + val));
  }
  return { atk, def, ignoreArmor };
}

function calculateDamage(attacker, defender, skill, state) {
  if (skill.type === "buff") return 0;
  let atk = attacker.atk || 10;
  let def = defender.def || 0;
  const buffed = applyBuffs(attacker, defender, atk, def);
  atk = buffed.atk;
  def = buffed.def;
  if (buffed.ignoreArmor > 0) def = Math.floor(def * (1 - buffed.ignoreArmor));

  if (["normal", "mana", "fury"].includes(skill.type)) {
    const ratio = defender.spd / (attacker.spd + 1);
    const dodgeChance = Math.min(50, Math.max(0, ratio * 50));
    if (Math.random() * 100 < dodgeChance) {
      state?.logs?.push(`💨 ${defender.name} né được đòn của ${attacker.name}!`);
      return 0;
    }
  }

  let dmg = Math.floor(atk * (skill.multiplier || 1) * (100 / (100 + def)));
  if (defender.shield > 0) {
    const absorbed = Math.min(defender.shield, dmg);
    defender.shield -= absorbed;
    dmg -= absorbed;
    state?.logs?.push(`🛡️ Khiên của ${defender.name} đã chặn ${absorbed} sát thương!`);
  }
  return dmg > 0 ? dmg : 1;
}

function tickBuffs(user, state, isUserTurn) {
  if (!user.buffs || !isUserTurn) return;
  const next = [];
  for (const buff of user.buffs) {
    if (buff.pending) {
      if (typeof buff.effect === "function") {
        buff.effect(user, null, 0, state);
        state.logs.push(`🔮 Buff **${buff.name || buff.type}** của ${user.name} đã kích hoạt!`);
      }
      buff.pending = false;
    } else {
      buff.turns -= 1;
      if (buff.type === "shield" && buff.turns <= 0) user.shield = 0;
      if (buff.turns <= 0) {
        state.logs.push(`✨ Buff **${buff.name || buff.type}** của ${user.name} đã hết hiệu lực.`);
        continue;
      }
    }
    next.push(buff);
  }
  user.buffs = next;
  for (const key in user.buffCooldowns) {
    if (user.buffCooldowns[key] > 0) user.buffCooldowns[key]--;
  }
}

// ==================================================
// BATTLE ENGINE
// ==================================================
function startDuel(p1Id, p2Id) {
  const users = loadUsers();
  const p1 = normalizeUser(users[p1Id], p1Id);
  const p2 = normalizeUser(users[p2Id], p2Id);
  if (!p1 || !p2) return null;

  const state = {
    players: [p1Id, p2Id],
    turn: p1Id,
    logs: [`✨ Trận đấu giữa ${p1.name} và ${p2.name} bắt đầu!`],
    finished: false,
    channels: {},
    battleMsgs: {},
  };
  battles[p1Id] = { state };
  battles[p2Id] = { state };
  delete challenges[p1Id];
  delete challenges[p2Id];
  return state;
}

function getLegacySkillList(user) {
  // Giữ tương thích PvP cũ nếu skills từng export theo element.
  if (Array.isArray(skills[user.element])) return skills[user.element];
  return [];
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
  if (!attacker || !defender) return state;

  const skill = getLegacySkillList(attacker).find((s) => s.name === skillName);
  if (!skill) {
    state.logs.push(`${attacker.name} thử dùng skill không hợp lệ.`);
    return state;
  }

  if (skill.cost?.mpPercent) {
    const need = Math.floor((attacker.maxMp || 100) * (skill.cost.mpPercent / 100));
    if (attacker.mp < need) {
      state.logs.push(`${attacker.name} không đủ MP để dùng ${skill.name}!`);
      return state;
    }
    attacker.mp -= need;
  }
  if ((skill.cost?.fury || 0) > attacker.fury) {
    state.logs.push(`${attacker.name} chưa đủ Nộ để dùng ${skill.name}!`);
    return state;
  }
  attacker.fury -= skill.cost?.fury || 0;

  if (skill.type === "buff") {
    if ((attacker.buffCooldowns[skill.name] || 0) > 0) {
      state.logs.push(`⏳ ${attacker.name} chưa thể dùng lại ${skill.name} (CD:${attacker.buffCooldowns[skill.name]})!`);
      return state;
    }
    attacker.buffCooldowns[skill.name] = skill.cooldown || 3;
    attacker.buffs.push({
      name: skill.name,
      type: skill.buffType || "buff",
      value: skill.value || null,
      turns: 2,
      pending: true,
      effect: skill.effect,
    });
    state.logs.push(`✨ ${attacker.name} chuẩn bị buff **${skill.name}**, sẽ kích hoạt từ lượt kế tiếp!`);
  }

  let dmg = 0;
  if (skill.multiplier > 0 && skill.type !== "buff") {
    dmg = calculateDamage(attacker, defender, skill, state);
    defender.hp -= dmg;
  }
  if (skill.effect && skill.type !== "buff") skill.effect(attacker, defender, dmg, state);

  defender.hp = Math.max(0, defender.hp);
  attacker.fury = Math.max(0, Math.min(100, attacker.fury + (skill.furyGain || 0)));
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
  tickBuffs(attacker, state, true);

  const latest = loadUsers();
  latest[userId] = attacker;
  latest[defenderId] = defender;
  saveUsers(latest);
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
  for (const id in challenges) delete challenges[id];
}

// ==================================================
// BATTLE UI
// ==================================================
const elementEmojis = { kim: "⚔️", moc: "🌿", thuy: "💧", hoa: "🔥", tho: "⛰️" };

function createBar(current, max, length = 15, emoji = "🟩") {
  if (max <= 0) max = 1;
  const filled = Math.max(0, Math.min(length, Math.round((current / max) * length)));
  return `${emoji.repeat(filled)}${"⬛".repeat(Math.max(0, length - filled))}`;
}

function safeField(u, elementEmoji, fallbackName) {
  if (!u) return { name: `${elementEmoji} ${fallbackName}`, value: "❌ Không có dữ liệu", inline: true };
  const buffs = u.buffs?.length
    ? `\n🌀 Hiệu lực: ${u.buffs.map((b) => `${b.name || b.type || "Hiệu lực"}(${b.turns})`).join(", ")}`
    : "";
  const shield = u.shield > 0 ? `\n🛡️ Khiên: ${u.shield}` : "";
  const value =
    `❤️ HP: ${createBar(u.hp || 0, u.maxHp || 1, 15, "❤️")} (${u.hp || 0}/${u.maxHp || 1})\n` +
    `🔵 MP: ${createBar(u.mp || 0, u.maxMp || 1, 15, "🔵")} (${u.mp || 0}/${u.maxMp || 1})\n` +
    `🔥 Nộ: ${createBar(u.fury || 0, 100, 15, "🔥")} (${u.fury || 0}/100)` + shield + buffs;
  return { name: `${elementEmoji} ${String(u.name || fallbackName)}`, value: String(value).slice(0, 1024), inline: true };
}

function createBattleEmbed(state, users) {
  const p1 = users[state.players[0]];
  const p2 = users[state.players[1]];
  const desc = state.finished
    ? `🏆 ${state.logs?.[state.logs.length - 1] || "Trận tỷ thí đã kết thúc."}`
    : `${state.logs?.length ? state.logs.map((l) => `📜 ${l}`).join("\n") : "⚠️ Trận tỷ thí chưa có hành động nào."}\n\n👉 Đến lượt **${users[state.turn]?.name || "???"}**`;
  return new EmbedBuilder()
    .setTitle("⚔️ Tỷ Thí")
    .setDescription(desc)
    .addFields([
      safeField(p1, elementEmojis[p1?.element] || "", "Người chơi 1"),
      safeField(p2, elementEmojis[p2?.element] || "", "Người chơi 2"),
    ])
    .setColor(state.finished ? "Gold" : "Purple")
    .setFooter({ text: "Dùng chiêu thức hợp lúc để xoay chuyển thế trận." });
}

function createSkillMenu(user, userId, isTurn) {
  const skillList = getLegacySkillList(user);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`duel-skill-${userId}`)
    .setPlaceholder(isTurn ? "Chọn chiêu thức" : "Chưa tới lượt đạo hữu")
    .setDisabled(!isTurn);
  if (!skillList.length) {
    menu.addOptions([{ label: "Chưa có chiêu thức", value: "none" }]);
  } else {
    menu.addOptions(skillList.slice(0, 25).map((s) => {
      const cd = user.buffCooldowns?.[s.name] || 0;
      return {
        label: String(cd > 0 ? `${s.name} (CD:${cd})` : s.name).slice(0, 100),
        description: `${s.description || ""} | ${s.cost?.mpPercent ? `MP:${s.cost.mpPercent}%` : ""} ${s.cost?.fury ? `| Nộ:${s.cost.fury}` : ""}`.trim().slice(0, 100),
        value: s.name,
      };
    }));
  }
  return new ActionRowBuilder().addComponents(menu);
}

async function sendBattleEmbeds(_client, state) {
  const users = loadUsers();
  const embed = createBattleEmbed(state, users);
  for (const pid of state.players) {
    const row = createSkillMenu(users[pid], pid, state.turn === pid);
    if (state.battleMsgs?.[pid]) {
      await state.battleMsgs[pid].edit({ embeds: [embed], components: [row] });
    } else if (state.channels?.[pid]) {
      const sent = await state.channels[pid].send({ embeds: [embed], components: [row] });
      state.battleMsgs[pid] = sent;
    }
  }
}

async function handleSkillInteraction(interaction, client) {
  const clickerId = interaction.user.id;
  const battle = battles[clickerId];
  if (!battle) return interaction.reply({ content: "❌ Trận tỷ thí không còn tồn tại.", ephemeral: true });
  const state = battle.state;
  if (state.turn !== clickerId) return interaction.reply({ content: "❌ Chưa tới lượt đạo hữu.", ephemeral: true });

  await interaction.deferUpdate();
  const skillName = interaction.values[0];
  const newState = useSkill(clickerId, skillName);
  if (!newState) return;

  if (newState.finished) {
    const users = loadUsers();
    const embed = createBattleEmbed(newState, users);
    resetAfterBattle(newState);
    for (const pid of state.players) {
      if (state.battleMsgs?.[pid]) await state.battleMsgs[pid].edit({ embeds: [embed], components: [] });
    }
    return;
  }

  await sendBattleEmbeds(client, newState);
  await interaction.followUp({ content: `✅ Đạo hữu thi triển chiêu thức: **${skillName}**`, ephemeral: true });
}

// ==================================================
// COMMANDS
// ==================================================
const thachdau = {
  name: "thachdau",
  aliases: ["td"],
  run: async (_client, message) => {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply("❌ Hãy tag đạo hữu muốn tỷ thí.");
    if (opponent.id === message.author.id) return message.reply("❌ Không thể tự tỷ thí với chính mình.");
    if (!getUser(message.author.id) || !getUser(opponent.id)) return message.reply("❌ Cả hai người chơi cần khai mở nhân vật trước khi tỷ thí.");

    challenges[opponent.id] = { challengerId: message.author.id, createdAt: Date.now() };
    await message.channel.send(`⚔️ **${message.author.username}** muốn tỷ thí với <@${opponent.id}>.\nNgười được mời có **30 giây** để chấp nhận bằng **-acp** hoặc từ chối bằng **-deny**.`);
    setTimeout(() => {
      if (challenges[opponent.id]) {
        delete challenges[opponent.id];
        message.channel.send("⌛ Lời tỷ thí đã tan sau 30 giây.");
      }
    }, 30000);
  },
};

const acp = {
  name: "acp",
  aliases: ["accept", "chapnhan"],
  run: async (client, message) => {
    const challenge = challenges[message.author.id];
    if (!challenge) return message.reply("❌ Hiện không có chiến thư nào gửi tới đạo hữu.");
    const challengerId = challenge.challengerId;
    const defenderId = message.author.id;
    const state = startDuel(challengerId, defenderId);
    if (!state) return message.reply("❌ Không thể khai chiến vì có người chưa nhập đạo.");

    state.logs.push(`✨ Trận đấu giữa <@${challengerId}> và <@${defenderId}> bắt đầu!`);
    delete challenges[defenderId];
    try {
      const challenger = await client.users.fetch(challengerId);
      const dm = await challenger.createDM();
      await dm.send(`🔥 Trận đấu với **${message.author.username}** đã bắt đầu!`);
      state.channels[challengerId] = dm;
    } catch {
      state.channels[challengerId] = message.channel;
    }
    try {
      const dm = await message.author.createDM();
      await dm.send(`🔥 Trận đấu với <@${challengerId}> đã bắt đầu!`);
      state.channels[defenderId] = dm;
    } catch {
      state.channels[defenderId] = message.channel;
    }
    await sendBattleEmbeds(client, state);
  },
};

const deny = {
  name: "deny",
  aliases: ["d"],
  run: async (_client, message) => {
    if (!challenges[message.author.id]) return message.reply("❌ Không có lời thách đấu nào cần từ chối!");
    delete challenges[message.author.id];
    return message.channel.send(`🚫 <@${message.author.id}> đã từ chối thách đấu.`);
  },
};

const cancel = {
  name: "cancel",
  aliases: ["cxl", "endall"],
  run: (_client, msg) => {
    if (msg.author.id !== process.env.OWNER_ID) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    cancelAll();
    return msg.reply("✅ Đã huỷ toàn bộ trận đấu và lời thách đấu.");
  },
};

module.exports = {
  commands: [thachdau, acp, deny, cancel],
  handleSkillInteraction,
};
