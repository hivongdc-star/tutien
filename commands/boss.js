const fs = require("fs");
const path = require("path");
const { randomInt } = require("crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { computeEffective } = require("./dungeon");
const elements = require("../utils/element");
const { loadOreDB } = require("../utils/mining");
const { createGearFromOres, formatGearLines } = require("../utils/forge");
const { getISOWeekKey, recordQuestEvent, recordAchievementEvent } = require("./progress");

// ==================================================
// WORLD BOSS ENGINE
// ==================================================
const DATA_PATH = path.join(__dirname, "../data/worldboss.json");
const ATTACK_COOLDOWN_MS = 60_000;

function clampInt(n, min, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return min;
  return typeof max === "number" ? Math.max(min, Math.min(max, x)) : Math.max(min, x);
}
function progressBar(current, max, width = 18) {
  const ratio = Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(max) || 1)));
  const filled = Math.round(ratio * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}
function loadBossState() {
  try { return JSON.parse(fs.readFileSync(DATA_PATH, "utf8")); }
  catch { return { version: 1 }; }
}
function saveBossState(state) {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2)); } catch {}
}
function pickBossName() {
  const pool = ["Huyết Linh Vương", "Hắc Vực Cự Thú", "U Minh Ma Long", "Thiên Ngoại Dị Thú", "Cổ Ấn Hung Thú", "Tà Ảnh Ma Vương"];
  return pool[randomInt(0, pool.length)];
}
function pickBossElement() {
  const list = Object.keys(elements.display || {}).length ? Object.keys(elements.display) : ["kim", "moc", "thuy", "hoa", "tho"];
  return list[randomInt(0, list.length)];
}
function computeMaxHpByPopulation(users) {
  const n = Object.values(users || {}).filter((u) => u && (Number(u.level) || 0) > 0).length;
  return clampInt(800_000 + n * 120_000, 800_000, 6_000_000);
}
function ensureBoss(users, now = Date.now()) {
  const state = loadBossState();
  const weekKey = getISOWeekKey(now);
  if (!state.boss || state.weekKey !== weekKey) {
    const maxHp = computeMaxHpByPopulation(users);
    state.weekKey = weekKey;
    state.boss = {
      name: pickBossName(), element: pickBossElement(), maxHp, hp: maxHp, createdAt: now, killedAt: null,
      contributions: {}, claimed: {}, redDrops: {}, redDropTotal: 0, redDropsComputedAt: null,
    };
    saveBossState(state);
  }
  const b = state.boss;
  b.maxHp = clampInt(b.maxHp, 1, 20_000_000);
  b.hp = clampInt(b.hp, 0, b.maxHp);
  b.contributions = b.contributions && typeof b.contributions === "object" ? b.contributions : {};
  b.claimed = b.claimed && typeof b.claimed === "object" ? b.claimed : {};
  b.redDrops = b.redDrops && typeof b.redDrops === "object" ? b.redDrops : {};
  b.redDropTotal = clampInt(b.redDropTotal, 0, 10_000);
  return state;
}
function topContributors(boss, users, limit = 5) {
  return Object.entries(boss.contributions || {})
    .map(([uid, dmg]) => ({ uid, dmg: Math.max(0, Number(dmg) || 0) }))
    .filter((x) => x.dmg > 0).sort((a, b) => b.dmg - a.dmg).slice(0, limit)
    .map((x, i) => ({ rank: i + 1, uid: x.uid, name: users?.[x.uid]?.name || `@${x.uid}`, dmg: x.dmg }));
}
function computeRewardPoolLt(boss) {
  return clampInt(Math.round((Number(boss.maxHp) || 0) / 10), 50_000, 2_000_000);
}
function computeRewardForUser(boss, userId) {
  const dmg = Math.max(0, Number(boss.contributions?.[userId]) || 0);
  const total = Object.values(boss.contributions || {}).reduce((a, v) => a + Math.max(0, Number(v) || 0), 0);
  if (dmg <= 0 || total <= 0) return { dmg, total, lt: 0, bonus: 0, rank: null };
  const pool = computeRewardPoolLt(boss);
  const share = Math.floor((pool * dmg) / total);
  const sorted = Object.entries(boss.contributions).map(([uid, d]) => ({ uid, dmg: Number(d) || 0 })).sort((a, b) => b.dmg - a.dmg);
  const idx = sorted.findIndex((x) => x.uid === userId);
  const rank = idx >= 0 ? idx + 1 : null;
  const bonus = rank === 1 ? Math.round(pool * 0.25) : rank === 2 ? Math.round(pool * 0.15) : rank === 3 ? Math.round(pool * 0.08) : 0;
  return { dmg, total, lt: Math.max(0, share + bonus), bonus, rank };
}
function computeRedDrops(boss) {
  if (!boss || boss.redDropsComputedAt) return;
  const entries = Object.entries(boss.contributions || {}).map(([uid, dmg]) => ({ uid, dmg: Math.max(0, Number(dmg) || 0) })).filter((x) => x.dmg > 0);
  const totalDrops = clampInt(Math.round(4 + Math.sqrt(entries.length)), 5, 25);
  boss.redDropTotal = totalDrops;
  boss.redDrops = {};
  const totalDmg = entries.reduce((a, x) => a + x.dmg, 0);
  if (!entries.length || totalDmg <= 0) { boss.redDropsComputedAt = Date.now(); return; }

  const alloc = {};
  let used = 0;
  const remainders = [];
  for (const x of entries) {
    const exact = totalDrops * x.dmg / totalDmg;
    alloc[x.uid] = Math.floor(exact);
    used += alloc[x.uid];
    remainders.push({ uid: x.uid, w: exact - Math.floor(exact) });
  }
  for (let left = totalDrops - used; left > 0; left--) {
    const totalW = remainders.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * Math.max(totalW, 0.000001);
    let uid = remainders[0]?.uid;
    for (const x of remainders) { r -= x.w; if (r <= 0) { uid = x.uid; break; } }
    if (uid) alloc[uid] = (alloc[uid] || 0) + 1;
  }

  const db = loadOreDB();
  const tienPool = Array.isArray(db) ? db.filter((o) => String(o?.tier) === "tien") : [];
  const source = tienPool.length ? tienPool : db;
  const slots = ["weapon", "armor", "boots", "bracelet"];
  for (const [uid, count] of Object.entries(alloc)) {
    const list = [];
    for (let i = 0; i < clampInt(count, 0, 99); i++) {
      const ore = source?.[randomInt(0, source.length || 1)];
      if (!ore?.id) continue;
      list.push(createGearFromOres({ slot: slots[randomInt(0, slots.length)], oreIds: Array(5).fill(ore.id) }));
    }
    if (list.length) boss.redDrops[uid] = list;
  }
  boss.redDropsComputedAt = Date.now();
}
function applyDamage(state, userId, dmg, now = Date.now()) {
  const boss = state?.boss;
  if (!boss) return { ok: false, message: "Boss chưa sẵn sàng." };
  if (boss.killedAt) return { ok: false, message: "Boss đã bị hạ gục." };
  const d = clampInt(dmg, 1, 2_000_000);
  boss.hp = clampInt(boss.hp - d, 0, boss.maxHp);
  boss.contributions[userId] = (Number(boss.contributions[userId]) || 0) + d;
  let killed = false;
  if (boss.hp <= 0) { boss.hp = 0; boss.killedAt = now; computeRedDrops(boss); killed = true; }
  saveBossState(state);
  return { ok: true, dmg: d, killed, hp: boss.hp, maxHp: boss.maxHp };
}
function canClaim(boss, userId) {
  return Boolean(boss?.killedAt && boss?.contributions?.[userId] && !boss?.claimed?.[userId]);
}
function claimReward(state, userId) {
  const boss = state?.boss;
  if (!boss) return { ok: false, message: "Boss chưa sẵn sàng." };
  if (!boss.killedAt) return { ok: false, message: "Boss chưa bị hạ gục." };
  if (!boss.contributions?.[userId]) return { ok: false, message: "Đạo hữu chưa có chiến công tuần này." };
  if (boss.claimed?.[userId]) return { ok: false, message: "Đạo hữu đã nhận thưởng rồi." };
  if (!boss.redDropsComputedAt) computeRedDrops(boss);
  const info = computeRewardForUser(boss, userId);
  const drops = Array.isArray(boss.redDrops?.[userId]) ? boss.redDrops[userId] : [];
  delete boss.redDrops[userId];
  boss.claimed[userId] = true;
  saveBossState(state);
  return { ok: true, rewardLt: info.lt, info, drops };
}
function bossSummary(state, users) {
  const b = state?.boss;
  if (!b) return null;
  const poolLt = computeRewardPoolLt(b);
  return {
    weekKey: state.weekKey, name: b.name, element: b.element, elementText: elements.display?.[b.element] || b.element,
    maxHp: b.maxHp, hp: b.hp, hpText: `${b.hp.toLocaleString("vi-VN")} / ${b.maxHp.toLocaleString("vi-VN")}`,
    bar: progressBar(b.hp, b.maxHp), killedAt: b.killedAt, poolLt,
    bonusTop: { 1: Math.round(poolLt * 0.25), 2: Math.round(poolLt * 0.15), 3: Math.round(poolLt * 0.08) },
    redDropTotal: clampInt(b.redDropTotal, 0, 10_000), top: topContributors(b, users, 5),
  };
}

// ==================================================
// COMMAND UI
// ==================================================
function fmtLT(n) { return Number(n || 0).toLocaleString("vi-VN"); }
function ensureGearBag(user) {
  user.gear = user.gear || {};
  if (!Array.isArray(user.gear.bag)) user.gear.bag = [];
}
function computeDamageFromUser(user) {
  const { eff } = computeEffective(user);
  const atk = Number(eff.atk) || 0;
  const spd = Number(eff.spd) || 0;
  const lvl = Number(user.level) || 1;
  return Math.max(1, Math.min(250_000, Math.floor((atk * 1.6 + spd * 0.4) * (1 + Math.min(0.8, Math.log10(Math.max(1, lvl)) * 0.25)) * (0.85 + Math.random() * 0.3))));
}
function buildBossEmbed(s) {
  const top = s.top.length ? s.top.map((t) => `#${t.rank} • **${t.name}** — ${fmtLT(t.dmg)} DMG`).join("\n") : "(Chưa có ai ra tay)";
  return new EmbedBuilder().setTitle("🐉 World Boss Tuần").setColor(0xE74C3C)
    .setDescription(`Tuần: **${s.weekKey}**\nBoss: **${s.name}** • Hệ: ${s.elementText}\n\nHP: **${s.hpText}**\n${s.bar}`)
    .addFields(
      { name: "🏅 Top đóng góp", value: top },
      { name: "💰 Quỹ thưởng", value: `**${fmtLT(s.poolLt)} LT**\nTop 1/2/3: +${fmtLT(s.bonusTop[1])}/+${fmtLT(s.bonusTop[2])}/+${fmtLT(s.bonusTop[3])} LT\nTrang bị 🔴: ${s.killedAt ? `**${fmtLT(s.redDropTotal)}** món` : "rơi khi hạ Boss"}` }
    )
    .setFooter({ text: s.killedAt ? "Boss đã bị hạ — hãy nhận thưởng." : "Tấn công có cooldown 60 giây." });
}
function buildRows(userId, nonce, dead) {
  const row = new ActionRowBuilder();
  row.addComponents(dead
    ? new ButtonBuilder().setCustomId(`boss_claim_${userId}_${nonce}`).setLabel("Nhận thưởng").setStyle(ButtonStyle.Success)
    : new ButtonBuilder().setCustomId(`boss_atk_${userId}_${nonce}`).setLabel("Tấn công").setStyle(ButtonStyle.Danger));
  row.addComponents(new ButtonBuilder().setCustomId(`boss_close_${userId}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary));
  return [row];
}

const bossCommand = {
  name: "boss", aliases: ["wb"],
  run: async (_client, msg) => {
    const users = loadUsers();
    if (!users[msg.author.id]) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    const state = ensureBoss(users);
    const summary = bossSummary(state, users);
    const nonce = Math.random().toString(36).slice(2, 8);
    const sent = await msg.reply({ embeds: [buildBossEmbed(summary)], components: buildRows(msg.author.id, nonce, !!summary.killedAt) });
    const col = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải chiến bảng của đạo hữu.", ephemeral: true });
      const cid = String(i.customId || "");
      if (!cid.endsWith(`_${nonce}`)) return i.reply({ content: "⚠️ Chiến lệnh đã hết hiệu lực.", ephemeral: true });
      if (cid.startsWith("boss_close_")) { await i.deferUpdate(); col.stop(); return sent.edit({ components: [] }).catch(() => {}); }

      if (cid.startsWith("boss_atk_")) {
        await i.deferUpdate();
        const all = loadUsers(); const u = all[msg.author.id]; const now = Date.now();
        const remain = (Number(u.bossLastAt) || 0) + ATTACK_COOLDOWN_MS - now;
        if (remain > 0) return i.followUp({ content: `⏳ Chờ **${Math.ceil(remain / 1000)}s** rồi ra tay tiếp.`, ephemeral: true });
        const st = ensureBoss(all, now); const sum = bossSummary(st, all);
        if (sum.killedAt) { await sent.edit({ embeds: [buildBossEmbed(sum)], components: buildRows(msg.author.id, nonce, true) }); return; }
        const res = applyDamage(st, msg.author.id, computeDamageFromUser(u), now);
        if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });
        u.bossLastAt = now;
        recordQuestEvent(u, "boss_damage", res.dmg);
        const titles = recordAchievementEvent(u, "boss_damage", res.dmg) || [];
        all[msg.author.id] = u; saveUsers(all);
        const after = bossSummary(st, all);
        await sent.edit({ embeds: [buildBossEmbed(after)], components: buildRows(msg.author.id, nonce, !!after.killedAt) });
        return i.followUp({ content: `⚔️ Gây **${fmtLT(res.dmg)}** sát thương.${res.killed ? "\n🏁 **Boss đã bị hạ!**" : ""}${titles.length ? `\n🎖 ${titles.join(", ")}` : ""}`, ephemeral: true });
      }

      if (cid.startsWith("boss_claim_")) {
        await i.deferUpdate();
        const all = loadUsers(); const u = all[msg.author.id]; const st = ensureBoss(all);
        if (!canClaim(st.boss, msg.author.id)) return i.followUp({ content: "⚠️ Không có thưởng khả dụng hoặc đã nhận.", ephemeral: true });
        const res = claimReward(st, msg.author.id);
        if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });
        u.lt = (Number(u.lt) || 0) + res.rewardLt;
        if (res.drops.length) { ensureGearBag(u); u.gear.bag.push(...res.drops); }
        const titles = res.info.rank === 1 ? recordAchievementEvent(u, "boss_rank1", 1) : [];
        all[msg.author.id] = u; saveUsers(all);
        const dropTxt = res.drops.length ? `\n🔴 +${res.drops.length} trang bị\n${res.drops.slice(0,3).map((g) => `• ${formatGearLines(g).title}`).join("\n")}` : "";
        return i.followUp({ content: `✅ **${fmtLT(res.rewardLt)} LT**${res.info.rank ? ` • Top #${res.info.rank}` : ""}${dropTxt}${titles.length ? `\n🎖 ${titles.join(", ")}` : ""}`, ephemeral: true });
      }
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};

module.exports = { commands: [bossCommand] };
