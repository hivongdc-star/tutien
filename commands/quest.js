// commands/quest.js
// Nhiệm vụ ngày/tuần (combo 1): xem tiến độ + nhận thưởng.
// Tối ưu: 1 collector (button+menu), embed gọn hơn, giảm rủi ro interaction fail.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { ensureQuestState, getQuestProgress, canClaim, claim } = require("../utils/questSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function renderScopeLines(list) {
  return (list || [])
    .map((q) => {
      const st = q.claimed ? "✅ Đã nhận" : q.done ? "🎁 Có thể nhận" : "⏳ Đang làm";
      return `• **${q.name}** — ${q.progress}/${q.target} • +${fmtLT(q.rewardLt)} LT • ${st}`;
    })
    .join("\n");
}

function countClaimable(list) {
  return (list || []).filter((q) => q.done && !q.claimed).length;
}

function buildEmbed(user, daily, weekly) {
  const dClaim = countClaimable(daily);
  const wClaim = countClaimable(weekly);

  return new EmbedBuilder()
    .setTitle("🧭 Sổ Nhiệm Vụ")
    .setColor(0x3498db)
    .setDescription(
      `Linh thạch hiện có: **${fmtLT(user.lt)}** 💎\n` +
        `Có thể nhận: **${dClaim}** nhiệm vụ ngày • **${wClaim}** nhiệm vụ tuần.`
    )
    .addFields(
      {
        name: "📅 Mục tiêu trong ngày",
        value: renderScopeLines(daily) || "(Trống)",
        inline: false,
      },
      {
        name: "🗓️ Mục tiêu trong tuần",
        value: renderScopeLines(weekly) || "(Trống)",
        inline: false,
      }
    )
    .setFooter({ text: "Thưởng nhiệm vụ hiện chỉ cộng linh thạch." });
}

function buildClaimMenu(userId, nonce, daily, weekly) {
  const options = [];

  for (const q of daily) {
    if (q.done && !q.claimed) {
      options.push({
        label: `Ngày: ${q.name}`.slice(0, 100),
        value: `daily:${q.id}`,
        description: `+${fmtLT(q.rewardLt)} LT`.slice(0, 100),
      });
    }
  }
  for (const q of weekly) {
    if (q.done && !q.claimed) {
      options.push({
        label: `Tuần: ${q.name}`.slice(0, 100),
        value: `weekly:${q.id}`,
        description: `+${fmtLT(q.rewardLt)} LT`.slice(0, 100),
      });
    }
  }

  if (!options.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`quest_pick_${userId}_${nonce}`)
      .setPlaceholder("Chọn mục tiêu để lĩnh thưởng...")
      .addOptions(options.slice(0, 25))
  );
}

function buildButtons(userId, nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quest_claimall_${userId}_${nonce}`)
      .setLabel("Lĩnh hết")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`quest_close_${userId}_${nonce}`)
      .setLabel("Đóng")
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  name: "quest",
  aliases: ["q"],
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");

    ensureQuestState(u, Date.now());
    users[msg.author.id] = u;
    saveUsers(users);

    const nonce = Math.random().toString(36).slice(2, 8);

    const readState = () => {
      const users2 = loadUsers();
      const u2 = users2[msg.author.id];
      if (!u2) return null;
      ensureQuestState(u2, Date.now());
      const daily = getQuestProgress(u2, "daily", Date.now());
      const weekly = getQuestProgress(u2, "weekly", Date.now());
      users2[msg.author.id] = u2;
      saveUsers(users2);
      return { users2, u2, daily, weekly };
    };

    const s0 = readState();
    if (!s0) return msg.reply("❌ Đạo hữu chưa nhập đạo.");

    const buildRows = (daily, weekly) => {
      const rows = [buildButtons(msg.author.id, nonce)];
      const pick = buildClaimMenu(msg.author.id, nonce, daily, weekly);
      if (pick) rows.unshift(pick);
      return rows;
    };

    const sent = await msg.reply({
      embeds: [buildEmbed(s0.u2, s0.daily, s0.weekly)],
      components: buildRows(s0.daily, s0.weekly),
    });

    const refresh = async () => {
      const s = readState();
      if (!s) return;
      await sent
        .edit({
          embeds: [buildEmbed(s.u2, s.daily, s.weekly)],
          components: buildRows(s.daily, s.weekly),
        })
        .catch(() => {});
    };

    const col = sent.createMessageComponentCollector({ time: 120_000 });

    col.on("collect", async (i) => {
      try {
        if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải bảng nhiệm vụ của đạo hữu.", ephemeral: true });

        const cid = String(i.customId || "");
        const sessionSuffix = `_${nonce}`;

        // Close
        if (i.isButton() && cid === `quest_close_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();
          col.stop("close");
          return sent.edit({ components: [] }).catch(() => {});
        }

        // Claim all
        if (i.isButton() && cid === `quest_claimall_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();

          const users2 = loadUsers();
          const u2 = users2[msg.author.id];
          if (!u2) return i.followUp({ content: "❌ Đạo hữu chưa nhập đạo.", ephemeral: true });
          ensureQuestState(u2, Date.now());

          let total = 0;
          let count = 0;
          for (const scope of ["daily", "weekly"]) {
            const list = getQuestProgress(u2, scope, Date.now());
            for (const q of list) {
              if (!q.done || q.claimed) continue;
              const res = claim(u2, scope, q.id, Date.now());
              if (res.ok) {
                total += Number(res.rewardLt) || 0;
                count++;
              }
            }
          }

          users2[msg.author.id] = u2;
          saveUsers(users2);
          await refresh();

          if (count <= 0) return i.followUp({ content: "⚠️ Hiện chưa có mục tiêu nào đủ điều kiện lĩnh thưởng.", ephemeral: true });
          return i.followUp({ content: `✅ Đã lĩnh **${count}** mục tiêu: **+${fmtLT(total)} LT**`, ephemeral: true });
        }

        // Claim single via menu
        if (i.isStringSelectMenu() && cid === `quest_pick_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();
          const val = String(i.values?.[0] || "");
          const [scope, questId] = val.split(":");
          if (!scope || !questId) return;

          const users2 = loadUsers();
          const u2 = users2[msg.author.id];
          if (!u2) return i.followUp({ content: "❌ Đạo hữu chưa nhập đạo.", ephemeral: true });
          ensureQuestState(u2, Date.now());

          if (!canClaim(u2, scope, questId, Date.now())) {
            users2[msg.author.id] = u2;
            saveUsers(users2);
            await refresh();
            return i.followUp({ content: "⚠️ Mục tiêu này chưa đủ điều kiện hoặc đã được lĩnh rồi.", ephemeral: true });
          }

          const res = claim(u2, scope, questId, Date.now());
          users2[msg.author.id] = u2;
          saveUsers(users2);
          await refresh();

          if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });
          return i.followUp({ content: `✅ Đã lĩnh thưởng: **+${fmtLT(res.rewardLt)} LT**`, ephemeral: true });
        }

        // Ignore other components (session mismatch)
        if ((i.isButton() || i.isStringSelectMenu()) && !cid.endsWith(sessionSuffix)) {
          return i.reply({ content: "⚠️ Session đã hết hạn.", ephemeral: true });
        }
      } catch (e) {
        try {
          if (!i.deferred && !i.replied) await i.deferUpdate();
        } catch {}
      }
    });

    col.on("end", async () => {
      await sent.edit({ components: [] }).catch(() => {});
    });
  },
};
