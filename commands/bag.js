const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { loadOreDB, getOreById } = require("../utils/mining");
const { tierMeta, tierText } = require("../utils/tiers");
const { fmtLT, oreSellValueByTier, gearSellValue, clampInt, tierOrder } = require("../utils/pricing");
const { attemptEnhance, ensureEnhanceFields, successRate, enhanceCost } = require("../utils/enhanceSystem");
const { getItem } = require("../shop/shopUtils");
const { describeGearItem, sumAffixes, sumMainPercents, formatPct } = require("../utils/statsView");
const elements = require("../utils/element");
const {
  ensureUserSkills,
  getSkill,
  listSkills,
  craftSkill,
  describeSkillShort,
  describeSkillLong,
} = require("../utils/skills");
const { recordAchievementEvent } = require("./progress");

function ensureMining(user) {
  user.mining = user.mining || {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

function ensureGear(user) {
  user.gear = user.gear || {};
  user.gear.equipped = user.gear.equipped && typeof user.gear.equipped === "object"
    ? user.gear.equipped
    : { weapon: null, armor: null, boots: null, bracelet: null };
  for (const slot of ["weapon", "armor", "boots", "bracelet"]) {
    if (typeof user.gear.equipped[slot] === "undefined") user.gear.equipped[slot] = null;
  }
  if (!Array.isArray(user.gear.bag)) user.gear.bag = [];
}

function ensureGearIds(user) {
  let changed = false;
  for (const it of user.gear.bag) {
    if (it && !it.gid) { it.gid = `g_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; changed = true; }
  }
  for (const [slot, it] of Object.entries(user.gear.equipped)) {
    if (it && !it.gid) { it.gid = `g_${slot}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; changed = true; }
  }
  return changed;
}

function slotLabel(slot) {
  return ({ weapon: "Vũ khí", armor: "Giáp", boots: "Giày", bracelet: "Vòng tay" })[slot] || slot;
}

function short100(s) {
  const x = String(s || "").replace(/\s+/g, " ").trim();
  return x.length <= 100 ? x : `${x.slice(0, 97)}…`;
}

async function openTools(msg) {
  const users = loadUsers();
  const u = users[msg.author.id];
  ensureMining(u);
  if (!u.mining.tools.length) return msg.reply("🧰 Túi khoáng cụ trống. Hãy vào `-shop` để mua.");

  if (!u.mining.tools.some((x) => x.iid === u.mining.activeToolId)) u.mining.activeToolId = u.mining.tools[0].iid;
  users[msg.author.id] = u; saveUsers(users);
  const nonce = Date.now();
  const options = u.mining.tools.slice(0, 25).map((t) => ({
    label: `${t.iid === u.mining.activeToolId ? "[Đang dùng] " : ""}${t.name || "Khoáng cụ"}`.slice(0, 100),
    value: t.iid,
    description: `Độ bền ${Math.max(0, Number(t.durability) || 0)}/${Math.max(0, Number(t.durabilityMax) || 0)} • Hiếm +${Math.max(0, Number(t.bonusRare) || 0)}%`.slice(0, 100),
  }));
  const embed = new EmbedBuilder().setTitle("🧰 Khoáng Cụ").setColor(0x95A5A6)
    .setDescription("Chọn khoáng cụ sẽ dùng cho lần khai khoáng kế tiếp.");
  const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_tool_${msg.author.id}_${nonce}`).setPlaceholder("Chọn khoáng cụ...").addOptions(options));
  const sent = await msg.reply({ embeds: [embed], components: [row] });
  const col = sent.createMessageComponentCollector({ time: 90_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải hành trang của đạo hữu.", ephemeral: true });
    if (!i.isStringSelectMenu()) return;
    await i.deferUpdate();
    const all = loadUsers(); const cur = all[msg.author.id]; ensureMining(cur);
    if (cur.mining.tools.some((x) => x.iid === i.values[0])) cur.mining.activeToolId = i.values[0];
    all[msg.author.id] = cur; saveUsers(all);
    const active = cur.mining.tools.find((x) => x.iid === cur.mining.activeToolId);
    await sent.edit({ embeds: [EmbedBuilder.from(embed).setDescription(`Đang dùng: **${active?.name || "Khoáng cụ"}**`)] }).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

async function openOres(msg) {
  let all = loadUsers(); let u = all[msg.author.id]; ensureMining(u); loadOreDB();
  const list = () => Object.entries(u.mining.ores || {})
    .filter(([, q]) => Number(q) > 0)
    .map(([id, q]) => { const ore = getOreById(id) || { id, name: id, tier: "pham" }; return { ...ore, qty: Number(q) || 0 }; })
    .sort((a, b) => tierOrder(b.tier) - tierOrder(a.tier) || String(a.name).localeCompare(String(b.name), "vi"));
  if (!list().length) return msg.reply("🪨 Túi khoáng thạch trống. Dùng `-dao` để khai khoáng.");

  const nonce = Date.now(); let selected = null;
  const build = () => {
    const ores = list();
    const cur = selected ? ores.find((x) => x.id === selected) : null;
    const embed = new EmbedBuilder().setTitle("🪨 Khoáng Thạch").setColor(cur ? tierMeta(cur.tier).color : 0x3498DB)
      .setDescription(cur
        ? `${tierMeta(cur.tier).icon} **${cur.name}** • ${tierText(cur.tier)}\nĐang có: **${cur.qty}**\nGiá bán: **${fmtLT(oreSellValueByTier(cur.tier))} LT/viên**`
        : ores.slice(0, 20).map((o) => `${tierMeta(o.tier).icon} **${o.name}** x${o.qty} • ${tierText(o.tier)}`).join("\n"));
    const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_ore_${msg.author.id}_${nonce}`).setPlaceholder("Chọn khoáng để bán...")
      .addOptions(ores.slice(0, 25).map((o) => ({ label: `${o.name} x${o.qty}`.slice(0, 100), value: o.id, description: `${tierText(o.tier)} • ${fmtLT(oreSellValueByTier(o.tier))} LT/viên`.slice(0, 100) }))));
    const rows = [menu];
    if (cur) rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bag_ore_sell_${nonce}_1`).setLabel("Bán 1").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bag_ore_sell_${nonce}_5`).setLabel("Bán 5").setStyle(ButtonStyle.Primary).setDisabled(cur.qty < 5),
      new ButtonBuilder().setCustomId(`bag_ore_sell_${nonce}_all`).setLabel(`Bán hết (${cur.qty})`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bag_ore_close_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary)
    ));
    return { embeds: [embed], components: rows };
  };
  const sent = await msg.reply(build());
  const col = sent.createMessageComponentCollector({ time: 120_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải hành trang của đạo hữu.", ephemeral: true });
    await i.deferUpdate();
    if (i.isStringSelectMenu()) { selected = i.values[0]; return sent.edit(build()).catch(() => {}); }
    if (i.customId === `bag_ore_close_${nonce}`) { col.stop(); return sent.edit({ components: [] }).catch(() => {}); }
    if (!i.customId.startsWith(`bag_ore_sell_${nonce}_`) || !selected) return;
    all = loadUsers(); u = all[msg.author.id]; ensureMining(u);
    const ore = getOreById(selected) || { id: selected, name: selected, tier: "pham" };
    const have = Math.max(0, Number(u.mining.ores[selected]) || 0);
    const tail = i.customId.slice(`bag_ore_sell_${nonce}_`.length);
    const qty = tail === "all" ? have : Math.min(have, clampInt(tail, 1, 999999));
    if (qty <= 0) { selected = null; return sent.edit(build()).catch(() => {}); }
    const total = qty * oreSellValueByTier(ore.tier);
    const left = have - qty; if (left > 0) u.mining.ores[selected] = left; else delete u.mining.ores[selected];
    u.lt = (Number(u.lt) || 0) + total;
    const titles = recordAchievementEvent(u, "sell_ore", qty) || [];
    all[msg.author.id] = u; saveUsers(all);
    if (!u.mining.ores[selected]) selected = null;
    await i.followUp({ content: `✅ Bán **${ore.name}** x${qty} → **+${fmtLT(total)} LT**.${titles.length ? `\n🎖 ${titles.join(", ")}` : ""}`, ephemeral: true });
    return sent.edit(build()).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

function gearSummary(u) {
  const eq = u.gear.equipped || {};
  const main = sumMainPercents(eq); const aff = sumAffixes(eq);
  const lines = Object.entries(eq).map(([slot, it]) => `• **${slotLabel(slot)}:** ${describeGearItem(it)}`);
  return new EmbedBuilder().setTitle("🛡️ Trang Bị").setColor(0x9B59B6)
    .setDescription(`${lines.join("\n")}\n\nCông +${formatPct(main.atk)}% • Thủ +${formatPct(main.def)}% • Tốc +${formatPct(main.spd)}% • HP +${formatPct(main.hp)}% • MP +${formatPct(main.mp)}%\nPhụ tố cộng dồn: **${Object.keys(aff).length}** loại`);
}

async function openGear(msg) {
  let all = loadUsers(); let u = all[msg.author.id]; ensureGear(u); ensureGearIds(u); all[msg.author.id] = u; saveUsers(all);
  const nonce = Date.now(); let selected = null;
  const options = () => {
    const out = [];
    for (const [slot, it] of Object.entries(u.gear.equipped)) if (it) out.push({ label: `[Đang mặc] ${slotLabel(slot)}: ${it.name || "Trang bị"}`.slice(0,100), value: `E:${slot}` });
    for (const it of u.gear.bag) if (it && out.length < 25) out.push({ label: `[Túi] ${slotLabel(it.slot)}: ${it.name || "Trang bị"}`.slice(0,100), value: `B:${it.gid}` });
    return out;
  };
  const resolve = () => {
    if (!selected) return null;
    if (selected.kind === "E") return u.gear.equipped[selected.id] || null;
    return u.gear.bag.find((x) => x?.gid === selected.id) || null;
  };
  const build = () => {
    const opts = options(); const gear = resolve(); let embed = gearSummary(u);
    if (gear) {
      ensureEnhanceFields(gear); const cost = enhanceCost(gear); const m = tierMeta(gear.tier || "pham");
      embed = new EmbedBuilder().setTitle(`${m.icon} ${gear.name || "Trang bị"} +${gear.enhanceLevel || 0}`).setColor(m.color)
        .setDescription(`${selected.kind === "E" ? "Đang mặc" : "Trong túi"} • **${slotLabel(gear.slot || selected.id)}**\nPhẩm: **${tierText(gear.tier || "pham")}**\nCường hóa kế: **${Math.round(successRate(gear.enhanceLevel) * 100)}%** • ${fmtLT(cost.lt)} LT + ${cost.materialNeed} linh tài${selected.kind === "B" ? `\nGiá bán: **${fmtLT(gearSellValue(gear))} LT**` : ""}`);
    }
    const rows = [];
    if (opts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_gear_${msg.author.id}_${nonce}`).setPlaceholder("Chọn trang bị...").addOptions(opts)));
    if (gear) {
      const row = new ActionRowBuilder();
      if (selected.kind === "B") row.addComponents(new ButtonBuilder().setCustomId(`bag_gear_equip_${nonce}`).setLabel("Mặc").setStyle(ButtonStyle.Success));
      else row.addComponents(new ButtonBuilder().setCustomId(`bag_gear_unequip_${nonce}`).setLabel("Tháo").setStyle(ButtonStyle.Secondary));
      row.addComponents(new ButtonBuilder().setCustomId(`bag_gear_enh_${nonce}`).setLabel("Cường hóa").setStyle(ButtonStyle.Primary));
      if (selected.kind === "B") row.addComponents(new ButtonBuilder().setCustomId(`bag_gear_sell_${nonce}`).setLabel("Bán").setStyle(ButtonStyle.Danger));
      row.addComponents(new ButtonBuilder().setCustomId(`bag_gear_close_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary));
      rows.push(row);
    }
    return { embeds: [embed], components: rows };
  };
  const sent = await msg.reply(build()); const col = sent.createMessageComponentCollector({ time: 120_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải hành trang của đạo hữu.", ephemeral: true });
    await i.deferUpdate();
    if (i.isStringSelectMenu()) { const [kind, id] = i.values[0].split(":"); selected = { kind, id }; return sent.edit(build()).catch(() => {}); }
    if (i.customId === `bag_gear_close_${nonce}`) { col.stop(); return sent.edit({ components: [] }).catch(() => {}); }
    all = loadUsers(); u = all[msg.author.id]; ensureGear(u); ensureMining(u);
    let gear = selected?.kind === "E" ? u.gear.equipped[selected.id] : u.gear.bag.find((x) => x?.gid === selected?.id);
    if (!gear) { selected = null; return sent.edit(build()).catch(() => {}); }

    if (i.customId === `bag_gear_equip_${nonce}` && selected.kind === "B") {
      const idx = u.gear.bag.findIndex((x) => x?.gid === selected.id); const slot = gear.slot;
      if (u.gear.equipped[slot]) u.gear.bag.push(u.gear.equipped[slot]);
      u.gear.equipped[slot] = gear; u.gear.bag.splice(idx, 1); selected = { kind: "E", id: slot };
    } else if (i.customId === `bag_gear_unequip_${nonce}` && selected.kind === "E") {
      u.gear.equipped[selected.id] = null; u.gear.bag.push(gear); selected = null;
    } else if (i.customId === `bag_gear_sell_${nonce}` && selected.kind === "B") {
      const idx = u.gear.bag.findIndex((x) => x?.gid === selected.id); const price = gearSellValue(gear);
      u.gear.bag.splice(idx, 1); u.lt = (Number(u.lt) || 0) + price; const titles = recordAchievementEvent(u, "sell_gear", 1) || [];
      await i.followUp({ content: `✅ Bán **${gear.name || "Trang bị"}** → **+${fmtLT(price)} LT**.${titles.length ? `\n🎖 ${titles.join(", ")}` : ""}`, ephemeral: true }); selected = null;
    } else if (i.customId === `bag_gear_enh_${nonce}`) {
      const res = attemptEnhance({ user: u, gear });
      if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });
      let titles = [];
      if (res.after >= 5) titles.push(...recordAchievementEvent(u, "enh_plus5", 1));
      if (res.after >= 10) titles.push(...recordAchievementEvent(u, "enh_plus10", 1));
      if (res.after >= 15) titles.push(...recordAchievementEvent(u, "enh_plus15", 1));
      if (!res.success) titles.push(...recordAchievementEvent(u, "enh_fail", 1));
      await i.followUp({ content: `${res.success ? "✅ Thành công" : "❌ Thất bại"}: **+${res.before} → +${res.after}**${titles.length ? `\n🎖 ${[...new Set(titles)].join(", ")}` : ""}`, ephemeral: true });
    }
    all[msg.author.id] = u; saveUsers(all); return sent.edit(build()).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

function skillsEmbed(u) {
  ensureUserSkills(u); const eq = u.skills.equipped; const el = u.element || "kim";
  const act = eq.actives.map((id, i) => `${i + 1}. ${id ? `**${getSkill(id)?.name || id}**` : "_(trống)_"}`).join("\n");
  const pass = eq.passive ? `**${getSkill(eq.passive)?.name || eq.passive}**` : "_(trống)_";
  const shards = u.skills.shards[el] || { rare: 0, epic: 0 };
  return new EmbedBuilder().setTitle("📜 Bí Kíp").setColor(0x8E44AD)
    .setDescription(`Hệ: ${elements.display[el] || el}\n\n**Chủ động**\n${act}\n**Bị động:** ${pass}\n\nMảnh Hiếm: **${shards.rare || 0}** • Cực hiếm: **${shards.epic || 0}**`);
}

async function openSkills(msg) {
  let all = loadUsers(); let u = all[msg.author.id]; ensureUserSkills(u); all[msg.author.id] = u; saveUsers(all);
  const nonce = Date.now(); let mode = "main"; let slot = null; let picked = null; let rarity = null;
  const build = () => {
    const rows = []; const embed = skillsEmbed(u);
    if (mode === "main") rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bag_sk_equip_${nonce}`).setLabel("Trang bị").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bag_sk_rare_${nonce}`).setLabel("Ghép Hiếm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bag_sk_epic_${nonce}`).setLabel("Ghép Cực hiếm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bag_sk_close_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Secondary)
    ));
    if (mode === "equip") {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_sk_slot_${nonce}`).setPlaceholder("Chọn slot...").addOptions(
        { label: "Chủ động 1", value: "a1" }, { label: "Chủ động 2", value: "a2" }, { label: "Chủ động 3", value: "a3" }, { label: "Chủ động 4", value: "a4" }, { label: "Bị động", value: "passive" }
      )));
      if (slot) {
        const want = slot === "passive" ? "passive" : "active";
        const pool = (u.skills.owned || []).map((id) => ({ id, s: getSkill(id) })).filter((x) => x.s?.kind === want && (!x.s.element || x.s.element === u.element));
        if (pool.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_sk_pick_${nonce}`).setPlaceholder("Chọn bí kíp...").addOptions(pool.slice(0,25).map((x) => ({ label: x.s.name.slice(0,100), value: x.id, description: short100(describeSkillShort(x.s)) })))));
      }
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bag_sk_apply_${nonce}`).setLabel("Áp dụng").setStyle(ButtonStyle.Success).setDisabled(!slot || !picked),
        new ButtonBuilder().setCustomId(`bag_sk_remove_${nonce}`).setLabel("Tháo").setStyle(ButtonStyle.Danger).setDisabled(!slot),
        new ButtonBuilder().setCustomId(`bag_sk_back_${nonce}`).setLabel("Quay lại").setStyle(ButtonStyle.Secondary)
      ));
    }
    if (mode === "craft") {
      const pool = listSkills({ element: u.element, rarity }).filter((s) => !(u.skills.owned || []).includes(s.id));
      if (pool.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_sk_craftpick_${nonce}`).setPlaceholder("Chọn bí kíp để ghép...").addOptions(pool.slice(0,25).map((s) => ({ label: s.name.slice(0,100), value: s.id, description: short100(describeSkillShort(s)) }))));
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bag_sk_craft_${nonce}`).setLabel("Ghép").setStyle(ButtonStyle.Success).setDisabled(!picked),
        new ButtonBuilder().setCustomId(`bag_sk_back_${nonce}`).setLabel("Quay lại").setStyle(ButtonStyle.Secondary)
      ));
      if (picked) { const sk = getSkill(picked); if (sk) embed.addFields({ name: sk.name, value: describeSkillLong(sk).slice(0,1024) }); }
    }
    return { embeds: [embed], components: rows };
  };
  const sent = await msg.reply(build()); const col = sent.createMessageComponentCollector({ time: 150_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải hành trang của đạo hữu.", ephemeral: true });
    await i.deferUpdate(); const cid = i.customId;
    if (cid === `bag_sk_close_${nonce}`) { col.stop(); return sent.edit({ components: [] }).catch(() => {}); }
    if (cid === `bag_sk_back_${nonce}`) { mode = "main"; slot = null; picked = null; rarity = null; return sent.edit(build()).catch(() => {}); }
    if (cid === `bag_sk_equip_${nonce}`) { mode = "equip"; slot = null; picked = null; return sent.edit(build()).catch(() => {}); }
    if (cid === `bag_sk_rare_${nonce}` || cid === `bag_sk_epic_${nonce}`) { mode = "craft"; rarity = cid.includes("epic") ? "epic" : "rare"; picked = null; return sent.edit(build()).catch(() => {}); }
    if (i.isStringSelectMenu() && cid === `bag_sk_slot_${nonce}`) { slot = i.values[0]; picked = null; return sent.edit(build()).catch(() => {}); }
    if (i.isStringSelectMenu() && (cid === `bag_sk_pick_${nonce}` || cid === `bag_sk_craftpick_${nonce}`)) { picked = i.values[0]; return sent.edit(build()).catch(() => {}); }

    all = loadUsers(); u = all[msg.author.id]; ensureUserSkills(u);
    if (cid === `bag_sk_apply_${nonce}` && slot && picked) {
      if (slot === "passive") u.skills.equipped.passive = picked;
      else u.skills.equipped.actives[Math.max(0, Math.min(3, Number(slot.slice(1)) - 1))] = picked;
    } else if (cid === `bag_sk_remove_${nonce}` && slot) {
      if (slot === "passive") u.skills.equipped.passive = null;
      else u.skills.equipped.actives[Math.max(0, Math.min(3, Number(slot.slice(1)) - 1))] = null;
      picked = null;
    } else if (cid === `bag_sk_craft_${nonce}` && picked) {
      const res = craftSkill(u, picked); if (!res.ok) return i.followUp({ content: res.message, ephemeral: true });
      await i.followUp({ content: `✅ ${res.message}`, ephemeral: true }); mode = "main"; picked = null; rarity = null;
    }
    all[msg.author.id] = u; saveUsers(all); return sent.edit(build()).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

async function openItems(msg) {
  const u = loadUsers()[msg.author.id]; const inv = u.inventory || {};
  const rows = Object.entries(inv).filter(([, q]) => Number(q) > 0).map(([id, q]) => {
    const it = getItem(id); return { order: it?.tier ? tierOrder(it.tier) : -1, text: `• ${it?.emoji || ""} **${it?.name || id}** x${q}${it?.tier ? ` • ${tierText(it.tier)}` : ""}` };
  }).sort((a,b) => a.order-b.order).slice(0,40);
  return msg.reply({ embeds: [new EmbedBuilder().setTitle("📦 Vật Phẩm").setColor(0x95A5A6).setDescription(rows.length ? rows.map((x) => x.text).join("\n") : "(Trống)")] });
}

module.exports = {
  name: "bag",
  aliases: ["tui"],
  description: "Túi: khoáng cụ, khoáng, bí kíp, trang bị và vật phẩm.",
  run: async (_client, msg) => {
    const users = loadUsers(); const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    ensureMining(u); ensureGear(u); ensureUserSkills(u); ensureGearIds(u); users[msg.author.id] = u; saveUsers(users);
    const nonce = Date.now();
    const embed = new EmbedBuilder().setTitle("🎒 Túi").setColor(0x5865F2).setDescription(`Cảnh giới: **${u.realm || "(chưa rõ)"}**\nChọn khu vực cần mở.`);
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bag_cat_${msg.author.id}_${nonce}`).setPlaceholder("Chọn mục...").addOptions(
      { label: "🧰 Khoáng cụ", value: "tools" }, { label: "🪨 Khoáng thạch", value: "ores" }, { label: "📜 Bí kíp", value: "skills" }, { label: "🛡️ Trang bị", value: "gear" }, { label: "📦 Vật phẩm", value: "items" }
    ));
    const sent = await msg.reply({ embeds: [embed], components: [row] });
    const col = sent.createMessageComponentCollector({ time: 60_000 });
    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải hành trang của đạo hữu.", ephemeral: true });
      if (!i.isStringSelectMenu()) return;
      await i.deferUpdate(); await sent.edit({ components: [] }).catch(() => {}); col.stop();
      const v = i.values[0];
      if (v === "tools") return openTools(msg);
      if (v === "ores") return openOres(msg);
      if (v === "skills") return openSkills(msg);
      if (v === "gear") return openGear(msg);
      return openItems(msg);
    });
  },
};
