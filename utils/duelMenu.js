const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { useSkill, resetAfterBattle, battles } = require("./duel");
const { loadUsers } = require("./storage");
const skills = require("./skills");
const { createBar } = require("./barHelper");

const elementEmojis = {
  kim: "⚔️",
  moc: "🌿",
  thuy: "💧",
  hoa: "🔥",
  tho: "⛰️",
};

// đảm bảo field hợp lệ cho embed
function safeField(u, elementEmoji, fallbackName) {
  if (!u) {
    return {
      name: `${elementEmoji} ${fallbackName}`,
      value: "❌ Không có dữ liệu",
      inline: true,
    };
  }

  let buffsText = "";
  if (u.buffs?.length > 0) {
    buffsText =
      "\n🌀 Hiệu lực: " +
      u.buffs
        .map((b) => `${b.name || b.type || "Hiệu lực"}(${b.turns})`)
        .join(", ");
  }
  let shieldText = u.shield > 0 ? `\n🛡️ Khiên: ${u.shield}` : "";

  const value =
    `❤️ HP: ${createBar(u.hp || 0, u.maxHp || 1, 15, "❤️")} (${u.hp || 0}/${
      u.maxHp || 1
    })\n` +
    `🔵 MP: ${createBar(u.mp || 0, u.maxMp || 1, 15, "🔵")} (${u.mp || 0}/${
      u.maxMp || 1
    })\n` +
    `🔥 Nộ: ${createBar(u.fury || 0, 100, 15, "🔥")} (${u.fury || 0}/100)` +
    shieldText +
    buffsText;

  return {
    name: `${elementEmoji} ${String(u.name || fallbackName)}`,
    value: String(value).slice(0, 1024),
    inline: true,
  };
}

// embed trận đấu
function createBattleEmbed(state, users) {
  const p1 = users[state.players[0]];
  const p2 = users[state.players[1]];

  let desc = "";
  if (state.finished) {
    desc =
      "🏆 " + (state.logs?.[state.logs.length - 1] || "Trận tỷ thí đã kết thúc.");
  } else {
    const turnLogs = state.logs?.length
      ? state.logs.map((l) => `📜 ${l}`).join("\n")
      : "⚠️ Trận tỷ thí chưa có hành động nào.";

    desc = `${turnLogs}\n\n👉 Đến lượt **${users[state.turn]?.name || "???"}**`;
  }

  return new EmbedBuilder()
    .setTitle("⚔️ Tỷ Thí")
    .setDescription(desc || "⚠️ Nhật ký trận tỷ thí đang trống.")
    .addFields([
      safeField(p1, elementEmojis[p1?.element] || "", "Người chơi 1"),
      safeField(p2, elementEmojis[p2?.element] || "", "Người chơi 2"),
    ])
    .setColor(state.finished ? "Gold" : "Purple")
    .setFooter({ text: "Dùng chiêu thức hợp lúc để xoay chuyển thế trận." });
}

// menu skill cho 1 người
function createSkillMenu(user, userId, isTurn) {
  const skillList = skills[user.element] || [];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`duel-skill-${userId}`)
    .setPlaceholder(isTurn ? "Chọn chiêu thức" : "Chưa tới lượt của bạn")
    .setDisabled(!isTurn);

  if (skillList.length === 0) {
    menu.addOptions([{ label: "Chưa có chiêu thức", value: "none" }]);
  } else {
    menu.addOptions(
      skillList.map((s) => {
        let cd = user.buffCooldowns?.[s.name] || 0;
        let label = cd > 0 ? `${s.name} (CD:${cd})` : s.name;
        return {
          label: String(label).slice(0, 100),
          description: `${s.description || ""} | ${
            s.cost?.mpPercent ? `MP:${s.cost.mpPercent}%` : ""
          } ${s.cost?.fury ? `| Nộ:${s.cost.fury}` : ""}`
            .trim()
            .slice(0, 100),
          value: s.name,
        };
      })
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}

// gửi/edits embed cho từng người chơi
async function sendBattleEmbeds(client, state) {
  const users = loadUsers();
  const embed = createBattleEmbed(state, users);

  for (const pid of state.players) {
    const player = users[pid];
    const isTurn = state.turn === pid;
    const row = createSkillMenu(player, pid, isTurn);

    if (state.battleMsgs?.[pid]) {
      await state.battleMsgs[pid].edit({ embeds: [embed], components: [row] });
    } else {
      const ch = state.channels?.[pid];
      if (ch) {
        const msg = await ch.send({ embeds: [embed], components: [row] });
        if (!state.battleMsgs) state.battleMsgs = {};
        state.battleMsgs[pid] = msg;
      }
    }
  }
}

// xử lý chọn skill
async function handleSkillInteraction(interaction, client) {
  const clickerId = interaction.user.id;

  const battle = battles[clickerId];
  if (!battle) {
    return interaction.reply({
      content: "❌ Trận tỷ thí không còn tồn tại.",
      ephemeral: true,
    });
  }

  const state = battle.state;
  if (state.turn !== clickerId) {
    return interaction.reply({
      content: "❌ Chưa tới lượt của bạn.",
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();
  const skillName = interaction.values[0];
  const newState = useSkill(clickerId, skillName);
  const users = loadUsers();

  if (newState.finished) {
    resetAfterBattle(newState);
    const embed = createBattleEmbed(newState, users);
    for (const pid of state.players) {
      if (state.battleMsgs?.[pid]) {
        await state.battleMsgs[pid].edit({ embeds: [embed], components: [] });
      }
    }
    return;
  }

  await sendBattleEmbeds(client, newState);

  await interaction.followUp({
    content: `✅ Bạn đã dùng chiêu thức: **${skillName}**`,
    ephemeral: true,
  });
}

module.exports = { sendBattleEmbeds, handleSkillInteraction };
