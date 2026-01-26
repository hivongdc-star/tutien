// commands/bag.js
// Túi mới (select menu chống trôi): Khoáng cụ / Khoáng thạch / Trang bị / Vật phẩm (legacy).

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { loadOreDB, getOreById } = require("../utils/mining");
const { tierMeta, tierText } = require("../utils/tiers");
const {
  describeGearItem,
  sumAffixes,
  sumMainPercents,
  formatPct,
} = require("../utils/statsView");

function ensureMining(user) {
  if (!user.mining) user.mining = {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

function ensureGear(user) {
  if (!user.gear) user.gear = {};
  if (!user.gear.equipped || typeof user.gear.equipped !== "object") {
    user.gear.equipped = { weapon: null, armor: null, boots: null, bracelet: null };
  } else {
    if (typeof user.gear.equipped.weapon === "undefined") user.gear.equipped.weapon = null;
    if (typeof user.gear.equipped.armor === "undefined") user.gear.equipped.armor = null;
    if (typeof user.gear.equipped.boots === "undefined") user.gear.equipped.boots = null;
    if (typeof user.gear.equipped.bracelet === "undefined") user.gear.equipped.bracelet = null;
  }
  if (!Array.isArray(user.gear.bag)) user.gear.bag = [];
}

function ensureGearIds(user) {
  let changed = false;
  // bag
  for (const it of user.gear.bag) {
    if (!it) continue;
    if (!it.gid) {
      it.gid = `g_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      changed = true;
    }
  }
  // equipped
  for (const [slot, it] of Object.entries(user.gear.equipped)) {
    if (!it) continue;
    if (!it.gid) {
      it.gid = `g_${slot}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      changed = true;
    }
  }
  return changed;
}

function slotLabel(slot) {
  if (slot === "weapon") return "Vũ khí";
  if (slot === "armor") return "Giáp";
  if (slot === "boots") return "Giày";
  if (slot === "bracelet") return "Vòng tay";
  return slot;
}

function describeMainLine(it) {
  const main = it?.main || it?.mainPct || it?.main_percent || null;
  if (!main || typeof main !== "object") return "(chưa có)";

  // Hiển thị ưu tiên theo slot
  const parts = [];
  if (Number.isFinite(main.atkPct) || Number.isFinite(main.atk)) parts.push(`Công +${formatPct(main.atkPct ?? main.atk)}%`);
  if (Number.isFinite(main.defPct) || Number.isFinite(main.def)) parts.push(`Thủ +${formatPct(main.defPct ?? main.def)}%`);
  if (Number.isFinite(main.spdPct) || Number.isFinite(main.spd)) parts.push(`Tốc +${formatPct(main.spdPct ?? main.spd)}%`);
  if (Number.isFinite(main.hpPct) || Number.isFinite(main.hp)) parts.push(`Sinh mệnh +${formatPct(main.hpPct ?? main.hp)}%`);
  if (Number.isFinite(main.mpPct) || Number.isFinite(main.mp)) parts.push(`Linh lực +${formatPct(main.mpPct ?? main.mp)}%`);
  return parts.length ? parts.join(" • ") : "(chưa có)";
}

function describeAffixes(it) {
  const arr = Array.isArray(it?.affixes) ? it.affixes : [];
  if (!arr.length) return "(Không có)";
  return arr
    .map((a) => {
      const k = String(a.stat || "");
      const pct = Number(a.pct) || 0;
      const label = {
        crit: "Chí mạng",
        crit_resist: "Kháng chí mạng",
        armor_pen: "Xuyên giáp",
        crit_dmg: "Bạo kích",
        dmg_reduce: "Giảm sát thương",
        lifesteal: "Hút huyết",
        dodge: "Né tránh",
        accuracy: "Chính xác",
      }[k] || k;
      return `• ${label}: +${formatPct(pct)}%`;
    })
    .join("\n");
}

async function openToolsMenu(msg, user, nonce) {
  const tools = user.mining.tools || [];
  if (!tools.length) {
    return msg.reply("🧰 Túi khoáng cụ trống. Hãy vào `-shop` để mua.");
  }

  // ensure active
  if (!user.mining.activeToolId || !tools.find((t) => t.iid === user.mining.activeToolId)) {
    user.mining.activeToolId = tools[0].iid;
  }

  const active = user.mining.activeToolId;
  const options = tools.slice(0, 25).map((t) => {
    const isActive = t.iid === active;
    const dur = `${Math.max(0, Number(t.durability) || 0)}/${Math.max(0, Number(t.durabilityMax) || Number(t.durability) || 0)}`;
    const br = Math.max(0, Number(t.bonusRare) || 0);
    return {
      label: `${isActive ? "[Đang dùng] " : ""}${t.name || "Khoáng cụ"}`.slice(0, 100),
      value: t.iid,
      description: `Độ bền ${dur} • Hiếm +${br}%`.slice(0, 100),
    };
  });

  const embed = new EmbedBuilder()
    .setColor(0x95A5A6)
    .setTitle("🧰 Khoáng Cụ")
    .setDescription(
      `Cảnh giới: **${user.realm || "(chưa rõ)"}**\n` +
      `Chọn khoáng cụ đang dùng (ảnh hưởng tỷ lệ ra khoáng hiếm).`
    );

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bag_tools_${msg.author.id}_${nonce}`)
      .setPlaceholder("Chọn khoáng cụ...")
      .addOptions(options)
  );

  const sent = await msg.reply({ embeds: [embed], components: [row] });

  const col = sent.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
    await i.deferUpdate();
    user.mining.activeToolId = i.values[0];
    const activeTool = (user.mining.tools || []).find((t) => t.iid === user.mining.activeToolId);
    saveUsers({ ...loadUsers(), [msg.author.id]: user });
    await sent.edit({
      embeds: [
        EmbedBuilder.from(embed).setDescription(
          `Cảnh giới: **${user.realm || "(chưa rõ)"}**\n` +
          `Đang dùng: **${activeTool?.name || "Khoáng cụ"}**`
        ),
      ],
    }).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

async function openOresView(msg, user) {
  const ores = user.mining.ores || {};
  const entries = Object.entries(ores).filter(([, q]) => (Number(q) || 0) > 0);
  if (!entries.length) {
    return msg.reply("🪨 Túi khoáng thạch trống. Dùng `-dao` để khai khoáng.");
  }

  loadOreDB();
  const mapped = entries
    .map(([id, q]) => {
      const ore = getOreById(id);
      if (!ore) return { id, name: id, tier: "pham", qty: Number(q) || 0 };
      return { id, name: ore.name, tier: ore.tier, qty: Number(q) || 0 };
    })
    .sort((a, b) => {
      const order = { pham: 1, linh: 2, hoang: 3, huyen: 4, dia: 5, thien: 6, tien: 7, than: 8 };
      const ta = order[a.tier] || 99;
      const tb = order[b.tier] || 99;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name);
    });

  const lines = mapped.map((o) => {
    const m = tierMeta(o.tier);
    return `${m.icon} **${o.name}** x${o.qty}  _(${tierText(o.tier)})_`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle("🪨 Khoáng Thạch")
    .setDescription(`Cảnh giới: **${user.realm || "(chưa rõ)"}**\n\n${lines.join("\n")}`);

  return msg.reply({ embeds: [embed] });
}

async function openGearView(msg, user, nonce) {
  const equipped = user.gear.equipped || {};
  const bag = user.gear.bag || [];

  const eqLines = Object.entries(equipped).map(([slot, it]) => `• **${slotLabel(slot)}:** ${describeGearItem(it)}`);
  const aff = sumAffixes(equipped);
  const mainPct = sumMainPercents(equipped);

  const summary =
    `Cảnh giới: **${user.realm || "(chưa rõ)"}**\n` +
    `Trang bị đang mặc:\n${eqLines.join("\n")}\n\n` +
    `Tổng % dòng chính: Công +${formatPct(mainPct.atk)}% • Thủ +${formatPct(mainPct.def)}% • Tốc +${formatPct(mainPct.spd)}% • HP +${formatPct(mainPct.hp)}% • MP +${formatPct(mainPct.mp)}%\n` +
    `Tổng phụ tố: **${Object.keys(aff).length || 0}** loại`;

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle("🛡️ Trang Bị")
    .setDescription(summary);

  // Menu xem chi tiết (ưu tiên: đang mặc trước, rồi túi)
  const options = [];
  for (const [slot, it] of Object.entries(equipped)) {
    if (!it) continue;
    options.push({
      label: `[Đang mặc] ${slotLabel(slot)}: ${it.name || "Trang bị"}`.slice(0, 100),
      value: `EQ:${slot}`,
      description: `${tierText(it.tier || "pham")}`.slice(0, 100),
    });
  }
  for (const it of bag) {
    if (!it) continue;
    options.push({
      label: `[Túi] ${slotLabel(it.slot || "?")}: ${it.name || "Trang bị"}`.slice(0, 100),
      value: `BG:${it.gid || ""}`,
      description: `${tierText(it.tier || "pham")}`.slice(0, 100),
    });
    if (options.length >= 25) break;
  }

  if (!options.length) {
    return msg.reply({ embeds: [embed] });
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bag_gear_${msg.author.id}_${nonce}`)
      .setPlaceholder("Xem chi tiết trang bị...")
      .addOptions(options)
  );

  const sent = await msg.reply({ embeds: [embed], components: [row] });
  const col = sent.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90_000 });
  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
    await i.deferUpdate();

    const v = i.values[0];
    let it = null;
    let where = "";
    let slot = null;
    if (v.startsWith("EQ:")) {
      slot = v.slice(3);
      it = user.gear.equipped?.[slot] || null;
      where = `Đang mặc • ${slotLabel(slot)}`;
    } else if (v.startsWith("BG:")) {
      const gid = v.slice(3);
      it = (user.gear.bag || []).find((x) => x && x.gid === gid) || null;
      where = `Trong túi • ${slotLabel(it?.slot || "?")}`;
    }
    if (!it) return;

    const m = tierMeta(it.tier || "pham");
    const detail = new EmbedBuilder()
      .setColor(m.color)
      .setTitle(`${m.icon} ${it.name || "Trang bị"}`)
      .setDescription(
        `${where}\n` +
        `Phẩm giai: **${tierText(it.tier || "pham")}**\n` +
        `Dòng chính: **${describeMainLine(it)}**\n\n` +
        `**Phụ tố:**\n${describeAffixes(it)}`
      );

    await sent.edit({ embeds: [detail] }).catch(() => {});
  });
  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
}

async function openLegacyInventory(msg, user) {
  const inv = user.inventory || {};
  const items = Object.entries(inv).filter(([, q]) => (Number(q) || 0) > 0);
  if (!items.length) return msg.reply("📦 Túi vật phẩm trống.");
  const lines = items
    .slice(0, 40)
    .map(([id, q]) => `• **${id}** x${Number(q) || 0}`);
  const embed = new EmbedBuilder()
    .setColor(0x95A5A6)
    .setTitle("📦 Vật Phẩm")
    .setDescription(`(Legacy)\n\n${lines.join("\n")}`);
  return msg.reply({ embeds: [embed] });
}

module.exports = {
  name: "bag",
  aliases: ["tui"],
  description: "Xem túi (khoáng cụ / khoáng thạch / trang bị).",
  run: async (client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureMining(user);
    ensureGear(user);
    const changed = ensureGearIds(user);
    if (changed) {
      users[msg.author.id] = user;
      saveUsers(users);
    }

    const nonce = `${Date.now()}`;
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🎒 Túi")
      .setDescription(`Cảnh giới: **${user.realm || "(chưa rõ)"}**\nChọn mục để mở.`);

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`bag_cat_${msg.author.id}_${nonce}`)
      .setPlaceholder("Chọn mục...")
      .addOptions(
        { label: "🧰 Khoáng cụ", value: "tools", description: "Chọn khoáng cụ đang dùng" },
        { label: "🪨 Khoáng thạch", value: "ores", description: "Xem khoáng thạch đã đào" },
        { label: "🛡️ Trang bị", value: "gear", description: "Xem trang bị đang mặc & trong túi" },
        { label: "📦 Vật phẩm", value: "legacy", description: "Danh sách vật phẩm kiểu cũ" }
      );

    const row = new ActionRowBuilder().addComponents(menu);
    const sent = await msg.reply({ embeds: [embed], components: [row] });

    const col = sent.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60_000 });
    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
      await i.deferUpdate();
      const choice = i.values[0];
      await sent.edit({ components: [] }).catch(() => {});

      if (choice === "tools") return openToolsMenu(msg, user, nonce);
      if (choice === "ores") return openOresView(msg, user);
      if (choice === "gear") return openGearView(msg, user, nonce);
      if (choice === "legacy") return openLegacyInventory(msg, user);
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};
