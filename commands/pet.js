// commands/pet.js
// UI bằng menu/button (section) — theo yêu cầu

const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const REALMS = require("../utils/realms");
const {
  PET_EGG_ITEM_ID,
  listPets,
  getPetMeta,
  getPetImagePath,
  ensurePetShape,
  applyPetIdle,
  hatchEggs,
  equipPet,
  setPetJob,
  breakthroughPet,
  getPetLevelCap,
  SHARDS_PER_PET,
} = require("../utils/petSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function pct(n, d) {
  if (!d) return "0%";
  return `${Math.floor((n / d) * 100)}%`;
}

function shortMapLines(obj, maxLines = 6, fmtFn = (k, v) => `${k}: ${v}`) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return "—";
  const lines = entries.slice(0, maxLines).map(([k, v]) => fmtFn(k, v));
  if (entries.length > maxLines) lines.push(`… +${entries.length - maxLines} loại`);
  return lines.join("\n");
}

function petRealmLabel(realm) {
  const r = Math.max(1, Math.floor(Number(realm) || 1));
  const name = Array.isArray(REALMS) ? REALMS[r - 1] : null;
  // Pet realm có thể vượt danh sách cảnh giới hiện có -> fallback giữ số
  return name ? `${name} (C${r})` : `C${r}`;
}

function petStateLine(pid, st) {
  const meta = getPetMeta(pid);
  const name = meta?.name || pid;
  const cap = getPetLevelCap(st.realm);
  return `• **${name}** ×${st.count} (${petRealmLabel(st.realm)}, Lv${st.level}/${cap})`;
}

function ownedPetsLines(user) {
  const pets = user.pet?.pets || {};
  const ids = Object.keys(pets).filter((id) => (pets[id]?.count || 0) > 0);
  if (!ids.length) return "—";
  return ids
    .slice(0, 10)
    .map((id) => petStateLine(id, pets[id]))
    .join("\n");
}

function shardsLines(user) {
  const shards = user.pet?.shards || {};
  const ids = Object.keys(shards).filter((id) => (shards[id] || 0) > 0);
  if (!ids.length) return "—";
  return ids
    .slice(0, 10)
    .map((id) => {
      const meta = getPetMeta(id);
      const name = meta?.name || id;
      const v = shards[id] || 0;
      return `• **${name}**: ${v}/${SHARDS_PER_PET}`;
    })
    .join("\n");
}

function actionMenuRow(customId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Chọn một khu vực...")
      .addOptions([
        { label: "Thông tin", value: "info", description: "Xem trạng thái linh thú" },
        { label: "Ấp trứng", value: "hatch", description: "Mở trứng linh thú" },
        { label: "Xuất chiến", value: "equip", description: "Chọn linh thú đồng hành" },
        { label: "Công việc", value: "job", description: "Khai khoáng / thăm dò / nghỉ ngơi" },
        { label: "Đột phá", value: "break", description: "Tăng cảnh giới (tiêu hao bản sao)" },
      ])
  );
}

function backRow(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel("⬅️ Quay lại").setStyle(ButtonStyle.Secondary)
  );
}

function jobRow(customId, current) {
  const mk = (job, label) =>
    new ButtonBuilder()
      .setCustomId(`${customId}:${job}`)
      .setLabel(label)
      .setStyle(job === current ? ButtonStyle.Success : ButtonStyle.Primary);

  return new ActionRowBuilder().addComponents(
    mk("mine", "⛏️ Khai khoáng"),
    mk("explore", "🧭 Thăm dò"),
    mk("rest", "😴 Nghỉ ngơi")
  );
}

function hatchRow(customId, haveEggs) {
  const mk = (n) =>
    new ButtonBuilder()
      .setCustomId(`${customId}:${n}`)
      .setLabel(`🥚 ×${n}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(haveEggs < n);

  return new ActionRowBuilder().addComponents(mk(1), mk(5), mk(10), mk(25));
}

function equipMenuRow(customId, user) {
  const pets = user.pet?.pets || {};
  const ids = Object.keys(pets).filter((id) => (pets[id]?.count || 0) > 0);
  if (!ids.length) return null;

  const options = ids.slice(0, 25).map((id) => {
    const st = pets[id];
    const meta = getPetMeta(id);
    const label = `${meta?.name || id} ×${st.count}`.slice(0, 100);
    const cap = getPetLevelCap(st.realm);
    return {
      label,
      value: id,
      description: `${petRealmLabel(st.realm)} • Lv${st.level}/${cap}`.slice(0, 100),
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("Chọn linh thú đồng hành...").addOptions(options)
  );
}

function buildInfoEmbed(user, tickSummary, attachName) {
  const activeId = user.pet?.activePetId;
  const active = activeId ? user.pet.pets?.[activeId] : null;
  const meta = activeId ? getPetMeta(activeId) : null;

  const emb = new EmbedBuilder().setTitle("🐾 Linh Thú Đồng Hành").setColor(0xF1C40F);

  const eggs = user.inventory?.[PET_EGG_ITEM_ID] || 0;
  const buf = Math.floor(user.pet?.feedBufferXp || 0);

  emb.setDescription(
    `Linh thạch: **${fmtLT(user.lt)}**
` +
      `Trứng linh thú: **${eggs}**
` +
      (buf > 0 ? `Kinh nghiệm cá đang chờ hấp thụ: **${buf}**
` : "") +
      `
Chọn một mục để tiếp tục bồi dưỡng.`
  );

  if (active && meta) {
    emb.addFields(
      {
        name: "⭐ Linh thú đang xuất chiến",
        value:
          `**${meta.name}**\n` +
          `Cảnh giới: **${petRealmLabel(active.realm)}** · Cấp: **${active.level}/${getPetLevelCap(active.realm)}**\n` +
          `Đói: **${active.hunger}/100** · Thể lực: **${active.stamina}/100**\n` +
          `Công việc: **${active.job}**`,
        inline: false,
      },
      { name: "📦 Linh thú đang có", value: ownedPetsLines(user), inline: false },
      { name: "🧩 Mảnh linh thú", value: shardsLines(user), inline: false }
    );

    if (attachName) {
      emb.setThumbnail(`attachment://${attachName}`);
    }
  } else {
    emb.addFields(
      { name: "⭐ Linh thú đang xuất chiến", value: "— (chưa có hoặc chưa xuất chiến)", inline: false },
      { name: "📦 Linh thú đang có", value: ownedPetsLines(user), inline: false },
      { name: "🧩 Mảnh linh thú", value: shardsLines(user), inline: false }
    );
  }

  if (tickSummary?.summary && tickSummary.ticks > 0) {
    const s = tickSummary.summary;
    const oresTxt = shortMapLines(s.ores, 6, (k, v) => `• ${k}: ${v}`);
    const shardsTxt = shortMapLines(s.shards, 6, (k, v) => `• ${getPetMeta(k)?.name || k}: ${v}`);

    emb.addFields({
      name: "⏱️ Thu hoạch khi vắng mặt",
      value:
        `Áp dụng: **${s.ticksApplied} lượt** (công việc: **${s.job}**)
` +
        (s.ltGained ? `+${fmtLT(s.ltGained)} LT
` : "") +
        (Object.keys(s.ores || {}).length ? `Khoáng thạch:
${oresTxt}
` : "") +
        (Object.keys(s.shards || {}).length ? `Mảnh nhận được:
${shardsTxt}
` : "") +
        (s.stoppedBy ? `Dừng vì: **${s.stoppedBy}**` : ""),
      inline: false,
    });
  }

  return emb;
}

function buildHatchEmbed(user) {
  const eggs = user.inventory?.[PET_EGG_ITEM_ID] || 0;
  return new EmbedBuilder()
    .setTitle("🥚 Ấp Trứng Linh Thú")
    .setColor(0x9B59B6)
    .setDescription(`Đạo hữu đang có **${eggs}** trứng.
Chọn số lượng muốn ấp.`);
}

function buildEquipEmbed(user) {
  const activeId = user.pet?.activePetId;
  const activeName = activeId ? getPetMeta(activeId)?.name : null;
  return new EmbedBuilder()
    .setTitle("⭐ Linh Thú Xuất Chiến")
    .setColor(0x2ECC71)
    .setDescription(`Đang xuất chiến: **${activeName || "—"}**
Chọn một linh thú để đồng hành.`);
}

function buildJobEmbed(user) {
  const pid = user.pet?.activePetId;
  const st = pid ? user.pet.pets?.[pid] : null;
  const name = pid ? getPetMeta(pid)?.name : null;

  return new EmbedBuilder()
    .setTitle("🧭 Công Việc")
    .setColor(0x3498DB)
    .setDescription(
      `Linh thú: **${name || "—"}**
` +
        `Công việc hiện tại: **${st?.job || "—"}**

` +
        `- **mine**: đi khai khoáng
` +
        `- **explore**: thăm dò khu vực
` +
        `- **rest**: nghỉ ngơi hồi thể lực`
    );
}

function buildBreakEmbed(user) {
  const pid = user.pet?.activePetId;
  if (!pid) {
    return new EmbedBuilder().setTitle("⬆️ Đột phá").setColor(0xE67E22).setDescription("Đạo hữu chưa có linh thú xuất chiến.");
  }

  const st = user.pet.pets?.[pid];
  const meta = getPetMeta(pid);
  const needTotal = (st?.realm || 1) + 1;
  const consume = st?.realm || 1;
  const capLv = getPetLevelCap(st?.realm || 1);

  return new EmbedBuilder()
    .setTitle("⬆️ Đột phá")
    .setColor(0xE67E22)
    .setDescription(
      `**${meta?.name || pid}**\n` +
        `Cảnh giới hiện tại: **${petRealmLabel(st?.realm || 1)}**\n\n` +
        `Yêu cầu cấp: **Lv ${st?.level || 1}/${capLv}** (đủ cấp mới đột phá)\n` +
        `Yêu cầu: tổng **${needTotal}** bản cùng loại.\n` +
        `Tiêu hao khi đột phá: **${consume}** bản.`
    );
}

function breakRow(customId, canBreak) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel("⬆️ Đột phá")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!canBreak)
  );
}

module.exports = {
  name: "pet",
  aliases: ["linhthu", "thu"],
  description: "Linh thú: ấp trứng, xuất chiến, công việc, đột phá.",
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");

    ensurePetShape(u);

    const baseId = `petui_${msg.author.id}_${Date.now()}`;
    const actionId = `${baseId}:action`;
    const backId = `${baseId}:back`;

    let view = "info";
    let lastNote = "";

    let lastTick = null;

    const render = () => {
      const curUsers = loadUsers();
      const cur = curUsers[msg.author.id];
      if (!cur) return { content: "❌ Đạo hữu chưa nhập đạo.", embeds: [], components: [] };

      ensurePetShape(cur);

      // Lazy tick: chỉ chạy trong luồng pet UI (theo yêu cầu)
      // Nếu có tick > 0 thì phải persist ngay, tránh mất tiến trình.
      try {
        const tickRes = applyPetIdle(cur, Date.now());
        if (tickRes?.ticks > 0) {
          curUsers[msg.author.id] = cur;
          saveUsers(curUsers);
        }
        lastTick = tickRes;
      } catch {
        // ignore tick errors để UI không sập
      }

      // attach image cho info/equip (nếu có active)
      let files = [];
      let attachName = null;
      const pid = cur.pet.activePetId;
      if (pid) {
        const imgPath = getPetImagePath(pid);
        if (imgPath) {
          attachName = path.basename(imgPath);
          try {
            files = [new AttachmentBuilder(imgPath)];
          } catch {
            files = [];
            attachName = null;
          }
        }
      }

      let embeds = [];
      let components = [actionMenuRow(actionId)];

      if (view === "info") {
        embeds = [buildInfoEmbed(cur, lastTick, attachName)];
      } else if (view === "hatch") {
        embeds = [buildHatchEmbed(cur)];
        const eggs = cur.inventory?.[PET_EGG_ITEM_ID] || 0;
        components = [actionMenuRow(actionId), hatchRow(`${baseId}:hatch`, eggs), backRow(backId)];
      } else if (view === "equip") {
        embeds = [buildEquipEmbed(cur)];
        const row = equipMenuRow(`${baseId}:equip`, cur);
        components = [actionMenuRow(actionId), ...(row ? [row] : []), backRow(backId)];
        if (!row) embeds[0].setDescription("Đạo hữu chưa có linh thú nào. Ghé `-shop` để tìm trứng phù hợp.");
      } else if (view === "job") {
        embeds = [buildJobEmbed(cur)];
        const current = cur.pet.activePetId ? cur.pet.pets?.[cur.pet.activePetId]?.job : null;
        components = [actionMenuRow(actionId), jobRow(`${baseId}:job`, current), backRow(backId)];
      } else if (view === "break") {
        embeds = [buildBreakEmbed(cur)];
        const pid2 = cur.pet.activePetId;
        const st = pid2 ? cur.pet.pets?.[pid2] : null;
        const needTotal = (st?.realm || 1) + 1;
        const capLv = st ? getPetLevelCap(st.realm) : 0;
        const canBreak = !!(st && (st.count || 0) >= needTotal && (st.level || 1) >= capLv);
        components = [actionMenuRow(actionId), breakRow(`${baseId}:break`, canBreak), backRow(backId)];
      }

      if (lastNote) {
        embeds[0].setFooter({ text: lastNote });
      }

      return { embeds, components, files };
    };

    const sent = await msg.reply(render()).catch(() => null);
    if (!sent) return;

    const collector = sent.createMessageComponentCollector({
      time: 180_000,
    });

    collector.on("collect", async (i) => {
      try {
        if (i.user.id !== msg.author.id) {
          return i.reply({ content: "❌ Đây không phải linh thú giới của đạo hữu.", ephemeral: true });
        }

        if (!String(i.customId || "").startsWith(baseId)) return;

        // ACK nhanh
        await i.deferUpdate();

        const users2 = loadUsers();
        const u2 = users2[msg.author.id];
        if (!u2) {
          lastNote = "Dữ liệu nhân vật không tồn tại.";
          collector.stop("nochar");
          return;
        }

        ensurePetShape(u2);

        // === Menu chọn view ===
        if (i.customId === actionId && i.isStringSelectMenu()) {
          view = i.values?.[0] || "info";
          lastNote = "";
          return sent.edit(render()).catch(() => {});
        }

        // === Back ===
        if (i.customId === backId && i.isButton()) {
          view = "info";
          lastNote = "";
          return sent.edit(render()).catch(() => {});
        }

        // === Hatch ===
        if (i.customId.startsWith(`${baseId}:hatch:`) && i.isButton()) {
          const n = Number(i.customId.split(":").pop());
          const res = hatchEggs(u2, n);
          if (!res.ok) {
            lastNote = res.message;
            return sent.edit(render()).catch(() => {});
          }

          // save
          users2[msg.author.id] = u2;
          saveUsers(users2);

          const r = res.result;
          const petTxt = shortMapLines(r.pets, 6, (k, v) => `• ${getPetMeta(k)?.name || k}: ${v}`);
          const shardTxt = shortMapLines(r.shards, 6, (k, v) => `• ${getPetMeta(k)?.name || k}: +${v}`);
          const craftTxt = shortMapLines(r.crafted, 6, (k, v) => `• ${getPetMeta(k)?.name || k}: +${v}`);

          lastNote = `Ấp ${r.eggs} trứng • Trắng tay: ${r.nothing}`;

          // show kết quả ngay trong embed bằng cách append field
          const payload = render();
          if (payload.embeds?.[0]) {
            payload.embeds[0].addFields(
              { name: "Kết quả", value: `Trắng tay: **${r.nothing}**`, inline: false },
              { name: "Nhận pet", value: petTxt, inline: true },
              { name: "Nhận mảnh", value: shardTxt, inline: true },
              { name: "Ghép đủ", value: craftTxt, inline: true }
            );
          }
          return sent.edit(payload).catch(() => {});
        }

        // === Equip ===
        if (i.customId === `${baseId}:equip` && i.isStringSelectMenu()) {
          const pid = i.values?.[0];
          const res = equipPet(u2, pid);
          lastNote = res.message;
          users2[msg.author.id] = u2;
          saveUsers(users2);
          view = "info";
          return sent.edit(render()).catch(() => {});
        }

        // === Job ===
        if (i.customId.startsWith(`${baseId}:job:`) && i.isButton()) {
          const job = i.customId.split(":").pop();
          const res = setPetJob(u2, job);
          lastNote = res.message;
          users2[msg.author.id] = u2;
          saveUsers(users2);
          view = "info";
          return sent.edit(render()).catch(() => {});
        }

        // === Breakthrough ===
        if (i.customId === `${baseId}:break` && i.isButton()) {
          const res = breakthroughPet(u2);
          lastNote = res.message;
          users2[msg.author.id] = u2;
          saveUsers(users2);
          view = "info";
          return sent.edit(render()).catch(() => {});
        }
      } catch (e) {
        console.error("pet ui error:", e);
        try {
          await sent.edit({ content: "⚠️ Có lỗi xảy ra trong giao diện linh thú.", components: [] }).catch(() => {});
        } catch {}
      }
    });

    collector.on("end", async () => {
      try {
        await sent.edit({ components: [] }).catch(() => {});
      } catch {}
    });
  },
};
