// commands/dungeon.js
// Dungeon cinematic, party 1-3 người. Combat turn-based tự động.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { loadUsers, saveUsers } = require("../utils/storage");
const { recordEvent: recordQuestEvent } = require("../utils/questSystem");
const { recordEvent: recordAchvEvent } = require("../utils/achievementSystem");
const elements = require("../utils/element");
const { rollOre } = require("../utils/mining");
const { tierMeta, tierText } = require("../utils/tiers");
const { ensureUserSkills, addShard } = require("../utils/skills");
const { diffMeta, makePlayerEntity, generateEnemies, simulateBattle, shuffle } = require("../utils/dungeonEngine");
const { drawDungeonCard } = require("../utils/dungeonCanvas");

const LOBBY_TTL_MS = 10 * 60 * 1000;

const activeTeamOfUser = new Map(); // userId -> lobbyId
const lobbies = new Map(); // lobbyId -> lobby

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureMining(user) {
  if (!user.mining) user.mining = {};
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

const MAPS = [
  // Dùng đúng extension .png theo assets/backgrounds/*
  { key: "forest", name: "Thanh Lâm Cổ Động", file: "forest.png" },
  { key: "lava", name: "Hỏa Ngục Nham Uyên", file: "lava.png" },
  { key: "ocean", name: "Hàn Hải Long Cung", file: "ocean.png" },
  { key: "default", name: "Vô Danh Tàn Điện", file: "default.png" },
  { key: "black", name: "Hắc Vực Ma Quật", file: "black.png" },

  // --- Map mở rộng (bạn tự thay ảnh trong assets/backgrounds/*) ---
  { key: "sakura", name: "Bích Anh Hoa Lộ", file: "sakura.png" },
  { key: "skytemple", name: "Vân Thiên Tiên Các", file: "skytemple.png" },
  { key: "ruins", name: "Cổ Tự Tàn Tích", file: "ruins.png" },
  { key: "ice", name: "Hàn Băng U Cốc", file: "ice.png" },
  { key: "desert", name: "Hoàng Sa Di Tích", file: "desert.png" },
];

function pickDifficulty() {
  const r = Math.random();
  if (r < 0.55) return "easy";
  if (r < 0.85) return "hard";
  return "extreme";
}

function pickFloors(diff) {
  if (diff === "easy") return rand(3, 6);
  if (diff === "hard") return rand(5, 8);
  return rand(7, 10);
}

function rand(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function moneyPerFloor(diff) {
  if (diff === "easy") return 220;
  if (diff === "hard") return 360;
  return 520;
}

function penaltyOnWipe(diff) {
  if (diff === "easy") return 800;
  if (diff === "hard") return 1400;
  return 2200;
}

function oreDropBonus(diff) {
  if (diff === "easy") return 0;
  if (diff === "hard") return 4;
  return 8;
}

function shardRates(diff, isBoss) {
  // % theo mỗi tầng
  const baseRare = diff === "easy" ? 8 : diff === "hard" ? 11 : 15;
  const baseEpic = diff === "easy" ? 1.0 : diff === "hard" ? 1.6 : 2.2;
  return {
    rare: isBoss ? baseRare * 1.6 : baseRare,
    epic: isBoss ? baseEpic * 2.8 : baseEpic,
  };
}

function oreRates(diff, isBoss) {
  const base = diff === "easy" ? 8 : diff === "hard" ? 10 : 12;
  return isBoss ? base * 2.4 : base;
}

function buildLobbyEmbed({ lobby, users }) {
  const members = [...lobby.members].map((uid) => {
    const u = users[uid];
    const el = u?.element ? elements.display[u.element] : "?";
    const realm = u?.realm || "?";
    return `• <@${uid}> — **${realm}** • ${el}`;
  });

  return new EmbedBuilder()
    .setTitle("🏯 Dungeon • Tạo đội")
    .setColor(0x9b59b6)
    .setDescription(
      `Host: <@${lobby.hostId}>\n` +
        `Đội tối đa **3** đạo hữu.\n\n` +
        `**Danh sách:**\n${members.join("\n") || "(Trống)"}`
    )
    .setFooter({ text: `Lobby: ${lobby.id}` });
}

function lobbyButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("dg_join").setLabel("Gia nhập").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("dg_leave").setLabel("Rời đội").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId("dg_start").setLabel("Bắt đầu").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId("dg_cancel").setLabel("Hủy").setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

async function renderAndEdit(message, payload) {
  try {
    return await message.edit(payload);
  } catch {
    return null;
  }
}

async function startRun({ client, channel, lobbyMessage, lobby, users }) {
  const memberIds = [...lobby.members];
  if (!memberIds.length) return;

  // Build party entities
  const party = memberIds
    .map((uid) => (users[uid] ? makePlayerEntity(uid, users[uid]) : null))
    .filter(Boolean);
  if (!party.length) return;

  // Random map + difficulty + floors
  const map = MAPS[rand(0, MAPS.length - 1)];
  const diff = pickDifficulty();
  const dm = diffMeta(diff);
  const floors = pickFloors(diff);

  // Yêu cầu mới: dungeon chạy liên tục, không cần tương tác.
  // Chỉ update "frame kết thúc tầng" (không render keyframe/log).

  let totalLt = 0;
  const drops = []; // {type:'ore', oreId, oreName, tier} | {type:'shard', element, rarity}

  for (let floor = 1; floor <= floors; floor++) {
    const isBoss = floor === floors;
    const enemies = generateEnemies({ party, mapKey: map.key, diff, floor, isBoss });

    const { outcome, turn } = simulateBattle({ party, enemies, maxTurns: 60 });

    if (outcome !== "win") {
      // wipe / timeout => thua
      const penalty = penaltyOnWipe(diff);
      for (const uid of memberIds) {
        users[uid].lt = Math.max(0, (users[uid].lt || 0) - penalty);
      }

      const cleared = Math.max(0, floor - 1);
      const titleLines = [];
      if (cleared > 0) {
        for (const uid of memberIds) {
          if (!users[uid]) continue;
          recordQuestEvent(users[uid], "dungeon_floor", cleared, Date.now());
          const titles = recordAchvEvent(users[uid], "dungeon_floor", cleared) || [];
          if (titles.length) titleLines.push("• <@" + uid + ">: " + titles.join(", "));
        }
      }
      const titleExtra = titleLines.length
        ? "\n\n🎖 **Danh hiệu mở khoá:**\n" + titleLines.slice(0, 6).join("\n")
        : "";

      saveUsers(users);

      const endPng = await drawDungeonCard({
        scene: "result",
        map,
        diffName: dm.name,
        floor,
        totalFloors: floors,
        party,
        enemies,
        turn,
        logs: [],
      });
      const endFile = new AttachmentBuilder(endPng, { name: "dungeon.png" });
      const endEmbed = new EmbedBuilder()
        .setTitle("💀 Đội hình tan tác")
        .setColor(0x992d22)
        .setDescription(
          `**${map.name}** • Độ khó: **${dm.name}**\n` +
            `Thất bại tại tầng **${floor}/${floors}**. Mỗi đạo hữu bị trừ **${penalty}** 💎 Linh thạch.` + titleExtra
        )
        .setImage("attachment://dungeon.png");
      await renderAndEdit(lobbyMessage, { embeds: [endEmbed], files: [endFile], components: [] });
      return;
    }

    // Win floor
    totalLt += moneyPerFloor(diff);

    // Drops: ores
    const oreChance = oreRates(diff, isBoss);
    if (Math.random() * 100 < oreChance) {
      const ore = rollOre({ bonusRare: oreDropBonus(diff) });
      if (ore) drops.push({ type: "ore", oreId: ore.id, oreName: ore.name, tier: ore.tier });
    }
    // Drops: shards
    const sr = shardRates(diff, isBoss);
    if (Math.random() * 100 < sr.rare) {
      // shard rare cho 1 ngẫu nhiên trong party
      const pick = party[rand(0, party.length - 1)];
      drops.push({ type: "shard", element: pick.element || "kim", rarity: "rare" });
    }
    if (Math.random() * 100 < sr.epic) {
      const pick = party[rand(0, party.length - 1)];
      drops.push({ type: "shard", element: pick.element || "kim", rarity: "epic" });
    }

    // Chỉ update frame kết thúc tầng (không log)
    if (floor < floors) {
      const midPng = await drawDungeonCard({
        scene: "result",
        map,
        diffName: dm.name,
        floor,
        totalFloors: floors,
        party,
        enemies: [],
        turn,
        logs: [],
      });
      const midFile = new AttachmentBuilder(midPng, { name: "dungeon.png" });
      const midEmbed = new EmbedBuilder()
        .setTitle(isBoss ? "✅ Boss bại trận" : `✅ Thông quan • Tầng ${floor}/${floors}`)
        .setColor(dm.color)
        .setDescription(
          `**${map.name}** • Độ khó: **${dm.name}**\n` +
            `Tạm tích lũy: **${totalLt}** 💎 Linh thạch.\n` +
            `Đội hình tiếp tục thâm nhập tầng kế tiếp…`
        )
        .setImage("attachment://dungeon.png");
      await renderAndEdit(lobbyMessage, { embeds: [midEmbed], files: [midFile], components: [] });
      await sleep(rand(550, 850));
    }
  }

  // Cashout: chia LT đều + chia loot random
  const per = Math.floor(totalLt / party.length);
  const rem = totalLt - per * party.length;
  const order = shuffle([...memberIds]);
  for (let idx = 0; idx < order.length; idx++) {
    const uid = order[idx];
    users[uid].lt = (users[uid].lt || 0) + per + (idx < rem ? 1 : 0);
  }

  // Chia drops random
  const dropLog = [];
  if (drops.length) {
    const shuffled = shuffle([...drops]);
    for (let i = 0; i < shuffled.length; i++) {
      const uid = order[i % order.length];
      const d = shuffled[i];
      if (!users[uid]) continue;
      if (d.type === "ore") {
        ensureMining(users[uid]);
        users[uid].mining.ores[d.oreId] = (Number(users[uid].mining.ores[d.oreId]) || 0) + 1;
        dropLog.push(`• <@${uid}> nhận ${tierMeta(d.tier).icon} **${d.oreName}** _(${tierText(d.tier)})_`);
      } else if (d.type === "shard") {
        ensureUserSkills(users[uid]);
        addShard(users[uid], d.element, d.rarity, 1);
        const el = elements.display[d.element] || d.element;
        dropLog.push(`• <@${uid}> nhận **Mảnh bí kíp** (${el} • ${d.rarity === "epic" ? "Cực hiếm" : "Hiếm"})`);
      }
    }
  }

  // Quest/Achievement: cộng tiến độ dungeon theo số tầng đã thông quan
  const unlockLines = [];
  for (const uid of memberIds) {
    if (!users[uid]) continue;
    recordQuestEvent(users[uid], "dungeon_floor", floors, Date.now());
    const titles = recordAchvEvent(users[uid], "dungeon_floor", floors) || [];
    if (titles.length) unlockLines.push("• <@" + uid + ">: " + titles.join(", "));
  }
  const unlockExtra = unlockLines.length
    ? "\n\n🎖 **Danh hiệu mở khoá:**\n" + unlockLines.slice(0, 6).join("\n")
    : "";

  saveUsers(users);

  const endPng = await drawDungeonCard({
    scene: "result",
    map,
    diffName: dm.name,
    floor: floors,
    totalFloors: floors,
    party,
    enemies: [],
    turn: 0,
    logs: [],
  });
  const endFile = new AttachmentBuilder(endPng, { name: "dungeon.png" });
  const endEmbed = new EmbedBuilder()
    .setTitle("🏆 Xuất Quan")
    .setColor(dm.color)
    .setDescription(
      `Động phủ đã khép lại.\n` +
        `Tổng thưởng: **${totalLt}** 💎 Linh thạch (chia đều).\n` +
        (dropLog.length ? `\n**Chiến lợi phẩm:**\n${dropLog.join("\n")}` : "\n**Chiến lợi phẩm:** _không có_" ) + unlockExtra
    )
    .setImage("attachment://dungeon.png");

  await renderAndEdit(lobbyMessage, { embeds: [endEmbed], files: [endFile], components: [] });
}

module.exports = {
  name: "dungeon",
  aliases: ["dg"],
  description: "Dungeon cinematic (tạo đội 1-3).",
  run: async (client, msg) => {
    const users = loadUsers();
    const host = users[msg.author.id];
    if (!host) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    if (activeTeamOfUser.has(msg.author.id)) {
      return msg.reply("⚠️ Bạn đang ở trong một đội khác. Hãy rời đội đó trước.");
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 6);
    const lobby = {
      id,
      hostId: msg.author.id,
      channelId: msg.channel.id,
      messageId: null,
      members: new Set([msg.author.id]),
      started: false,
    };

    // lock host
    activeTeamOfUser.set(msg.author.id, id);
    lobbies.set(id, lobby);

    const embed = buildLobbyEmbed({ lobby, users });
    const reply = await msg.reply({ embeds: [embed], components: [lobbyButtons(false)] });
    lobby.messageId = reply.id;

    const collector = reply.createMessageComponentCollector({ time: LOBBY_TTL_MS });

    collector.on("collect", async (i) => {
      try {
        if (i.message.id !== reply.id) return;
        const users2 = loadUsers();
        if (!users2[i.user.id]) {
          return i.reply({ content: "❌ Bạn chưa có nhân vật.", ephemeral: true });
        }
        await i.deferUpdate();

        const curLobby = lobbies.get(id);
        if (!curLobby || curLobby.started) return;

        if (i.customId === "dg_join") {
          if (curLobby.members.has(i.user.id)) return;
          if (curLobby.members.size >= 3) {
            return i.followUp({ content: "⚠️ Đội đã đủ 3 người.", ephemeral: true });
          }
          if (activeTeamOfUser.has(i.user.id)) {
            return i.followUp({ content: "⚠️ Bạn đang ở trong một đội khác.", ephemeral: true });
          }
          curLobby.members.add(i.user.id);
          activeTeamOfUser.set(i.user.id, id);
        }

        if (i.customId === "dg_leave") {
          if (!curLobby.members.has(i.user.id)) return;
          if (i.user.id === curLobby.hostId) {
            collector.stop("cancel");
            return;
          }
          curLobby.members.delete(i.user.id);
          activeTeamOfUser.delete(i.user.id);
        }

        if (i.customId === "dg_cancel") {
          if (i.user.id !== curLobby.hostId) return;
          collector.stop("cancel");
          return;
        }

        if (i.customId === "dg_start") {
          if (i.user.id !== curLobby.hostId) return;
          collector.stop("start");
          return;
        }

        // Update lobby view
        const upUsers = loadUsers();
        const upEmbed = buildLobbyEmbed({ lobby: curLobby, users: upUsers });
        await renderAndEdit(reply, { embeds: [upEmbed], components: [lobbyButtons(false)] });
      } catch {
        // ignore
      }
    });

    collector.on("end", async (_, reason) => {
      const users2 = loadUsers();
      const curLobby = lobbies.get(id);
      const members = curLobby ? [...curLobby.members] : [];

      // unlock all members
      for (const uid of members) activeTeamOfUser.delete(uid);
      lobbies.delete(id);

      if (!curLobby) return;

      if (reason === "start") {
        curLobby.started = true;
        const disabledEmbed = buildLobbyEmbed({ lobby: curLobby, users: users2 });
        await renderAndEdit(reply, { embeds: [disabledEmbed], components: [lobbyButtons(true)] });
        return startRun({ client, channel: msg.channel, lobbyMessage: reply, lobby: curLobby, users: users2 });
      }

      // cancel/timeout
      const end = new EmbedBuilder()
        .setTitle("🏯 Dungeon")
        .setColor(0x7f8c8d)
        .setDescription(reason === "cancel" ? "Lobby đã bị hủy." : "Lobby đã hết hạn.");
      await renderAndEdit(reply, { embeds: [end], components: [] });
    });
  },
};
