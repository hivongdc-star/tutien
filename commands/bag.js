// commands/bag.js
// Túi mới (select menu chống trôi): Khoáng cụ / Khoáng thạch / Trang bị / Vật phẩm (legacy).

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  ButtonBuilder,
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
const elements = require("../utils/element");
const {
  ensureUserSkills,
  getSkill,
  listSkills,
  craftSkill,
} = require("../utils/skills");

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

function fmtShardLabel(elKey, rarity) {
  const el = elements.display[elKey] || elKey;
  return `${el} • ${rarity === "epic" ? "Cực hiếm" : "Hiếm"}`;
}

function buildSkillsSummaryEmbed(user) {
  ensureUserSkills(user);
  const el = user.element || "kim";
  const eq = user.skills.equipped;
  const act = eq.actives.map((id, idx) => {
    const sk = id ? getSkill(id) : null;
    return `${idx + 1}. ${sk ? `**${sk.name}**` : "_(trống)_"}`;
  });
  const пас = eq.passive ? getSkill(eq.passive) : null;

  const shards = user.skills.shards?.[el] || { rare: 0, epic: 0 };
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("📜 Bí kíp")
    .setDescription(`Hệ: ${elements.display[el] || el}`)
    .addFields(
      { name: "Chủ động (4)", value: act.join("\n") || "_(trống)_" },
      { name: "Bị động (1)", value: пас ? `**${пас.name}**` : "_(trống)_" },
      {
        name: "Mảnh bí kíp (hệ của bạn)",
        value: `• ${fmtShardLabel(el, "rare")}: **${shards.rare || 0}**\n• ${fmtShardLabel(el, "epic")}: **${shards.epic || 0}**`,
      }
    );
}

async function openSkillsView(msg, user, nonce) {
  let u = user;
  ensureUserSkills(u);
  const el = u.element || "kim";

  const state = {
    mode: "equip", // equip | craft
    slot: null, // a1..a4 | passive
    skillId: null,
    craftRarity: null, // rare|epic
  };

  const slotMenuId = `bag_skill_slot_${msg.author.id}_${nonce}`;
  const skillMenuId = `bag_skill_pick_${msg.author.id}_${nonce}`;
  const craftMenuId = `bag_skill_craft_${msg.author.id}_${nonce}`;

  const buildSlotRow = () => {
    const options = [
      { label: "Chủ động 1", value: "a1" },
      { label: "Chủ động 2", value: "a2" },
      { label: "Chủ động 3", value: "a3" },
      { label: "Chủ động 4", value: "a4" },
      { label: "Bị động", value: "passive" },
    ];
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(slotMenuId)
        .setPlaceholder("Chọn slot...")
        .addOptions(options)
    );
  };

  const buildSkillPickRow = () => {
    if (!state.slot || state.mode !== "equip") return null;
    const kind = state.slot === "passive" ? "passive" : "active";
    const owned = (u.skills.owned || []).map((id) => getSkill(id)).filter(Boolean);
    const pool = owned.filter((s) => s.kind === kind);
    if (!pool.length) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(skillMenuId)
          .setPlaceholder("Bạn chưa có bí kíp phù hợp")
          .addOptions([{ label: "(trống)", value: "none" }])
          .setDisabled(true)
      );
    }
    const options = pool.slice(0, 25).map((s) => ({
      label: s.name.slice(0, 100),
      value: s.id,
      description: s.rarity === "common" ? "Thường" : s.rarity === "rare" ? "Hiếm" : "Cực hiếm",
    }));
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(skillMenuId)
        .setPlaceholder("Chọn bí kíp...")
        .addOptions(options)
    );
  };

  const buildCraftRow = () => {
    if (state.mode !== "craft") return null;
    const rarity = state.craftRarity;
    const candidates = listSkills({ element: el, rarity, kind: null })
      .filter((s) => !(u.skills.owned || []).includes(s.id));

    const options = candidates.slice(0, 25).map((s) => ({
      label: s.name.slice(0, 100),
      value: s.id,
      description: rarity === "epic" ? "Cực hiếm" : "Hiếm",
    }));
    if (!options.length) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(craftMenuId)
          .setPlaceholder("Không có bí kíp để ghép")
          .addOptions([{ label: "(trống)", value: "none" }])
          .setDisabled(true)
      );
    }
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(craftMenuId)
        .setPlaceholder("Chọn bí kíp để ghép...")
        .addOptions(options)
    );
  };

  const buildButtonsRow = () => {
    const rows = [];
    if (state.mode === "equip") {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bag_skill_equip_${msg.author.id}_${nonce}`).setLabel("Trang bị").setStyle(ButtonStyle.Primary).setDisabled(!state.slot || !state.skillId),
          new ButtonBuilder().setCustomId(`bag_skill_unequip_${msg.author.id}_${nonce}`).setLabel("Gỡ").setStyle(ButtonStyle.Secondary).setDisabled(!state.slot),
          new ButtonBuilder().setCustomId(`bag_skill_craftr_${msg.author.id}_${nonce}`).setLabel("Ghép (Hiếm)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bag_skill_crafte_${msg.author.id}_${nonce}`).setLabel("Ghép (Cực hiếm)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`bag_skill_close_${msg.author.id}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Danger)
        )
      );
    } else {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bag_skill_doCraft_${msg.author.id}_${nonce}`).setLabel("Ghép").setStyle(ButtonStyle.Primary).setDisabled(!state.skillId),
          new ButtonBuilder().setCustomId(`bag_skill_back_${msg.author.id}_${nonce}`).setLabel("Quay lại").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bag_skill_close_${msg.author.id}_${nonce}`).setLabel("Đóng").setStyle(ButtonStyle.Danger)
        )
      );
    }
    return rows;
  };

  const render = async (sent) => {
    const rows = [buildSlotRow()];
    const row2 = state.mode === "craft" ? buildCraftRow() : buildSkillPickRow();
    if (row2) rows.push(row2);
    rows.push(...buildButtonsRow());

    const baseEmbed = buildSkillsSummaryEmbed(u);
    if (state.mode === "craft") {
      baseEmbed.setTitle(`📜 Ghép bí kíp • ${state.craftRarity === "epic" ? "Cực hiếm" : "Hiếm"}`);
      const need = state.craftRarity === "epic" ? 40 : 12;
      const shards = u.skills.shards?.[el] || { rare: 0, epic: 0 };
      const have = state.craftRarity === "epic" ? (shards.epic || 0) : (shards.rare || 0);
      baseEmbed.setDescription(
        `Hệ: ${elements.display[el] || el}\n` +
        `Cần: **${need}** mảnh • Hiện có: **${have}** mảnh\n\nChọn bí kíp để ghép.`
      );
    } else if (state.slot) {
      const slotName = state.slot === "passive" ? "Bị động" : `Chủ động ${Number(state.slot.slice(1))}`;
      baseEmbed.setFooter({ text: `Đang chọn: ${slotName}` });
    }

    await sent.edit({ embeds: [baseEmbed], components: rows }).catch(() => {});
  };

  const sent = await msg.reply({ embeds: [buildSkillsSummaryEmbed(u)], components: [buildSlotRow(), ...buildButtonsRow()] });
  const col = sent.createMessageComponentCollector({ time: 180_000 });

  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
    const cid = String(i.customId || "");

    if (i.isStringSelectMenu()) {
      await i.deferUpdate();

      if (cid === slotMenuId) {
        state.slot = i.values?.[0] || null;
        state.skillId = null;
        return render(sent);
      }

      if (cid === skillMenuId && state.mode === "equip") {
        const v = i.values?.[0];
        if (!v || v === "none") return;
        state.skillId = v;
        return render(sent);
      }

      if (cid === craftMenuId && state.mode === "craft") {
        const v = i.values?.[0];
        if (!v || v === "none") return;
        state.skillId = v;
        return render(sent);
      }
    }

    if (i.isButton()) {
      await i.deferUpdate();

      if (cid === `bag_skill_close_${msg.author.id}_${nonce}`) {
        col.stop("close");
        return sent.edit({ components: [] }).catch(() => {});
      }

      if (cid === `bag_skill_back_${msg.author.id}_${nonce}`) {
        state.mode = "equip";
        state.craftRarity = null;
        state.skillId = null;
        return render(sent);
      }

      if (cid === `bag_skill_craftr_${msg.author.id}_${nonce}`) {
        state.mode = "craft";
        state.craftRarity = "rare";
        state.skillId = null;
        state.slot = null;
        return render(sent);
      }
      if (cid === `bag_skill_crafte_${msg.author.id}_${nonce}`) {
        state.mode = "craft";
        state.craftRarity = "epic";
        state.skillId = null;
        state.slot = null;
        return render(sent);
      }

      // Equip
      if (cid === `bag_skill_equip_${msg.author.id}_${nonce}`) {
        if (!state.slot || !state.skillId) return;

        const users = loadUsers();
        const cur = users[msg.author.id];
        if (!cur) return;
        ensureUserSkills(cur);

        const sk = getSkill(state.skillId);
        if (!sk) return i.followUp({ content: "❌ Bí kíp không tồn tại.", ephemeral: true });

        const kindNeed = state.slot === "passive" ? "passive" : "active";
        if (sk.kind !== kindNeed) {
          return i.followUp({ content: "⚠️ Bí kíp này không phù hợp slot.", ephemeral: true });
        }
        if (!(cur.skills.owned || []).includes(sk.id)) {
          return i.followUp({ content: "⚠️ Bạn chưa sở hữu bí kíp này.", ephemeral: true });
        }

        if (state.slot === "passive") {
          cur.skills.equipped.passive = sk.id;
        } else {
          const idx = Math.max(0, Math.min(3, Number(state.slot.slice(1)) - 1));
          cur.skills.equipped.actives[idx] = sk.id;
        }

        users[msg.author.id] = cur;
        saveUsers(users);
        u = cur;
        return render(sent);
      }

      // Unequip
      if (cid === `bag_skill_unequip_${msg.author.id}_${nonce}`) {
        if (!state.slot) return;
        const users = loadUsers();
        const cur = users[msg.author.id];
        if (!cur) return;
        ensureUserSkills(cur);

        if (state.slot === "passive") {
          cur.skills.equipped.passive = null;
        } else {
          const idx = Math.max(0, Math.min(3, Number(state.slot.slice(1)) - 1));
          cur.skills.equipped.actives[idx] = null;
        }
        users[msg.author.id] = cur;
        saveUsers(users);
        u = cur;
        state.skillId = null;
        return render(sent);
      }

      // Craft
      if (cid === `bag_skill_doCraft_${msg.author.id}_${nonce}`) {
        if (state.mode !== "craft" || !state.craftRarity || !state.skillId) return;
        const users = loadUsers();
        const cur = users[msg.author.id];
        if (!cur) return;
        ensureUserSkills(cur);

        const res = craftSkill(cur, { element: el, rarity: state.craftRarity, skillId: state.skillId });
        if (!res.ok) return i.followUp({ content: res.message, ephemeral: true });
        users[msg.author.id] = cur;
        saveUsers(users);
        u = cur;
        // quay lại equip
        state.mode = "equip";
        state.craftRarity = null;
        state.skillId = null;
        state.slot = null;
        await i.followUp({ content: res.message, ephemeral: true });
        return render(sent);
      }
    }
  });

  col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
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
  let u = user;

  const buildOptions = () => {
    const equipped = u.gear.equipped || {};
    const bag = u.gear.bag || [];

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
    return options;
  };

  const renderSummary = () => {
    const equipped = u.gear.equipped || {};
    const eqLines = Object.entries(equipped).map(
      ([slot, it]) => `• **${slotLabel(slot)}:** ${describeGearItem(it)}`
    );
    const aff = sumAffixes(equipped);
    const mainPct = sumMainPercents(equipped);

    const summary =
      `Cảnh giới: **${u.realm || "(chưa rõ)"}**\n` +
      `Trang bị đang mặc:\n${eqLines.join("\n")}\n\n` +
      `Tổng % dòng chính: Công +${formatPct(mainPct.atk)}% • Thủ +${formatPct(mainPct.def)}% • Tốc +${formatPct(mainPct.spd)}% • HP +${formatPct(mainPct.hp)}% • MP +${formatPct(mainPct.mp)}%\n` +
      `Tổng phụ tố: **${Object.keys(aff).length || 0}** loại`;

    return new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle("🛡️ Trang Bị")
      .setDescription(summary);
  };

  let selected = null; // { kind: 'EQ'|'BG', slot?, gid? }

  const resolveSelected = () => {
    if (!selected) return { it: null, where: "" };
    if (selected.kind === "EQ") {
      const it = u.gear.equipped?.[selected.slot] || null;
      return { it, where: `Đang mặc • ${slotLabel(selected.slot)}` };
    }
    if (selected.kind === "BG") {
      const it = (u.gear.bag || []).find((x) => x && x.gid === selected.gid) || null;
      return { it, where: `Trong túi • ${slotLabel(it?.slot || "?")}` };
    }
    return { it: null, where: "" };
  };

  const buildSelectRow = () => {
    const options = buildOptions();
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bag_gear_${msg.author.id}_${nonce}`)
        .setPlaceholder("Xem chi tiết / mặc / tháo...")
        .addOptions(options.length ? options : [{ label: "(Không có trang bị)", value: "none" }])
    );
  };

  const buildButtonRow = () => {
    if (!selected) return null;

    if (selected.kind === "BG") {
      const btnEquip = new ButtonBuilder()
        .setCustomId(`bag_equip_${msg.author.id}_${nonce}_${selected.gid}`)
        .setStyle(ButtonStyle.Success)
        .setLabel("Mặc");

      const btnClose = new ButtonBuilder()
        .setCustomId(`bag_close_${msg.author.id}_${nonce}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Đóng");

      return new ActionRowBuilder().addComponents(btnEquip, btnClose);
    }

    if (selected.kind === "EQ") {
      const btnUnequip = new ButtonBuilder()
        .setCustomId(`bag_unequip_${msg.author.id}_${nonce}_${selected.slot}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Tháo");

      const btnClose = new ButtonBuilder()
        .setCustomId(`bag_close_${msg.author.id}_${nonce}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Đóng");

      return new ActionRowBuilder().addComponents(btnUnequip, btnClose);
    }

    return null;
  };

  const renderDetail = () => {
    const { it, where } = resolveSelected();
    if (!it) return renderSummary();

    const m = tierMeta(it.tier || "pham");
    return new EmbedBuilder()
      .setColor(m.color)
      .setTitle(`${m.icon} ${it.name || "Trang bị"}`)
      .setDescription(
        `${where}\n` +
          `Phẩm giai: **${tierText(it.tier || "pham")}**\n` +
          `Dòng chính: **${describeMainLine(it)}**\n\n` +
          `**Phụ tố:**\n${describeAffixes(it)}`
      );
  };

  const render = async (sent) => {
    const rows = [buildSelectRow()];
    const btnRow = buildButtonRow();
    if (btnRow) rows.push(btnRow);
    await sent.edit({ embeds: [selected ? renderDetail() : renderSummary()], components: rows }).catch(() => {});
  };

  const sent = await msg.reply({
    embeds: [renderSummary()],
    components: [buildSelectRow()],
  });

  const col = sent.createMessageComponentCollector({ time: 120_000 });

  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) {
      return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
    }

    const cid = String(i.customId || "");

    // Select
    if (i.isStringSelectMenu() && cid.startsWith(`bag_gear_${msg.author.id}_${nonce}`)) {
      await i.deferUpdate();
      const v = i.values?.[0];
      if (!v || v === "none") return;

      if (v.startsWith("EQ:")) {
        selected = { kind: "EQ", slot: v.slice(3) };
      } else if (v.startsWith("BG:")) {
        selected = { kind: "BG", gid: v.slice(3) };
      }

      return render(sent);
    }

    // Close
    if (i.isButton() && cid === `bag_close_${msg.author.id}_${nonce}`) {
      await i.deferUpdate();
      col.stop("close");
      await sent.edit({ components: [] }).catch(() => {});
      return;
    }

    // Equip
    if (i.isButton() && cid.startsWith(`bag_equip_${msg.author.id}_${nonce}_`)) {
      await i.deferUpdate();
      const gid = cid.split(`bag_equip_${msg.author.id}_${nonce}_`)[1] || "";
      if (!gid) return;

      const users = loadUsers();
      const cur = users[msg.author.id];
      if (!cur) return;
      ensureGear(cur);

      const idx = (cur.gear.bag || []).findIndex((x) => x && x.gid === gid);
      if (idx < 0) return i.followUp({ content: "⚠️ Trang bị không còn trong túi.", ephemeral: true });

      const item = cur.gear.bag[idx];
      const slot = String(item.slot || "");
      if (!slot) return i.followUp({ content: "⚠️ Trang bị này không có slot hợp lệ.", ephemeral: true });

      // Move currently equipped back to bag
      const prev = cur.gear.equipped?.[slot] || null;
      if (prev) cur.gear.bag.push(prev);

      // Equip
      cur.gear.equipped[slot] = item;
      cur.gear.bag.splice(idx, 1);

      users[msg.author.id] = cur;
      saveUsers(users);

      u = cur;
      selected = { kind: "EQ", slot };
      return render(sent);
    }

    // Unequip
    if (i.isButton() && cid.startsWith(`bag_unequip_${msg.author.id}_${nonce}_`)) {
      await i.deferUpdate();
      const slot = cid.split(`bag_unequip_${msg.author.id}_${nonce}_`)[1] || "";
      if (!slot) return;

      const users = loadUsers();
      const cur = users[msg.author.id];
      if (!cur) return;
      ensureGear(cur);

      const it = cur.gear.equipped?.[slot] || null;
      if (!it) return i.followUp({ content: "⚠️ Slot này đang trống.", ephemeral: true });

      cur.gear.equipped[slot] = null;
      cur.gear.bag.push(it);

      users[msg.author.id] = cur;
      saveUsers(users);

      u = cur;
      selected = null;
      return render(sent);
    }
  });

  col.on("end", async () => {
    await sent.edit({ components: [] }).catch(() => {});
  });
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

async function openSkillsView(msg, user, nonce) {
  let u = user;
  ensureUserSkills(u);

  let mode = "main"; // main | equip | craft
  let selectedSlot = null; // a1..a4 | passive
  let selectedSkillId = null;
  let craftRarity = null; // rare | epic
  let craftSkillId = null;

  const slotLabel = (slot) => {
    if (slot === "passive") return "Bị động";
    const idx = Number(slot?.slice(1) || 0);
    return `Chủ động ${idx}`;
  };

  const fmtShard = (el) => {
    const shard = (u.skills?.shards?.[el] || { rare: 0, epic: 0 });
    const elTxt = elements.display[el] || el;
    return `${elTxt} • Hiếm: **${shard.rare || 0}** • Cực hiếm: **${shard.epic || 0}**`;
  };

  const equippedLine = () => {
    const eq = u.skills?.equipped || { actives: [null, null, null, null], passive: null };
    const act = (eq.actives || []).map((id, i) => {
      const sk = id ? getSkill(id) : null;
      return `• Chủ động ${i + 1}: ${sk ? `**${sk.name}**` : "_(trống)_"}`;
    });
    const pas = eq.passive ? getSkill(eq.passive) : null;
    act.push(`• Bị động: ${pas ? `**${pas.name}**` : "_(trống)_"}`);
    return act.join("\n");
  };

  const ownedSkills = () => {
    const ids = Array.isArray(u.skills?.owned) ? u.skills.owned : [];
    return ids.map((id) => getSkill(id)).filter(Boolean);
  };

  const buildEmbed = () => {
    const el = u.element || "kim";
    const elTxt = elements.display[el] || el;
    const owned = ownedSkills();
    const shardText = fmtShard(el);

    const emb = new EmbedBuilder()
      .setColor(0x8e44ad)
      .setTitle("📜 Bí Kíp")
      .setDescription(
        `Cảnh giới: **${u.realm || "(chưa rõ)"}**\n` +
          `Hệ: ${elTxt}\n\n` +
          `**Đang trang bị:**\n${equippedLine()}\n\n` +
          `**Sở hữu:** ${owned.length} bí kíp\n` +
          `**Mảnh bí kíp:** ${shardText}`
      );

    if (mode === "equip") {
      emb.addFields({
        name: "Chọn trang bị",
        value:
          `Slot: **${slotLabel(selectedSlot)}**\n` +
          `Bí kíp: ${selectedSkillId ? `**${getSkill(selectedSkillId)?.name || "?"}**` : "_(chưa chọn)_"}`,
      });
    }

    if (mode === "craft") {
      emb.addFields({
        name: "Ghép bí kíp",
        value:
          `Loại: **${craftRarity === "epic" ? "Cực hiếm" : "Hiếm"}**\n` +
          `Chọn: ${craftSkillId ? `**${getSkill(craftSkillId)?.name || "?"}**` : "_(chưa chọn)_"}`,
      });
    }

    return emb;
  };

  const buildComponents = () => {
    const rows = [];

    const closeBtn = new ButtonBuilder()
      .setCustomId(`bag_skill_close_${msg.author.id}_${nonce}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Đóng");

    if (mode === "main") {
      const mainRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`bag_skill_equip_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Primary)
          .setLabel("Trang bị"),
        new ButtonBuilder()
          .setCustomId(`bag_skill_craft_rare_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Success)
          .setLabel("Ghép (Hiếm)"),
        new ButtonBuilder()
          .setCustomId(`bag_skill_craft_epic_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Success)
          .setLabel("Ghép (Cực hiếm)"),
        closeBtn
      );
      rows.push(mainRow);
      return rows;
    }

    if (mode === "equip") {
      const slotMenu = new StringSelectMenuBuilder()
        .setCustomId(`bag_skill_slot_${msg.author.id}_${nonce}`)
        .setPlaceholder("Chọn slot...")
        .addOptions(
          { label: "Chủ động 1", value: "a1" },
          { label: "Chủ động 2", value: "a2" },
          { label: "Chủ động 3", value: "a3" },
          { label: "Chủ động 4", value: "a4" },
          { label: "Bị động", value: "passive" }
        );

      if (selectedSlot) {
        const el = u.element || "kim";
        const wantKind = selectedSlot === "passive" ? "passive" : "active";
        const list = ownedSkills().filter((s) => s.element === el && s.kind === wantKind);
        const opts = list.slice(0, 25).map((s) => ({
          label: s.name.slice(0, 100),
          value: s.id,
          description: `${s.rarity === "epic" ? "Cực hiếm" : s.rarity === "rare" ? "Hiếm" : "Thường"}`,
        }));
        if (opts.length === 0) {
          opts.push({ label: "(Không có bí kíp phù hợp)", value: "none" });
        }

        const skillMenu = new StringSelectMenuBuilder()
          .setCustomId(`bag_skill_pick_${msg.author.id}_${nonce}`)
          .setPlaceholder("Chọn bí kíp...")
          .addOptions(opts);

        rows.push(new ActionRowBuilder().addComponents(slotMenu));
        rows.push(new ActionRowBuilder().addComponents(skillMenu));

        const btnRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bag_skill_apply_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Success)
            .setLabel("Đổi"),
          new ButtonBuilder()
            .setCustomId(`bag_skill_unequip_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Danger)
            .setLabel("Tháo"),
          new ButtonBuilder()
            .setCustomId(`bag_skill_back_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Quay lại"),
          closeBtn
        );
        rows.push(btnRow);
        return rows;
      }

      rows.push(new ActionRowBuilder().addComponents(slotMenu));
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bag_skill_back_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Quay lại"),
          closeBtn
        )
      );
      return rows;
    }

    if (mode === "craft") {
      const el = u.element || "kim";
      const wantR = craftRarity || "rare";
      const list = listSkills({ element: el, rarity: wantR, kind: null }).filter((s) => !u.skills.owned.includes(s.id));

      const shard = u.skills.shards?.[el] || { rare: 0, epic: 0 };
      const okList = list.filter((s) => {
        const need = s.rarity === "epic" ? 40 : 12;
        const have = s.rarity === "epic" ? shard.epic : shard.rare;
        return have >= need;
      });

      const opts = okList.slice(0, 25).map((s) => ({
        label: s.name.slice(0, 100),
        value: s.id,
        description: `Cần ${s.rarity === "epic" ? 40 : 12} mảnh`,
      }));
      if (opts.length === 0) {
        opts.push({ label: "(Chưa đủ mảnh để ghép)", value: "none" });
      }

      const craftMenu = new StringSelectMenuBuilder()
        .setCustomId(`bag_skill_craftpick_${msg.author.id}_${nonce}`)
        .setPlaceholder("Chọn bí kíp để ghép...")
        .addOptions(opts);
      rows.push(new ActionRowBuilder().addComponents(craftMenu));

      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`bag_skill_craftdo_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Success)
            .setLabel("Ghép"),
          new ButtonBuilder()
            .setCustomId(`bag_skill_back_${msg.author.id}_${nonce}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Quay lại"),
          closeBtn
        )
      );
      return rows;
    }

    return [new ActionRowBuilder().addComponents(closeBtn)];
  };

  const sent = await msg.reply({ embeds: [buildEmbed()], components: buildComponents() });
  const col = sent.createMessageComponentCollector({ time: 180_000 });

  const refreshUser = () => {
    const users = loadUsers();
    const cur = users[msg.author.id];
    if (!cur) return null;
    ensureUserSkills(cur);
    return { users, cur };
  };

  const render = async () => {
    await sent.edit({ embeds: [buildEmbed()], components: buildComponents() }).catch(() => {});
  };

  col.on("collect", async (i) => {
    if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });

    const cid = String(i.customId || "");
    if (cid.includes(`_${msg.author.id}_${nonce}`)) await i.deferUpdate();

    // Close
    if (i.isButton() && cid === `bag_skill_close_${msg.author.id}_${nonce}`) {
      col.stop("close");
      return sent.edit({ components: [] }).catch(() => {});
    }

    // Back
    if (i.isButton() && cid === `bag_skill_back_${msg.author.id}_${nonce}`) {
      mode = "main";
      selectedSlot = null;
      selectedSkillId = null;
      craftRarity = null;
      craftSkillId = null;
      return render();
    }

    // Enter equip
    if (i.isButton() && cid === `bag_skill_equip_${msg.author.id}_${nonce}`) {
      mode = "equip";
      selectedSlot = null;
      selectedSkillId = null;
      return render();
    }

    // Slot select
    if (i.isStringSelectMenu() && cid === `bag_skill_slot_${msg.author.id}_${nonce}`) {
      selectedSlot = i.values?.[0] || null;
      selectedSkillId = null;
      return render();
    }

    // Skill pick
    if (i.isStringSelectMenu() && cid === `bag_skill_pick_${msg.author.id}_${nonce}`) {
      const v = i.values?.[0];
      if (!v || v === "none") {
        selectedSkillId = null;
      } else {
        selectedSkillId = v;
      }
      return render();
    }

    // Apply equip
    if (i.isButton() && cid === `bag_skill_apply_${msg.author.id}_${nonce}`) {
      const pack = refreshUser();
      if (!pack) return;
      const { users, cur } = pack;

      if (!selectedSlot) return i.followUp({ content: "⚠️ Chưa chọn slot.", ephemeral: true });
      if (!selectedSkillId) return i.followUp({ content: "⚠️ Chưa chọn bí kíp.", ephemeral: true });
      if (!cur.skills.owned.includes(selectedSkillId)) return i.followUp({ content: "⚠️ Bạn chưa sở hữu bí kíp này.", ephemeral: true });
      const sk = getSkill(selectedSkillId);
      if (!sk) return i.followUp({ content: "⚠️ Bí kíp không tồn tại.", ephemeral: true });
      if (sk.element !== (cur.element || "kim")) return i.followUp({ content: "⚠️ Bí kíp không cùng hệ với bạn.", ephemeral: true });
      if (selectedSlot === "passive" && sk.kind !== "passive") return i.followUp({ content: "⚠️ Slot bị động chỉ nhận bí kíp bị động.", ephemeral: true });
      if (selectedSlot !== "passive" && sk.kind !== "active") return i.followUp({ content: "⚠️ Slot chủ động chỉ nhận bí kíp chủ động.", ephemeral: true });

      if (!cur.skills.equipped) cur.skills.equipped = { actives: [null, null, null, null], passive: null };
      if (!Array.isArray(cur.skills.equipped.actives)) cur.skills.equipped.actives = [null, null, null, null];

      if (selectedSlot === "passive") {
        cur.skills.equipped.passive = selectedSkillId;
      } else {
        const idx = Math.max(0, Math.min(3, Number(selectedSlot.slice(1)) - 1));
        cur.skills.equipped.actives[idx] = selectedSkillId;
      }

      users[msg.author.id] = cur;
      saveUsers(users);
      u = cur;
      return render();
    }

    // Unequip
    if (i.isButton() && cid === `bag_skill_unequip_${msg.author.id}_${nonce}`) {
      const pack = refreshUser();
      if (!pack) return;
      const { users, cur } = pack;

      if (!selectedSlot) return i.followUp({ content: "⚠️ Chưa chọn slot.", ephemeral: true });

      if (!cur.skills.equipped) cur.skills.equipped = { actives: [null, null, null, null], passive: null };
      if (!Array.isArray(cur.skills.equipped.actives)) cur.skills.equipped.actives = [null, null, null, null];

      if (selectedSlot === "passive") {
        cur.skills.equipped.passive = null;
      } else {
        const idx = Math.max(0, Math.min(3, Number(selectedSlot.slice(1)) - 1));
        cur.skills.equipped.actives[idx] = null;
      }

      users[msg.author.id] = cur;
      saveUsers(users);
      u = cur;
      return render();
    }

    // Craft buttons
    if (i.isButton() && cid === `bag_skill_craft_rare_${msg.author.id}_${nonce}`) {
      mode = "craft";
      craftRarity = "rare";
      craftSkillId = null;
      return render();
    }
    if (i.isButton() && cid === `bag_skill_craft_epic_${msg.author.id}_${nonce}`) {
      mode = "craft";
      craftRarity = "epic";
      craftSkillId = null;
      return render();
    }

    if (i.isStringSelectMenu() && cid === `bag_skill_craftpick_${msg.author.id}_${nonce}`) {
      const v = i.values?.[0];
      craftSkillId = !v || v === "none" ? null : v;
      return render();
    }

    if (i.isButton() && cid === `bag_skill_craftdo_${msg.author.id}_${nonce}`) {
      const pack = refreshUser();
      if (!pack) return;
      const { users, cur } = pack;
      if (!craftSkillId) return i.followUp({ content: "⚠️ Chưa chọn bí kíp để ghép.", ephemeral: true });
      const res = craftSkill(cur, craftSkillId);
      if (!res.ok) return i.followUp({ content: res.message || "❌ Ghép thất bại.", ephemeral: true });

      users[msg.author.id] = cur;
      saveUsers(users);
      u = cur;
      mode = "main";
      craftSkillId = null;
      craftRarity = null;
      return sent
        .edit({ content: `✅ ${res.message}`, embeds: [buildEmbed()], components: buildComponents() })
        .catch(() => {});
    }
  });

  col.on("end", async () => {
    await sent.edit({ components: [] }).catch(() => {});
  });
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
    ensureUserSkills(user);
    const changed = ensureGearIds(user);
    users[msg.author.id] = user;
    if (changed) saveUsers(users);
    else saveUsers(users);

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
        { label: "📜 Bí kíp", value: "skills", description: "Xem/Trang bị/Ghép bí kíp" },
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
      if (choice === "skills") return openSkillsView(msg, user, nonce);
      if (choice === "gear") return openGearView(msg, user, nonce);
      if (choice === "legacy") return openLegacyInventory(msg, user);
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};
