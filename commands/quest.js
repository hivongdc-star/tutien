// commands/quest.js
// Nhiệm vụ ngày/tuần (combo 1): xem tiến độ + nhận thưởng.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const {
  ensureQuestState,
  getQuestProgress,
  canClaim,
  claim,
} = require("../utils/questSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function renderScopeLines(list) {
  return list
    .map((q) => {
      const done = q.done;
      const st = q.claimed ? "✅ Đã nhận" : done ? "🎁 Có thể nhận" : "⏳ Đang làm";
      return `• **${q.name}** — ${q.progress}/${q.target} • +${fmtLT(q.rewardLt)} LT • ${st}`;
    })
    .join("\n");
}

function buildEmbed(user, daily, weekly) {
  const emb = new EmbedBuilder()
    .setTitle("🧭 Nhiệm vụ")
    .setColor(0x3498db)
    .setDescription(`Linh thạch hiện có: **${fmtLT(user.lt)}** 💎`)
    .addFields(
      {
        name: "📅 Nhiệm vụ ngày",
        value: renderScopeLines(daily) || "(Trống)",
        inline: false,
      },
      {
        name: "🗓️ Nhiệm vụ tuần",
        value: renderScopeLines(weekly) || "(Trống)",
        inline: false,
      }
    )
    .setFooter({ text: "Nhận thưởng không cộng EXP (chỉ LT)." });
  return emb;
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
      .setPlaceholder("Chọn nhiệm vụ để nhận thưởng...")
      .addOptions(options.slice(0, 25))
  );
}

function buildButtons(userId, nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`quest_claimall_${userId}_${nonce}`)
      .setLabel("Nhận tất cả")
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
    if (!u) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureQuestState(u, Date.now());
    const daily = getQuestProgress(u, "daily", Date.now());
    const weekly = getQuestProgress(u, "weekly", Date.now());
    saveUsers(users);

    const nonce = Math.random().toString(36).slice(2, 8);
    const rows = [buildButtons(msg.author.id, nonce)];
    const pickRow = buildClaimMenu(msg.author.id, nonce, daily, weekly);
    if (pickRow) rows.unshift(pickRow);

    const sent = await msg.reply({
      embeds: [buildEmbed(u, daily, weekly)],
      components: rows,
    });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });
    const selCollector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
    });

    const refresh = async () => {
      const users2 = loadUsers();
      const u2 = users2[msg.author.id];
      if (!u2) return;
      ensureQuestState(u2, Date.now());
      const d2 = getQuestProgress(u2, "daily", Date.now());
      const w2 = getQuestProgress(u2, "weekly", Date.now());
      users2[msg.author.id] = u2;
      saveUsers(users2);

      const newRows = [buildButtons(msg.author.id, nonce)];
      const pr = buildClaimMenu(msg.author.id, nonce, d2, w2);
      if (pr) newRows.unshift(pr);
      await sent.edit({ embeds: [buildEmbed(u2, d2, w2)], components: newRows }).catch(() => {});
    };

    selCollector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
      const cid = String(i.customId || "");
      if (cid !== `quest_pick_${msg.author.id}_${nonce}`) return i.reply({ content: "⚠️ Session đã hết hạn.", ephemeral: true });
      await i.deferUpdate();

      const val = String(i.values?.[0] || "");
      const [scope, questId] = val.split(":");
      if (!scope || !questId) return;

      const users2 = loadUsers();
      const u2 = users2[msg.author.id];
      if (!u2) return i.followUp({ content: "❌ Bạn chưa có nhân vật.", ephemeral: true });
      ensureQuestState(u2, Date.now());

      if (!canClaim(u2, scope, questId, Date.now())) {
        users2[msg.author.id] = u2;
        saveUsers(users2);
        await refresh();
        return i.followUp({ content: "⚠️ Nhiệm vụ chưa đủ điều kiện hoặc đã nhận.", ephemeral: true });
      }

      const res = claim(u2, scope, questId, Date.now());
      users2[msg.author.id] = u2;
      saveUsers(users2);
      await refresh();
      if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });
      return i.followUp({ content: `✅ Nhận thưởng: **+${fmtLT(res.rewardLt)} LT**`, ephemeral: true });
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải bảng của bạn.", ephemeral: true });
      const cid = String(i.customId || "");
      if (!cid.endsWith(`_${nonce}`)) return i.reply({ content: "⚠️ Session đã hết hạn.", ephemeral: true });

      if (cid.startsWith("quest_close_")) {
        await i.deferUpdate();
        collector.stop("close");
        selCollector.stop("close");
        return sent.edit({ components: [] }).catch(() => {});
      }

      if (cid.startsWith("quest_claimall_")) {
        await i.deferUpdate();

        const users2 = loadUsers();
        const u2 = users2[msg.author.id];
        if (!u2) return i.followUp({ content: "❌ Bạn chưa có nhân vật.", ephemeral: true });
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
        if (count <= 0) return i.followUp({ content: "⚠️ Không có nhiệm vụ nào có thể nhận.", ephemeral: true });
        return i.followUp({ content: `✅ Nhận **${count}** nhiệm vụ: **+${fmtLT(total)} LT**`, ephemeral: true });
      }
    });

    const endAll = () => sent.edit({ components: [] }).catch(() => {});
    collector.on("end", endAll);
    selCollector.on("end", endAll);
  },
};
