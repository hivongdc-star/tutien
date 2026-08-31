const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const SECTIONS = {
  overview: {
    label: "Tổng quan",
    emoji: "📚",
    description: "Chọn nhóm pháp lệnh cần xem.",
    fields: [
      ["🧍 Nhân vật", "Tạo nhân vật, hồ sơ, chỉ số, bio, tên, danh hiệu."],
      ["📈 Tiến độ", "Daily, nhiệm vụ, thành tựu, xếp hạng, linh thạch."],
      ["🎒 Túi & tu luyện", "Shop, túi tổng hợp, khai khoáng, rèn đúc."],
      ["🐾 Linh thú & câu cá", "Linh thú, câu cá, túi cá, top cá."],
      ["⚔️ Chiến đấu", "PvP, World Boss, phụ bản."],
      ["🎲 Giải trí", "Tài xỉu, tung xu, slot, xổ số, Bát Tự, khí vận."],
      ["🛠️ Quản trị", "Nối từ và lệnh owner/admin."],
    ],
  },
  character: {
    label: "Nhân vật",
    emoji: "🧍",
    fields: [
      ["✨ Tạo", "`-create` • `-c`"],
      ["📜 Hồ sơ", "`-profile` • `-p`"],
      ["🧾 Chỉ số", "`-nv` • `-nhanvat`"],
      ["♻️ Reset", "`-reset` • `-rs`"],
      ["📖 Bio", "`-bio <nội dung>`"],
      ["✍️ Đổi tên", "`-doiten <tên>` • `-rename`"],
      ["🌟 Danh hiệu", "`-danhhieu` • `-title`"],
    ],
  },
  progress: {
    label: "Tiến độ",
    emoji: "📈",
    fields: [
      ["🎁 Daily", "`-daily`"],
      ["🧭 Nhiệm vụ", "`-quest`"],
      ["🏅 Thành tựu", "`-thanhtuu`"],
      ["💎 Linh thạch", "`-lt`"],
      ["🏆 Top tu vi", "`-rank`"],
      ["💰 Top linh thạch", "`-ranklt`"],
      ["🆕 Phiên bản", "`-version`"],
    ],
  },
  inventory: {
    label: "Túi & tu luyện",
    emoji: "🎒",
    fields: [
      ["🛒 Shop", "`-shop` • `-s`"],
      ["🎒 Túi tổng hợp", "`-bag` • `-tui` • `-inventory` • `-inv`"],
      ["⛏️ Khai khoáng", "`-dao`"],
      ["🛠️ Rèn đúc", "`-ren` • `-forge`"],
    ],
  },
  pets: {
    label: "Linh thú & câu cá",
    emoji: "🐾",
    fields: [
      ["🐾 Linh thú", "`-pet` • `-linhthu` • `-thu`\nẤp trứng, xuất chiến, công việc, đột phá."],
      ["🎣 Câu cá", "`-cau [địa điểm]` • `-fish`"],
      ["🐟 Túi cá", "`-fishbag`"],
      ["🏆 Top cá", "`-topfish`"],
    ],
  },
  combat: {
    label: "Chiến đấu",
    emoji: "⚔️",
    fields: [
      ["⚔️ Thách đấu", "`-thachdau @user` • `-td`"],
      ["🔥 Chấp nhận", "`-acp` • `-accept`"],
      ["❌ Từ chối", "`-deny`"],
      ["🚫 Hủy trận", "`-cancel`"],
      ["🐉 World Boss", "`-boss`"],
      ["🏰 Phụ bản", "`-dungeon`"],
    ],
  },
  fun: {
    label: "Giải trí",
    emoji: "🎲",
    fields: [
      ["🎲 Tài xỉu", "`-taixiu <LT>`"],
      ["🪙 Tung xu", "`-flip <LT> <ngửa/sấp>`"],
      ["🎰 Slot", "`-slot <LT>`"],
      ["🎟️ Xổ số", "`-lottery ...`"],
      ["🧭 Bát Tự", "`-battu`"],
      ["☯️ Khí vận", "`-khivan`"],
    ],
  },
  admin: {
    label: "Quản trị",
    emoji: "🛠️",
    fields: [
      ["🎮 Nối từ", "`-noitu setup vi|en` • `status` • `stop` • `clear` • `emoji ...`"],
      ["🧰 Owner/Admin", "`-addxp`, `-addlt`, `-fixdata`, `-reload`, `-update`, `-xoa`"],
    ],
  },
};

const ORDER = ["overview", "character", "progress", "inventory", "pets", "combat", "fun", "admin"];

function buildEmbed(key, author) {
  const section = SECTIONS[key] || SECTIONS.overview;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${section.emoji} ${section.label}`)
    .setDescription(section.description || "Chọn pháp lệnh phù hợp.")
    .setFooter({ text: `Người gọi: ${author.username}` });

  if (section.fields?.length) {
    embed.addFields(section.fields.map(([name, value]) => ({ name, value })));
  }
  return embed;
}

function buildMenu(customId, selected = "overview", disabled = false) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Chọn nhóm pháp lệnh...")
      .setDisabled(disabled)
      .addOptions(
        ORDER.map((key) => ({
          label: SECTIONS[key].label,
          value: key,
          emoji: SECTIONS[key].emoji,
          default: key === selected,
        }))
      )
  );
}

module.exports = {
  name: "help",
  aliases: ["h"],
  run: async (client, msg) => {
    const menuId = `help_${msg.author.id}_${Date.now()}`;
    let current = "overview";

    const sent = await msg.reply({
      embeds: [buildEmbed(current, msg.author)],
      components: [buildMenu(menuId, current)],
    });

    const collector = sent.createMessageComponentCollector({ time: 120_000 });
    collector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) {
        return i.reply({ content: "❌ Đây không phải menu của đạo hữu.", ephemeral: true });
      }
      if (!i.isStringSelectMenu() || i.customId !== menuId) return;
      current = i.values?.[0] || "overview";
      await i.update({
        embeds: [buildEmbed(current, msg.author)],
        components: [buildMenu(menuId, current)],
      });
    });

    collector.on("end", () => {
      sent.edit({ components: [buildMenu(menuId, current, true)] }).catch(() => {});
    });
  },
};
