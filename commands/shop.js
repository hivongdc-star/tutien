// commands/shop.js
// Shop: Khoáng cụ + Bí kíp (kỹ năng theo ngũ hành) + Trứng Linh Thú.

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { listItems, buyItem } = require("../shop/shopUtils");
const { loadUsers, saveUsers } = require("../utils/storage");
const elements = require("../utils/element");
const {
  listSkills,
  getSkill,
  ensureUserSkills,
  addOwnedSkill,
  describeSkillShort,
} = require("../utils/skills");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function menuRow(customId, placeholder, options) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options)
  );
  return row;
}

function shorten100(s) {
  const str = String(s || "").replace(/\s+/g, " ").trim();
  if (str.length <= 100) return str;
  return str.slice(0, 97).trimEnd() + "…";
}

module.exports = {
  name: "shop",
  aliases: ["s"],
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureUserSkills(u);
    saveUsers(users);

    const catId = `shopcat_${msg.author.id}`;
    const pickId = `shoppick_${msg.author.id}`;

    const catOptions = [
      { label: "Khoáng cụ", value: "tools", description: "Mua pháp khí đào khoáng" },
      { label: "Bí kíp", value: "skills", description: "Kỹ năng theo ngũ hành" },
      { label: "Trứng Linh Thú", value: "pets", description: "Mua trứng để ấp linh thú" },
    ];

    const header = new EmbedBuilder()
      .setTitle("🛒 Linh Bảo Các")
      .setColor(0x3498db)
      .setDescription(`Linh thạch hiện có: **${fmtLT(u.lt)}** 💎\n\nChọn mục mua sắm:`);

    const sent = await msg.reply({
      embeds: [header],
      components: [menuRow(catId, "Chọn mục...", catOptions)],
    });

    let mode = null; // tools | skills | pets

    const col = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 120_000,
    });

    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Không phải menu của bạn.", ephemeral: true });
      await i.deferUpdate();

      const users2 = loadUsers();
      const u2 = users2[msg.author.id];
      if (!u2) {
        col.stop("nochar");
        return;
      }
      ensureUserSkills(u2);

      if (i.customId === catId) {
        mode = i.values[0];

        if (mode === "tools") {
          const catalog = listItems();
          const entries = Object.entries(catalog).filter(([, it]) => it.type === "mining_tool");
          const options = entries.slice(0, 25).map(([id, it]) => ({
            label: `${it.emoji || ""} ${it.name}`.trim().slice(0, 100),
            value: `tool:${id}`,
            description: `${fmtLT(it.price || 0)} LT • ${it.tier || ""}`.slice(0, 100),
          }));

          const emb = new EmbedBuilder()
            .setTitle("🛒 Linh Bảo Các • Khoáng cụ")
            .setColor(0x2ecc71)
            .setDescription(`Linh thạch hiện có: **${fmtLT(u2.lt)}** 💎\nChọn pháp khí để mua.`);

          return sent
            .edit({ embeds: [emb], components: [menuRow(pickId, "Chọn khoáng cụ...", options)] })
            .catch(() => {});
        }

        if (mode === "pets") {
          const catalog = listItems();
          const entries = Object.entries(catalog).filter(([, it]) => it.type === "pet_egg");
          if (!entries.length) {
            const emb = new EmbedBuilder()
              .setTitle("🛒 Linh Bảo Các • Trứng Linh Thú")
              .setColor(0xF1C40F)
              .setDescription("Hiện chưa có trứng linh thú nào trong shop.");
            return sent.edit({ embeds: [emb], components: [] }).catch(() => {});
          }

          const options = entries.slice(0, 25).map(([id, it]) => ({
            label: `${it.emoji || ""} ${it.name}`.trim().slice(0, 100),
            value: `egg:${id}`,
            description: `${fmtLT(it.price || 0)} LT`.slice(0, 100),
          }));

          const emb = new EmbedBuilder()
            .setTitle("🛒 Linh Bảo Các • Trứng Linh Thú")
            .setColor(0xF1C40F)
            .setDescription(`Linh thạch hiện có: **${fmtLT(u2.lt)}** 💎\nChọn trứng để mua.`);

          return sent
            .edit({ embeds: [emb], components: [menuRow(pickId, "Chọn trứng...", options)] })
            .catch(() => {});
        }

        if (mode === "skills") {
          const el = u2.element || "kim";
          const skillList = listSkills({ element: el, rarity: "common", kind: null });
          if (!skillList.length) {
            const emb = new EmbedBuilder()
              .setTitle("🛒 Linh Bảo Các • Bí kíp")
              .setColor(0x9b59b6)
              .setDescription("Hiện chưa có bí kíp phù hợp.");
            return sent.edit({ embeds: [emb], components: [] }).catch(() => {});
          }

          const options = skillList.slice(0, 25).map((s) => ({
            label: s.name.slice(0, 100),
            value: `skill:${s.id}`,
            description: shorten100(`${fmtLT(s.price)} LT • ${describeSkillShort(s)}`),
          }));

          const emb = new EmbedBuilder()
            .setTitle("🛒 Linh Bảo Các • Bí kíp")
            .setColor(0x9b59b6)
            .setDescription(
              `Hệ: ${elements.display[el] || el}\n` +
                `Linh thạch hiện có: **${fmtLT(u2.lt)}** 💎\n\n` +
                `Chọn bí kíp để mua (chỉ bán **thường**).`
            );

          return sent
            .edit({ embeds: [emb], components: [menuRow(pickId, "Chọn bí kíp...", options)] })
            .catch(() => {});
        }
      }

      if (i.customId === pickId) {
        const val = i.values[0];
        if (!val) return;

        // TOOL
        if (val.startsWith("tool:")) {
          const itemId = val.slice("tool:".length);
          const res = buyItem(msg.author.id, itemId);
          return sent.edit({ content: res.message, embeds: [], components: [] }).catch(() => {});
        }

        // EGG
        if (val.startsWith("egg:")) {
          const itemId = val.slice("egg:".length);
          const res = buyItem(msg.author.id, itemId);
          return sent.edit({ content: res.message, embeds: [], components: [] }).catch(() => {});
        }

        // SKILL
        if (val.startsWith("skill:")) {
          const skillId = val.slice("skill:".length);
          const sk = getSkill(skillId);
          if (!sk) return sent.edit({ content: "❌ Bí kíp không tồn tại.", embeds: [], components: [] }).catch(() => {});
          if (sk.rarity !== "common") return sent.edit({ content: "❌ Chỉ bán bí kíp thường.", embeds: [], components: [] }).catch(() => {});

          if ((u2.lt || 0) < (sk.price || 0)) {
            return sent.edit({ content: "❌ Không đủ linh thạch.", embeds: [], components: [] }).catch(() => {});
          }
          if (u2.skills.owned.includes(skillId)) {
            return sent.edit({ content: "⚠️ Bạn đã sở hữu bí kíp này.", embeds: [], components: [] }).catch(() => {});
          }

          u2.lt -= sk.price || 0;
          addOwnedSkill(u2, skillId);
          users2[msg.author.id] = u2;
          saveUsers(users2);

          const kindTxt = sk.kind === "passive" ? "Bị động" : "Chủ động";
          return sent
            .edit({
              content: `✅ Đã mua **${sk.name}** (${kindTxt}) với giá **${fmtLT(sk.price)} LT**.`,
              embeds: [],
              components: [],
            })
            .catch(() => {});
        }
      }
    });

    col.on("end", async () => {
      try {
        const m = await sent.fetch();
        if (m && m.editable) await sent.edit({ components: [] }).catch(() => {});
      } catch {}
    });
  },
};
