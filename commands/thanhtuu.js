// commands/thanhtuu.js
// Thành tựu (combo 1): xem tiến độ + danh hiệu mở khoá.
// Tối ưu: chia theo mục + phân trang để tránh embed quá dài.

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { ACHIEVEMENTS, ensureAchv } = require("../utils/achievementSystem");

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function getStat(user, key) {
  const v = user?.achvStats?.[key];
  return Math.max(0, Math.floor(Number(v) || 0));
}

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

function groupLabel(group) {
  return (GROUP_META[group] || GROUP_META.all).label;
}

function chunk(arr, size) {
  const s = Math.max(1, Math.floor(Number(size) || 1));
  const out = [];
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

function buildAchvLine(u, a) {
  const cur = getStat(u, a.stat);
  const done = Boolean(u.achievements?.[a.id]) || cur >= a.need;
  const st = done ? "✅" : "⏳";
  const prog = a.need > 1 ? `${cur}/${a.need}` : (done ? "1/1" : "0/1");
  return `${st} **${a.title}** — ${prog}\n_${a.desc}_`;
}

module.exports = {
  name: "thanhtuu",
  aliases: ["tt", "achievement", "ach"],
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");

    ensureAchv(u);
    users[msg.author.id] = u;
    saveUsers(users);

    const userId = msg.author.id;
    const nonce = Math.random().toString(36).slice(2, 8);

    // state
    let group = "all"; // all|fish|mine|dungeon|boss|enhance|economy|titles
    let page = 0;

    const buildEmbed = () => {
      const base = new EmbedBuilder()
        .setTitle("🏅 Thành Tựu")
        .setColor(0xF1C40F)
        .setDescription(
          `Linh thạch: **${fmtLT(u.lt)}** 💎\n` +
            `Danh hiệu đang dùng: **${u.title || "(chưa chọn)"}**\n` +
            `Mục: **${groupLabel(group)}**`
        );

      if (group === "titles") {
        const titles = Array.isArray(u.titles) ? u.titles : [];
        const pages = chunk(titles, 20);
        const totalPages = Math.max(1, pages.length);
        page = Math.max(0, Math.min(page, totalPages - 1));
        const list = pages[page] || [];

        const body = list.length ? list.map((t) => `• ${t}`).join("\n") : "(Chưa có)";

        base.addFields({
          name: `🎖 Danh hiệu đã mở (trang ${page + 1}/${totalPages})`,
          value: body.slice(0, 1024),
          inline: false,
        });

        base.setFooter({ text: "Dùng -danhhieu để chọn danh hiệu đang dùng." });
        return { embed: base, totalPages };
      }

      const filtered = group === "all" ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.group === group);
      const pages = chunk(filtered, 5);
      const totalPages = Math.max(1, pages.length);
      page = Math.max(0, Math.min(page, totalPages - 1));
      const list = pages[page] || [];

      const lines = list.map((a) => buildAchvLine(u, a)).join("\n\n");

      base.addFields({
        name: `📌 Cột mốc (trang ${page + 1}/${totalPages})`,
        value: lines ? lines.slice(0, 1024) : "(Trống)",
        inline: false,
      });

      base.setFooter({ text: "Dùng -danhhieu để chọn danh hiệu đang dùng." });
      return { embed: base, totalPages };
    };

    const buildRows = (totalPages) => {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`achv_cat_${userId}_${nonce}`)
        .setPlaceholder("Chọn một khu vực...")
        .addOptions(
          Object.values(GROUP_META)
            .filter((x) => x.value !== "all")
            .map((x) => ({ label: x.label, value: x.value }))
        );

      // Thêm option "Tất cả" lên đầu
      menu.addOptions([{ label: GROUP_META.all.label, value: GROUP_META.all.value }]);

      // Discord giới hạn 25 options; hiện tại 8 ok
      const rowMenu = new ActionRowBuilder().addComponents(menu);

      const btnPrev = new ButtonBuilder()
        .setCustomId(`achv_prev_${userId}_${nonce}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("◀")
        .setDisabled(page <= 0);

      const btnNext = new ButtonBuilder()
        .setCustomId(`achv_next_${userId}_${nonce}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("▶")
        .setDisabled(page >= Math.max(0, totalPages - 1));

      const btnClose = new ButtonBuilder()
        .setCustomId(`achv_close_${userId}_${nonce}`)
        .setStyle(ButtonStyle.Danger)
        .setLabel("Đóng");

      const rowBtns = new ActionRowBuilder().addComponents(btnPrev, btnNext, btnClose);

      return [rowMenu, rowBtns];
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
      // update in-memory ref
      u.lt = u2.lt;
      u.title = u2.title;
      u.titles = u2.titles;
      u.achvStats = u2.achvStats;
      u.achievements = u2.achievements;

      const res = buildEmbed();
      await sent.edit({ embeds: [res.embed], components: buildRows(res.totalPages) }).catch(() => {});
    };

    col.on("collect", async (i) => {
      try {
        if (i.user.id !== userId) {
          return i.reply({ content: "❌ Đây không phải bảng thành tựu của đạo hữu.", ephemeral: true });
        }

        const cid = String(i.customId || "");

        // Menu đổi mục
        if (i.isStringSelectMenu() && cid === `achv_cat_${userId}_${nonce}`) {
          await i.deferUpdate();
          const v = String(i.values?.[0] || "all");
          group = GROUP_META[v] ? v : "all";
          page = 0;
          return refresh();
        }

        // Buttons
        if (i.isButton() && cid === `achv_prev_${userId}_${nonce}`) {
          await i.deferUpdate();
          page = Math.max(0, page - 1);
          return refresh();
        }
        if (i.isButton() && cid === `achv_next_${userId}_${nonce}`) {
          await i.deferUpdate();
          page = page + 1;
          return refresh();
        }
        if (i.isButton() && cid === `achv_close_${userId}_${nonce}`) {
          await i.deferUpdate();
          col.stop("close");
          return sent.edit({ components: [] }).catch(() => {});
        }

        return;
      } catch (e) {
        // Best-effort: tránh interaction fail
        try {
          if (!i.deferred && !i.replied) await i.deferUpdate();
        } catch {}
      }
    });

    col.on("end", async () => {
      await sent.edit({ components: [] }).catch(() => {});
    });
  },
};
