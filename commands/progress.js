const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { ensureQuestState, getQuestProgress, canClaim, claim } = require("../utils/questSystem");
const { ACHIEVEMENTS, ensureAchv } = require("../utils/achievementSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function renderScopeLines(list) {
  return (list || []).map((q) => {
    const st = q.claimed ? "✅ Đã nhận" : q.done ? "🎁 Có thể nhận" : "⏳ Đang làm";
    return `• **${q.name}** — ${q.progress}/${q.target} • +${fmtLT(q.rewardLt)} LT • ${st}`;
  }).join("\n");
}

function countClaimable(list) {
  return (list || []).filter((q) => q.done && !q.claimed).length;
}

function buildQuestEmbed(user, daily, weekly) {
  return new EmbedBuilder()
    .setTitle("🧭 Sổ Nhiệm Vụ")
    .setColor(0x3498db)
    .setDescription(
      `Linh thạch hiện có: **${fmtLT(user.lt)}** 💎\n` +
      `Có thể nhận: **${countClaimable(daily)}** nhiệm vụ ngày • **${countClaimable(weekly)}** nhiệm vụ tuần.`
    )
    .addFields(
      { name: "📅 Mục tiêu trong ngày", value: renderScopeLines(daily) || "(Trống)" },
      { name: "🗓️ Mục tiêu trong tuần", value: renderScopeLines(weekly) || "(Trống)" }
    )
    .setFooter({ text: "Thưởng nhiệm vụ hiện chỉ cộng linh thạch." });
}

function buildClaimMenu(userId, nonce, daily, weekly) {
  const options = [];
  for (const q of daily) {
    if (q.done && !q.claimed) options.push({ label: `Ngày: ${q.name}`.slice(0, 100), value: `daily:${q.id}`, description: `+${fmtLT(q.rewardLt)} LT`.slice(0, 100) });
  }
  for (const q of weekly) {
    if (q.done && !q.claimed) options.push({ label: `Tuần: ${q.name}`.slice(0, 100), value: `weekly:${q.id}`, description: `+${fmtLT(q.rewardLt)} LT`.slice(0, 100) });
  }
  if (!options.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`quest_pick_${userId}_${nonce}`).setPlaceholder("Chọn mục tiêu để lĩnh thưởng...").addOptions(options.slice(0, 25))
  );
}

function buildQuestButtons(userId, nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quest_claimall_${userId}_${nonce}`).setLabel("Lĩnh hết").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`quest_close_${userId}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary)
  );
}

const quest = {
  name: "quest",
  aliases: ["q"],
  run: async (_client, msg) => {
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
      return { u2, daily, weekly };
    };
    const buildRows = (daily, weekly) => {
      const rows = [buildQuestButtons(msg.author.id, nonce)];
      const pick = buildClaimMenu(msg.author.id, nonce, daily, weekly);
      if (pick) rows.unshift(pick);
      return rows;
    };
    const s0 = readState();
    if (!s0) return msg.reply("❌ Đạo hữu chưa nhập đạo.");
    const sent = await msg.reply({ embeds: [buildQuestEmbed(s0.u2, s0.daily, s0.weekly)], components: buildRows(s0.daily, s0.weekly) });
    const refresh = async () => {
      const s = readState();
      if (s) await sent.edit({ embeds: [buildQuestEmbed(s.u2, s.daily, s.weekly)], components: buildRows(s.daily, s.weekly) }).catch(() => {});
    };
    const col = sent.createMessageComponentCollector({ time: 120_000 });

    col.on("collect", async (i) => {
      try {
        if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải bảng nhiệm vụ của đạo hữu.", ephemeral: true });
        const cid = String(i.customId || "");
        if (i.isButton() && cid === `quest_close_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();
          col.stop("close");
          return sent.edit({ components: [] }).catch(() => {});
        }
        if (i.isButton() && cid === `quest_claimall_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();
          const users2 = loadUsers();
          const u2 = users2[msg.author.id];
          if (!u2) return i.followUp({ content: "❌ Đạo hữu chưa nhập đạo.", ephemeral: true });
          ensureQuestState(u2, Date.now());
          let total = 0;
          let count = 0;
          for (const scope of ["daily", "weekly"]) {
            for (const q of getQuestProgress(u2, scope, Date.now())) {
              if (!q.done || q.claimed) continue;
              const res = claim(u2, scope, q.id, Date.now());
              if (res.ok) { total += Number(res.rewardLt) || 0; count++; }
            }
          }
          users2[msg.author.id] = u2;
          saveUsers(users2);
          await refresh();
          return i.followUp({ content: count > 0 ? `✅ Đã lĩnh **${count}** mục tiêu: **+${fmtLT(total)} LT**` : "⚠️ Hiện chưa có mục tiêu nào đủ điều kiện lĩnh thưởng.", ephemeral: true });
        }
        if (i.isStringSelectMenu() && cid === `quest_pick_${msg.author.id}_${nonce}`) {
          await i.deferUpdate();
          const [scope, questId] = String(i.values?.[0] || "").split(":");
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
          return i.followUp({ content: res.ok ? `✅ Đã lĩnh thưởng: **+${fmtLT(res.rewardLt)} LT**` : `❌ ${res.message}`, ephemeral: true });
        }
      } catch {
        try { if (!i.deferred && !i.replied) await i.deferUpdate(); } catch {}
      }
    });
    col.on("end", async () => sent.edit({ components: [] }).catch(() => {}));
  },
};

const GROUP_META = {
  all: { label: "📜 Tất cả", value: "all" },
  fish: { label: "🎣 Câu cá", value: "fish" },
  mine: { label: "⛏️ Khai khoáng", value: "mine" },
  dungeon: { label: "🏯 Dungeon", value: "dungeon" },
  boss: { label: "🐲 World Boss", value: "boss" },
  enhance: { label: "⚒️ Cường hoá", value: "enhance" },
  economy: { label: "💰 Kinh tế", value: "economy" },
  titles: { label: "🎖 Danh hiệu", value: "titles" },
};
function getStat(user, key) { return Math.max(0, Math.floor(Number(user?.achvStats?.[key]) || 0)); }
function groupLabel(group) { return (GROUP_META[group] || GROUP_META.all).label; }
function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function buildAchvLine(u, a) {
  const cur = getStat(u, a.stat);
  const done = Boolean(u.achievements?.[a.id]) || cur >= a.need;
  return `${done ? "✅" : "⏳"} **${a.title}** — ${a.need > 1 ? `${cur}/${a.need}` : done ? "1/1" : "0/1"}\n_${a.desc}_`;
}

const thanhtuu = {
  name: "thanhtuu",
  aliases: ["tt", "achievement", "ach"],
  run: async (_client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    ensureAchv(u);
    users[msg.author.id] = u;
    saveUsers(users);

    const userId = msg.author.id;
    const nonce = Math.random().toString(36).slice(2, 8);
    let group = "all";
    let page = 0;

    const buildEmbed = () => {
      const base = new EmbedBuilder().setTitle("🏅 Thành Tựu").setColor(0xF1C40F)
        .setDescription(`Linh thạch: **${fmtLT(u.lt)}** 💎\nDanh hiệu đang dùng: **${u.title || "(chưa chọn)"}**\nMục: **${groupLabel(group)}**`);
      if (group === "titles") {
        const pages = chunk(Array.isArray(u.titles) ? u.titles : [], 20);
        const totalPages = Math.max(1, pages.length);
        page = Math.max(0, Math.min(page, totalPages - 1));
        base.addFields({ name: `🎖 Danh hiệu đã mở (trang ${page + 1}/${totalPages})`, value: (pages[page] || []).map((t) => `• ${t}`).join("\n").slice(0, 1024) || "(Chưa có)" });
        base.setFooter({ text: "Dùng -danhhieu để chọn danh hiệu đang dùng." });
        return { embed: base, totalPages };
      }
      const filtered = group === "all" ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.group === group);
      const pages = chunk(filtered, 5);
      const totalPages = Math.max(1, pages.length);
      page = Math.max(0, Math.min(page, totalPages - 1));
      base.addFields({ name: `📌 Cột mốc (trang ${page + 1}/${totalPages})`, value: (pages[page] || []).map((a) => buildAchvLine(u, a)).join("\n\n").slice(0, 1024) || "(Trống)" });
      base.setFooter({ text: "Dùng -danhhieu để chọn danh hiệu đang dùng." });
      return { embed: base, totalPages };
    };

    const buildRows = (totalPages) => {
      const menu = new StringSelectMenuBuilder().setCustomId(`achv_cat_${userId}_${nonce}`).setPlaceholder("Chọn một khu vực...")
        .addOptions([...Object.values(GROUP_META).filter((x) => x.value !== "all"), GROUP_META.all].map((x) => ({ label: x.label, value: x.value })));
      return [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`achv_prev_${userId}_${nonce}`).setStyle(ButtonStyle.Secondary).setLabel("◀").setDisabled(page <= 0),
          new ButtonBuilder().setCustomId(`achv_next_${userId}_${nonce}`).setStyle(ButtonStyle.Secondary).setLabel("▶").setDisabled(page >= Math.max(0, totalPages - 1)),
          new ButtonBuilder().setCustomId(`achv_close_${userId}_${nonce}`).setStyle(ButtonStyle.Danger).setLabel("Đóng")
        ),
      ];
    };

    const first = buildEmbed();
    const sent = await msg.reply({ embeds: [first.embed], components: buildRows(first.totalPages) });
    const col = sent.createMessageComponentCollector({ time: 120_000 });
    const refresh = async () => {
      const users2 = loadUsers();
      const u2 = users2[userId];
      if (!u2) return;
      ensureAchv(u2);
      users2[userId] = u2;
      saveUsers(users2);
      Object.assign(u, { lt: u2.lt, title: u2.title, titles: u2.titles, achvStats: u2.achvStats, achievements: u2.achievements });
      const res = buildEmbed();
      await sent.edit({ embeds: [res.embed], components: buildRows(res.totalPages) }).catch(() => {});
    };
    col.on("collect", async (i) => {
      try {
        if (i.user.id !== userId) return i.reply({ content: "❌ Đây không phải bảng thành tựu của đạo hữu.", ephemeral: true });
        const cid = String(i.customId || "");
        if (i.isStringSelectMenu() && cid === `achv_cat_${userId}_${nonce}`) {
          await i.deferUpdate();
          const v = String(i.values?.[0] || "all");
          group = GROUP_META[v] ? v : "all";
          page = 0;
          return refresh();
        }
        if (i.isButton() && cid === `achv_prev_${userId}_${nonce}`) { await i.deferUpdate(); page = Math.max(0, page - 1); return refresh(); }
        if (i.isButton() && cid === `achv_next_${userId}_${nonce}`) { await i.deferUpdate(); page += 1; return refresh(); }
        if (i.isButton() && cid === `achv_close_${userId}_${nonce}`) { await i.deferUpdate(); col.stop("close"); return sent.edit({ components: [] }).catch(() => {}); }
      } catch { try { if (!i.deferred && !i.replied) await i.deferUpdate(); } catch {} }
    });
    col.on("end", async () => sent.edit({ components: [] }).catch(() => {}));
  },
};

module.exports = [quest, thanhtuu];
