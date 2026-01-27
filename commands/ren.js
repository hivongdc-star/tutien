// commands/ren.js
// Rèn đúc trang bị (UI select menu): chọn slot -> chọn 5 khoáng -> đang rèn -> nhận trang bị.

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { loadOreDB, getOreById } = require("../utils/mining");
const { TIERS, tierMeta, tierText } = require("../utils/tiers");
const { createGearFromOres, formatGearLines } = require("../utils/forge");
const { AFFIX_LABELS } = require("../utils/statsView");


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

function slotLabel(slot) {
  if (slot === "weapon") return "Vũ khí";
  if (slot === "armor") return "Giáp";
  if (slot === "boots") return "Giày";
  if (slot === "bracelet") return "Vòng tay";
  return slot;
}

function tierIdx(t) {
  const i = TIERS.indexOf(t);
  return i >= 0 ? i : 0;
}

function countTotalOres(user) {
  const ores = user?.mining?.ores || {};
  let sum = 0;
  for (const q of Object.values(ores)) sum += Math.max(0, Number(q) || 0);
  return sum;
}

function buildOreList(user, selectedCounts, filterTier) {
  loadOreDB();
  const ores = user?.mining?.ores || {};
  const entries = Object.entries(ores)
    .map(([id, q]) => ({ id, qty: Math.max(0, Number(q) || 0), ore: getOreById(id) }))
    .filter((x) => x.qty > 0 && x.ore);

  let list = entries;
  if (filterTier && filterTier !== "all") {
    list = list.filter((x) => x.ore.tier === filterTier);
  }

  list.sort((a, b) => {
    const ta = tierIdx(a.ore.tier);
    const tb = tierIdx(b.ore.tier);
    if (ta !== tb) return tb - ta;
    return String(a.ore.name).localeCompare(String(b.ore.name));
  });

  const options = list.slice(0, 25).map((x) => {
    const used = Math.max(0, Number(selectedCounts[x.id]) || 0);
    const left = Math.max(0, x.qty - used);
    const m = tierMeta(x.ore.tier);
    return {
      label: `${m.icon} ${x.ore.name}`.slice(0, 100),
      value: x.id,
      description: `${tierText(x.ore.tier)} • còn x${left}`.slice(0, 100),
    };
  });

  const needFilter = entries.length > 25;
  return { options, needFilter };
}

function buildSelectedText(oreIds) {
  if (!oreIds.length) return "(Chưa chọn)";
  const lines = oreIds.map((id, idx) => {
    const o = getOreById(id);
    if (!o) return `• #${idx + 1}: ${id}`;
    const m = tierMeta(o.tier);
    return `• #${idx + 1}: ${m.icon} ${o.name} (${tierText(o.tier)})`;
  });
  return lines.join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  name: "ren",
  aliases: ["forge", "rendu", "renduc"],
  description: "Rèn trang bị bằng 5 khoáng thạch (UI chọn slot + chọn đá).",
  run: async (client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureMining(user);
    ensureGear(user);

    if (countTotalOres(user) < 5) {
      return msg.reply("🪨 Bạn chưa đủ khoáng thạch để rèn (cần **5 viên**). Dùng `-dao` để khai khoáng.");
    }

    const nonce = `${Date.now()}`;
    const embed = new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle("🛠️ Rèn Đúc")
      .setDescription("Chọn **loại trang bị** muốn rèn.");

    const slotMenu = new StringSelectMenuBuilder()
      .setCustomId(`forge_slot_${msg.author.id}_${nonce}`)
      .setPlaceholder("Chọn slot trang bị...")
      .addOptions(
        { label: "⚔️ Vũ khí", value: "weapon", description: "Dòng chính: Công (%)" },
        { label: "🛡️ Giáp", value: "armor", description: "Dòng chính: Thủ (%)" },
        { label: "👢 Giày", value: "boots", description: "Dòng chính: Tốc (%)" },
        { label: "🧿 Vòng tay", value: "bracelet", description: "Dòng chính: HP/MP (%)" }
      );

    const sent = await msg.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(slotMenu)],
    });

    const slotCollector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60_000,
    });

    slotCollector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
      await i.deferUpdate();

      const slot = i.values[0];
      slotCollector.stop("slot-picked");

      // tắt menu slot
      await sent.edit({ components: [] }).catch(() => {});

      // bước chọn đá (message mới)
      const picked = [];
      const selectedCounts = {};
      let filterTier = "all";

      const buildRows = () => {
        const { options, needFilter } = buildOreList(user, selectedCounts, filterTier);

        const rows = [];

        if (needFilter) {
          const tierMenu = new StringSelectMenuBuilder()
            .setCustomId(`forge_filter_${msg.author.id}_${nonce}`)
            .setPlaceholder("Lọc theo phẩm giai...")
            .addOptions(
              { label: "Tất cả", value: "all" },
              { label: "Phàm", value: "pham" },
              { label: "Linh", value: "linh" },
              { label: "Hoàng", value: "hoang" },
              { label: "Huyền", value: "huyen" },
              { label: "Địa", value: "dia" },
              { label: "Thiên", value: "thien" },
              { label: "Tiên", value: "tien" },
              { label: "Thần", value: "than" }
            );

          rows.push(new ActionRowBuilder().addComponents(tierMenu));
        }

        const oreMenu = new StringSelectMenuBuilder()
          .setCustomId(`forge_pick_${msg.author.id}_${nonce}`)
          .setPlaceholder("Chọn 1 khoáng thạch để thêm vào mẻ rèn...")
          .addOptions(options.length ? options : [{ label: "Không có khoáng thạch phù hợp", value: "none" }]);

        rows.push(new ActionRowBuilder().addComponents(oreMenu));

        const btnDone = new ButtonBuilder()
          .setCustomId(`forge_done_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Success)
          .setLabel("Rèn")
          .setDisabled(picked.length !== 5);

        const btnUndo = new ButtonBuilder()
          .setCustomId(`forge_undo_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel("Hoàn tác")
          .setDisabled(picked.length === 0);

        const btnCancel = new ButtonBuilder()
          .setCustomId(`forge_cancel_${msg.author.id}_${nonce}`)
          .setStyle(ButtonStyle.Danger)
          .setLabel("Huỷ");

        rows.push(new ActionRowBuilder().addComponents(btnDone, btnUndo, btnCancel));

        return rows;
      };

      const buildEmbed = () => {
        const desc =
          `Slot: **${slotLabel(slot)}**\n` +
          `Đã chọn: **${picked.length}/5**\n\n` +
          `**Khoáng thạch đã chọn:**\n${buildSelectedText(picked)}`;

        return new EmbedBuilder()
          .setColor(0xF39C12)
          .setTitle("🛠️ Rèn Đúc — Chọn Khoáng")
          .setDescription(desc);
      };

      const forgeMsg = await msg.reply({ embeds: [buildEmbed()], components: buildRows() });

      const collector = forgeMsg.createMessageComponentCollector({ time: 120_000 });

      const refresh = async () => {
        await forgeMsg.edit({ embeds: [buildEmbed()], components: buildRows() }).catch(() => {});
      };

      collector.on("collect", async (j) => {
        if (j.user.id !== msg.author.id) return j.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });

        const cid = String(j.customId || "");

        // Lọc theo phẩm giai
        if (cid.startsWith(`forge_filter_${msg.author.id}_${nonce}`)) {
          await j.deferUpdate();
          filterTier = j.values[0] || "all";
          return refresh();
        }

        // Chọn khoáng
        if (cid.startsWith(`forge_pick_${msg.author.id}_${nonce}`)) {
          await j.deferUpdate();
          const id = j.values[0];
          if (!id || id === "none") return;
          if (picked.length >= 5) return;

          const ore = getOreById(id);
          if (!ore) return j.followUp({ content: "⚠️ Khoáng thạch không hợp lệ.", ephemeral: true });

          const owned = Math.max(0, Number(user.mining.ores?.[id]) || 0);
          const used = Math.max(0, Number(selectedCounts[id]) || 0);
          if (used >= owned) {
            return j.followUp({ content: "⚠️ Bạn không còn đủ khoáng thạch này.", ephemeral: true });
          }

          picked.push(id);
          selectedCounts[id] = used + 1;
          return refresh();
        }

        // Hoàn tác
        if (cid === `forge_undo_${msg.author.id}_${nonce}`) {
          await j.deferUpdate();
          if (!picked.length) return;
          const last = picked.pop();
          if (last) selectedCounts[last] = Math.max(0, (Number(selectedCounts[last]) || 0) - 1);
          return refresh();
        }

        // Huỷ
        if (cid === `forge_cancel_${msg.author.id}_${nonce}`) {
          await j.deferUpdate();
          collector.stop("cancel");
          await forgeMsg.edit({ components: [] }).catch(() => {});
          return;
        }

        // Rèn
        if (cid === `forge_done_${msg.author.id}_${nonce}`) {
          await j.deferUpdate();
          if (picked.length !== 5) {
            return j.followUp({ content: "⚠️ Cần chọn đủ **5** khoáng thạch.", ephemeral: true });
          }

          collector.stop("done");
          await forgeMsg
            .edit({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xF39C12)
                  .setTitle("🛠️ Đang rèn...")
                  .setDescription(`Slot: **${slotLabel(slot)}**\n\n${buildSelectedText(picked)}`),
              ],
              components: [],
            })
            .catch(() => {});

          // Re-load để tránh race
          const latest = loadUsers();
          const u = latest[msg.author.id];
          if (!u) return;
          ensureMining(u);
          ensureGear(u);

          const needCounts = {};
          for (const id of picked) needCounts[id] = (needCounts[id] || 0) + 1;

          for (const [id, need] of Object.entries(needCounts)) {
            const have = Math.max(0, Number(u.mining.ores?.[id]) || 0);
            if (have < need) {
              await forgeMsg
                .edit({
                  embeds: [
                    new EmbedBuilder()
                      .setColor(0xE74C3C)
                      .setTitle("❌ Rèn thất bại")
                      .setDescription("Khoáng thạch đã thay đổi (không đủ số lượng). Hãy mở `-bag` kiểm tra lại."),
                  ],
                  components: [],
                })
                .catch(() => {});
              return;
            }
          }

          // Trừ khoáng
          for (const [id, need] of Object.entries(needCounts)) {
            u.mining.ores[id] = Math.max(0, (Number(u.mining.ores[id]) || 0) - need);
            if (u.mining.ores[id] === 0) delete u.mining.ores[id];
          }

          // Tạo trang bị
          const item = createGearFromOres({ slot, oreIds: picked });
          u.gear.bag.push(item);

          latest[msg.author.id] = u;
          saveUsers(latest);

          // Hiệu ứng rèn
          const delay = 1200 + Math.floor(Math.random() * 900);
          await sleep(delay);

          const { title, mainLine, aff } = formatGearLines(item);
          const affLines = aff.length
            ? aff
                .map((x) => {
                  const label = AFFIX_LABELS[x.k] || x.k;
                  return `${label} +${Number(x.v) || 0}%`;
                })
                .join("\n")
            : "(Không có)";

          const m = tierMeta(item.tier);
          const result = new EmbedBuilder()
            .setColor(m.color)
            .setTitle(title)
            .setDescription(
              `**Dòng chính**\n${mainLine}\n\n` +
                `**Phụ tố**\n${affLines}\n\n` +
                `✅ Đã đưa vào **túi trang bị**. Mở \`-bag\` → **Trang bị** để xem chi tiết.`
            );

          await forgeMsg.edit({ embeds: [result], components: [] }).catch(() => {});
        }
      });

      collector.on("end", async () => {
        await forgeMsg.edit({ components: [] }).catch(() => {});
      });
    });

    slotCollector.on("end", async () => {
      await sent.edit({ components: [] }).catch(() => {});
    });
  },
};
