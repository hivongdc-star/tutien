const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");

// ==================================================
// QUEST ENGINE
// ==================================================
function pad2(n) { return String(n).padStart(2, "0"); }
function getDailyKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function getISOWeekKey(now = Date.now()) {
  const d = new Date(now);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${year}-W${pad2(weekNo)}`;
}

const DAILY_QUESTS = [
  { id: "D_FISH_15", scope: "daily", event: "fish", target: 15, rewardLt: 160, name: "Ngư Tâm Nhập Đạo", desc: "Thả câu 15 lần — dưỡng linh khí, nuôi linh thú." },
  { id: "D_MINE_10", scope: "daily", event: "mine", target: 10, rewardLt: 180, name: "Khai Mạch Trảm Thạch", desc: "Đào khoáng 10 lần — mở đường mạch trong lòng đất." },
  { id: "D_DG_8", scope: "daily", event: "dungeon_floor", target: 8, rewardLt: 220, name: "Hạ Sơn Luyện Kiếp", desc: "Vượt 8 tầng động phủ — mỗi tầng là một kiếp." },
  { id: "D_BOSS_20K", scope: "daily", event: "boss_damage", target: 20000, rewardLt: 260, name: "Ma Uyên Thí Luyện", desc: "Gây 20.000 sát thương lên World Boss." },
];
const WEEKLY_QUESTS = [
  { id: "W_FISH_200", scope: "weekly", event: "fish", target: 200, rewardLt: 1800, name: "Ngư Hải Đạo Lộ", desc: "Câu cá 200 lần — bền tâm như nước, đắc đạo từ câu." },
  { id: "W_MINE_120", scope: "weekly", event: "mine", target: 120, rewardLt: 2200, name: "Khoáng Mạch Trấn Tông", desc: "Đào khoáng 120 lần — mở khoáng mạch, dựng nền tông môn." },
  { id: "W_DG_60", scope: "weekly", event: "dungeon_floor", target: 60, rewardLt: 2800, name: "Thập Tầng Vô Hồi", desc: "Vượt 60 tầng động phủ — vào rồi khó quay đầu." },
  { id: "W_BOSS_200K", scope: "weekly", event: "boss_damage", target: 200000, rewardLt: 2400, name: "Chung Diệt Ma Uyên", desc: "Gây 200.000 sát thương lên World Boss — hợp lực trừ ma." },
];

function questDefs(scope) { return scope === "weekly" ? WEEKLY_QUESTS : DAILY_QUESTS; }
function ensureQuestScope(scopeState, key, defs) {
  if (scopeState.key !== key || !scopeState.items || typeof scopeState.items !== "object") {
    scopeState.key = key;
    scopeState.items = Object.fromEntries(defs.map((q) => [q.id, { progress: 0, claimed: false }]));
    return;
  }
  for (const q of defs) {
    if (!scopeState.items[q.id]) scopeState.items[q.id] = { progress: 0, claimed: false };
    const it = scopeState.items[q.id];
    it.progress = Math.max(0, Math.floor(Number(it.progress) || 0));
    it.claimed = Boolean(it.claimed);
  }
}
function ensureQuestState(user, now = Date.now()) {
  if (!user) return null;
  user.quests = user.quests && typeof user.quests === "object" ? user.quests : {};
  user.quests.daily = user.quests.daily && typeof user.quests.daily === "object" ? user.quests.daily : {};
  user.quests.weekly = user.quests.weekly && typeof user.quests.weekly === "object" ? user.quests.weekly : {};
  ensureQuestScope(user.quests.daily, getDailyKey(now), DAILY_QUESTS);
  ensureQuestScope(user.quests.weekly, getISOWeekKey(now), WEEKLY_QUESTS);
  return user;
}
function recordQuestEvent(user, event, amount = 1, now = Date.now()) {
  if (!user) return false;
  ensureQuestState(user, now);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add) return false;
  let changed = false;
  for (const scope of ["daily", "weekly"]) {
    const st = user.quests[scope];
    for (const q of questDefs(scope)) {
      if (q.event !== event) continue;
      const it = st.items[q.id];
      if (!it || it.claimed) continue;
      const next = Math.min(q.target, (Number(it.progress) || 0) + add);
      if (next !== it.progress) { it.progress = next; changed = true; }
    }
  }
  return changed;
}
function getQuestProgress(user, scope, now = Date.now()) {
  ensureQuestState(user, now);
  const items = user.quests?.[scope]?.items || {};
  return questDefs(scope).map((q) => {
    const it = items[q.id] || { progress: 0, claimed: false };
    const progress = Math.min(q.target, Math.max(0, Math.floor(Number(it.progress) || 0)));
    return { ...q, progress, claimed: Boolean(it.claimed), done: progress >= q.target };
  });
}
function canClaim(user, scope, questId, now = Date.now()) {
  const q = getQuestProgress(user, scope, now).find((x) => x.id === questId);
  return Boolean(q && q.done && !q.claimed);
}
function claim(user, scope, questId, now = Date.now()) {
  if (!user) return { ok: false, message: "❌ Không có user." };
  ensureQuestState(user, now);
  const q = questDefs(scope).find((x) => x.id === questId);
  if (!q) return { ok: false, message: "❌ Nhiệm vụ không hợp lệ." };
  const it = user.quests[scope].items[questId] || (user.quests[scope].items[questId] = { progress: 0, claimed: false });
  if (it.claimed) return { ok: false, message: "⚠️ Đạo hữu đã nhận thưởng nhiệm vụ này rồi." };
  if ((Number(it.progress) || 0) < q.target) return { ok: false, message: "❌ Chưa hoàn thành nhiệm vụ." };
  it.claimed = true;
  user.lt = (Number(user.lt) || 0) + q.rewardLt;
  return { ok: true, rewardLt: q.rewardLt };
}

// ==================================================
// ACHIEVEMENT ENGINE
// ==================================================
const ACHIEVEMENTS = [
  { id: "A_FISH_1000", stat: "fish", need: 1000, title: "Ngư Vương", desc: "Câu cá 1.000 lần — ngư tâm bất loạn, thủy đạo tự khai.", group: "fish" },
  { id: "A_FISH_2000", stat: "fish", need: 2000, title: "Ngư Thống", desc: "Câu cá 2.000 lần — một cần định sóng, bầy cá quy phục.", group: "fish" },
  { id: "A_FISH_10000", stat: "fish", need: 10000, title: "Ngư Thánh", desc: "Câu cá 10.000 lần — thủy vực nghe danh, linh ngư tự đến.", group: "fish" },
  { id: "A_FISH_50000", stat: "fish", need: 50000, title: "Ngư Tiên", desc: "Câu cá 50.000 lần — một niệm thông thiên, vạn thủy triều bái.", group: "fish" },
  { id: "A_MINE_500", stat: "mine", need: 500, title: "Khoáng Sư", desc: "Đào khoáng 500 lần — khai mạch lập công.", group: "mine" },
  { id: "A_MINE_2500", stat: "mine", need: 2500, title: "Khoáng Tướng", desc: "Đào khoáng 2.500 lần — một búa định mạch, địa khí tụ về.", group: "mine" },
  { id: "A_MINE_10000", stat: "mine", need: 10000, title: "Khoáng Tổ", desc: "Đào khoáng 10.000 lần — mở khoáng mạch, dựng nền tông môn.", group: "mine" },
  { id: "A_MINE_50000", stat: "mine", need: 50000, title: "Khoáng Đế", desc: "Đào khoáng 50.000 lần — địa mạch cúi đầu, thạch linh xưng thần.", group: "mine" },
  { id: "A_DG_100", stat: "dungeonFloor", need: 100, title: "Động Chủ", desc: "Thông quan 100 tầng — vào động phủ như về nhà.", group: "dungeon" },
  { id: "A_DG_500", stat: "dungeonFloor", need: 500, title: "Kiếp Đồ", desc: "Thông quan 500 tầng — mỗi tầng một kiếp, tâm không động.", group: "dungeon" },
  { id: "A_DG_2000", stat: "dungeonFloor", need: 2000, title: "Kiếp Chủ", desc: "Thông quan 2.000 tầng — kiếp nạn tới, ngươi định kiếp.", group: "dungeon" },
  { id: "A_DG_10000", stat: "dungeonFloor", need: 10000, title: "Vạn Kiếp Bất Tử", desc: "Thông quan 10.000 tầng — vạn kiếp không rã, thân tâm như sắt.", group: "dungeon" },
  { id: "A_BOSS_500K", stat: "bossDamage", need: 500000, title: "Diệt Thú", desc: "Tổng sát thương World Boss 500.000 — một đao trấn hung.", group: "boss" },
  { id: "A_BOSS_2M", stat: "bossDamage", need: 2000000, title: "Ma Uyên Sát", desc: "Tổng sát thương World Boss 2.000.000 — máu ma nhuộm áo.", group: "boss" },
  { id: "A_BOSS_10M", stat: "bossDamage", need: 10000000, title: "Ma Uyên Kẻ Chém", desc: "Tổng sát thương World Boss 10.000.000 — một chém định thiên uy.", group: "boss" },
  { id: "A_BOSS_RANK1", stat: "bossRank1", need: 1, title: "Đệ Nhất Trảm Ma", desc: "Đạt Top #1 đóng góp World Boss trong một tuần.", group: "boss" },
  { id: "A_ENH_PLUS5", stat: "enhPlus5", need: 1, title: "Linh Khí Sơ Thành", desc: "Cường hoá bất kỳ trang bị lên +5 — linh khí bắt đầu tụ.", group: "enhance" },
  { id: "A_ENH_PLUS10", stat: "enhPlus10", need: 1, title: "Rèn Thần", desc: "Cường hóa bất kỳ trang bị lên +10.", group: "enhance" },
  { id: "A_ENH_PLUS15", stat: "enhPlus15", need: 1, title: "Rèn Tiên", desc: "Cường hóa bất kỳ trang bị lên +15.", group: "enhance" },
  { id: "A_ENH_FAIL_50", stat: "enhFail", need: 50, title: "Bại Mà Không Nản", desc: "Thất bại cường hoá 50 lần — bại để luyện tâm.", group: "enhance" },
  { id: "A_ENH_FAIL_200", stat: "enhFail", need: 200, title: "Kiếp Hỏa Tôi Luyện", desc: "Thất bại cường hoá 200 lần — kiếp hỏa rèn xương.", group: "enhance" },
  { id: "A_SELL_ORE_500", stat: "oreSold", need: 500, title: "Tán Tài Luyện Đạo", desc: "Bán tổng 500 viên khoáng — tán tài để đổi đại đạo.", group: "economy" },
  { id: "A_SELL_ORE_5000", stat: "oreSold", need: 5000, title: "Đổi Đá Luyện Tâm", desc: "Bán tổng 5.000 viên khoáng — đá đi, tâm sáng.", group: "economy" },
  { id: "A_SELL_GEAR_50", stat: "gearSold", need: 50, title: "Phế Binh Tái Tạo", desc: "Bán 50 món trang bị — bỏ cũ lập mới, đạo lộ thông suốt.", group: "economy" },
];
const ACHV_KEYS = ["fish", "mine", "dungeonFloor", "bossDamage", "bossRank1", "enhPlus5", "enhPlus10", "enhPlus15", "enhFail", "oreSold", "gearSold"];
function ensureAchv(user) {
  if (!user) return null;
  user.achvStats = user.achvStats && typeof user.achvStats === "object" ? user.achvStats : {};
  user.achievements = user.achievements && typeof user.achievements === "object" ? user.achievements : {};
  if (!Array.isArray(user.titles)) user.titles = [];
  for (const key of ACHV_KEYS) user.achvStats[key] = Math.max(0, Math.floor(Number(user.achvStats[key]) || 0));
  return user;
}
function checkUnlocks(user) {
  ensureAchv(user);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (user.achievements[a.id] || user.achvStats[a.stat] < a.need) continue;
    user.achievements[a.id] = true;
    if (!user.titles.includes(a.title)) { user.titles.push(a.title); unlocked.push(a.title); }
  }
  return unlocked;
}
function recordAchievementEvent(user, event, amount = 1) {
  ensureAchv(user);
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add) return [];
  const addMap = { fish: "fish", mine: "mine", dungeon_floor: "dungeonFloor", boss_damage: "bossDamage", boss_rank1: "bossRank1", enhance_fail: "enhFail", sell_ore: "oreSold", sell_gear: "gearSold" };
  if (addMap[event]) user.achvStats[addMap[event]] += add;
  if (event === "enh_plus5") user.achvStats.enhPlus5 = Math.max(1, user.achvStats.enhPlus5);
  if (event === "enh_plus10") user.achvStats.enhPlus10 = Math.max(1, user.achvStats.enhPlus10);
  if (event === "enh_plus15") user.achvStats.enhPlus15 = Math.max(1, user.achvStats.enhPlus15);
  // legacy spelling used by old bag.js
  if (event === "enh_fail") user.achvStats.enhFail += add;
  return checkUnlocks(user);
}

// ==================================================
// QUEST UI
// ==================================================
function fmtLT(n) { return Number(n || 0).toLocaleString("vi-VN"); }
function renderScopeLines(list) {
  return (list || []).map((q) => `• **${q.name}** — ${q.progress}/${q.target} • +${fmtLT(q.rewardLt)} LT • ${q.claimed ? "✅ Đã nhận" : q.done ? "🎁 Có thể nhận" : "⏳ Đang làm"}`).join("\n");
}
function buildQuestEmbed(user, daily, weekly) {
  const count = (list) => list.filter((q) => q.done && !q.claimed).length;
  return new EmbedBuilder().setTitle("🧭 Sổ Nhiệm Vụ").setColor(0x3498db)
    .setDescription(`Linh thạch hiện có: **${fmtLT(user.lt)}** 💎\nCó thể nhận: **${count(daily)}** nhiệm vụ ngày • **${count(weekly)}** nhiệm vụ tuần.`)
    .addFields(
      { name: "📅 Mục tiêu trong ngày", value: renderScopeLines(daily) || "(Trống)" },
      { name: "🗓️ Mục tiêu trong tuần", value: renderScopeLines(weekly) || "(Trống)" }
    );
}
function buildQuestRows(userId, nonce, daily, weekly) {
  const options = [];
  for (const q of [...daily.map((x) => ({ ...x, s: "daily" })), ...weekly.map((x) => ({ ...x, s: "weekly" }))]) {
    if (q.done && !q.claimed) options.push({ label: `${q.s === "daily" ? "Ngày" : "Tuần"}: ${q.name}`.slice(0, 100), value: `${q.s}:${q.id}`, description: `+${fmtLT(q.rewardLt)} LT` });
  }
  const rows = [];
  if (options.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`quest_pick_${userId}_${nonce}`).setPlaceholder("Chọn mục tiêu để lĩnh thưởng...").addOptions(options.slice(0, 25))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quest_claimall_${userId}_${nonce}`).setLabel("Lĩnh hết").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`quest_close_${userId}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

const quest = {
  name: "quest", aliases: ["q"],
  run: async (_client, msg) => {
    const users = loadUsers();
    if (!users[msg.author.id]) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    const nonce = Math.random().toString(36).slice(2, 8);
    const readState = () => {
      const all = loadUsers();
      const u = all[msg.author.id];
      if (!u) return null;
      ensureQuestState(u);
      const daily = getQuestProgress(u, "daily");
      const weekly = getQuestProgress(u, "weekly");
      all[msg.author.id] = u; saveUsers(all);
      return { u, daily, weekly };
    };
    const initial = readState();
    const sent = await msg.reply({ embeds: [buildQuestEmbed(initial.u, initial.daily, initial.weekly)], components: buildQuestRows(msg.author.id, nonce, initial.daily, initial.weekly) });
    const refresh = async () => {
      const s = readState();
      if (s) await sent.edit({ embeds: [buildQuestEmbed(s.u, s.daily, s.weekly)], components: buildQuestRows(msg.author.id, nonce, s.daily, s.weekly) }).catch(() => {});
    };
    const col = sent.createMessageComponentCollector({ time: 120_000 });
    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải bảng nhiệm vụ của đạo hữu.", ephemeral: true });
      const cid = String(i.customId || "");
      if (cid === `quest_close_${msg.author.id}_${nonce}`) { await i.deferUpdate(); col.stop(); return sent.edit({ components: [] }).catch(() => {}); }
      if (cid === `quest_claimall_${msg.author.id}_${nonce}`) {
        await i.deferUpdate();
        const all = loadUsers(); const u = all[msg.author.id]; ensureQuestState(u);
        let total = 0, count = 0;
        for (const scope of ["daily", "weekly"]) for (const q of getQuestProgress(u, scope)) if (q.done && !q.claimed) {
          const res = claim(u, scope, q.id); if (res.ok) { total += res.rewardLt; count++; }
        }
        all[msg.author.id] = u; saveUsers(all); await refresh();
        return i.followUp({ content: count ? `✅ Đã lĩnh **${count}** mục tiêu: **+${fmtLT(total)} LT**` : "⚠️ Chưa có mục tiêu nào để nhận.", ephemeral: true });
      }
      if (i.isStringSelectMenu() && cid === `quest_pick_${msg.author.id}_${nonce}`) {
        await i.deferUpdate();
        const [scope, id] = String(i.values?.[0] || "").split(":");
        const all = loadUsers(); const u = all[msg.author.id]; ensureQuestState(u);
        const res = canClaim(u, scope, id) ? claim(u, scope, id) : { ok: false, message: "Mục tiêu chưa hoàn thành hoặc đã nhận." };
        all[msg.author.id] = u; saveUsers(all); await refresh();
        return i.followUp({ content: res.ok ? `✅ +${fmtLT(res.rewardLt)} LT` : `⚠️ ${res.message}`, ephemeral: true });
      }
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};

// ==================================================
// ACHIEVEMENT UI
// ==================================================
const GROUP_META = {
  all: "📜 Tất cả", fish: "🎣 Câu cá", mine: "⛏️ Khai khoáng", dungeon: "🏯 Dungeon",
  boss: "🐲 World Boss", enhance: "⚒️ Cường hoá", economy: "💰 Kinh tế", titles: "🎖 Danh hiệu",
};
function chunks(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
const thanhtuu = {
  name: "thanhtuu", aliases: ["tt", "achievement", "ach"],
  run: async (_client, msg) => {
    let all = loadUsers();
    const u = all[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    ensureAchv(u); all[msg.author.id] = u; saveUsers(all);
    const nonce = Math.random().toString(36).slice(2, 8);
    let group = "all", page = 0;

    const build = () => {
      const base = new EmbedBuilder().setTitle("🏅 Thành Tựu").setColor(0xF1C40F)
        .setDescription(`Danh hiệu đang dùng: **${u.title || "(chưa chọn)"}**\nMục: **${GROUP_META[group]}**`);
      const source = group === "titles" ? (u.titles || []).map((x) => ({ text: `• ${x}` })) : (group === "all" ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.group === group)).map((a) => {
        const cur = Math.max(0, Number(u.achvStats?.[a.stat]) || 0); const done = !!u.achievements?.[a.id] || cur >= a.need;
        return { text: `${done ? "✅" : "⏳"} **${a.title}** — ${Math.min(cur, a.need)}/${a.need}\n_${a.desc}_` };
      });
      const pages = chunks(source, group === "titles" ? 20 : 5); const total = Math.max(1, pages.length); page = Math.max(0, Math.min(page, total - 1));
      base.addFields({ name: `Trang ${page + 1}/${total}`, value: (pages[page] || []).map((x) => x.text).join("\n\n").slice(0, 1024) || "(Trống)" });
      const menu = new StringSelectMenuBuilder().setCustomId(`achv_cat_${msg.author.id}_${nonce}`).setPlaceholder("Chọn mục...")
        .addOptions(Object.entries(GROUP_META).map(([value, label]) => ({ value, label })));
      const rows = [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`achv_prev_${msg.author.id}_${nonce}`).setLabel("◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
        new ButtonBuilder().setCustomId(`achv_next_${msg.author.id}_${nonce}`).setLabel("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= total - 1),
        new ButtonBuilder().setCustomId(`achv_close_${msg.author.id}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Danger)
      )];
      return { base, rows };
    };
    let view = build();
    const sent = await msg.reply({ embeds: [view.base], components: view.rows });
    const col = sent.createMessageComponentCollector({ time: 120_000 });
    const refresh = async () => { all = loadUsers(); Object.assign(u, all[msg.author.id] || {}); ensureAchv(u); view = build(); await sent.edit({ embeds: [view.base], components: view.rows }).catch(() => {}); };
    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải bảng thành tựu của đạo hữu.", ephemeral: true });
      await i.deferUpdate(); const cid = String(i.customId || "");
      if (i.isStringSelectMenu() && cid.startsWith("achv_cat_")) { group = i.values[0] || "all"; page = 0; return refresh(); }
      if (cid.startsWith("achv_prev_")) { page--; return refresh(); }
      if (cid.startsWith("achv_next_")) { page++; return refresh(); }
      if (cid.startsWith("achv_close_")) { col.stop(); return sent.edit({ components: [] }).catch(() => {}); }
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};

module.exports = {
  commands: [quest, thanhtuu],
  DAILY_QUESTS,
  WEEKLY_QUESTS,
  ACHIEVEMENTS,
  ensureQuestState,
  getQuestProgress,
  canClaim,
  claim,
  recordQuestEvent,
  ensureAchv,
  checkUnlocks,
  recordAchievementEvent,
};
