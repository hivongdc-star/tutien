const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const HELP_SECTIONS = {
  overview: {
    label: "Tổng quan",
    emoji: "📚",
    description:
      "Chọn một nhóm tính năng bên dưới để xem đúng phần lệnh bạn cần. Menu này chỉ dùng cho người đã gọi `-help`.",
    fields: [
      {
        name: "🧍 Nhân vật",
        value: "Tạo nhân vật, hồ sơ, chỉ số, bio, đổi tên, danh hiệu.",
      },
      {
        name: "📈 Tiến độ & tài nguyên",
        value: "Daily, nhiệm vụ, thành tựu, bảng xếp hạng, linh thạch.",
      },
      {
        name: "🎒 Túi đồ & tu luyện",
        value: "Shop, túi đồ, khai khoáng, rèn đúc, dùng vật phẩm.",
      },
      {
        name: "🐾 Linh thú & săn bắt",
        value: "Linh thú, câu cá, túi cá, bảng xếp hạng cá.",
      },
      {
        name: "⚔️ Chiến đấu",
        value: "Thách đấu người chơi, World Boss, phụ bản tổ đội.",
      },
      {
        name: "🎲 Giải trí & tiện ích",
        value: "Tài xỉu, tung xu, slot, xổ số, khí vận, tử vi.",
      },
      {
        name: "🛠️ Quản trị & nối từ",
        value: "Lệnh admin và toàn bộ lệnh setup game nối từ theo kênh.",
      },
    ],
  },
  character: {
    label: "Nhân vật",
    emoji: "🧍",
    description: "Nhóm lệnh tạo và quản lý thông tin nhân vật.",
    fields: [
      {
        name: "✨ Tạo nhân vật",
        value: "`-create` | alias: `-c`, `-crate`\nTạo nhân vật mới.",
      },
      {
        name: "📜 Hồ sơ",
        value: "`-profile` | alias: `-p`, `-prof`\nXem hồ sơ nhân vật.",
      },
      {
        name: "🧾 Chỉ số",
        value: "`-nv` | alias: `-nhanvat`\nXem chỉ số gốc, cộng thêm và trạng thái hiện tại.",
      },
      {
        name: "♻️ Reset nhân vật",
        value: "`-reset` | alias: `-rs`\nReset lại nhân vật để chọn lại Tộc + Ngũ hành.",
      },
      {
        name: "📖 Bio",
        value: "`-bio <nội dung>` | alias: `-b`\nĐặt giới thiệu nhân vật.",
      },
      {
        name: "✍️ Đổi tên",
        value: "`-doiten <tên>` | alias: `-rename`, `-name`\nĐổi tên nhân vật.",
      },
      {
        name: "🌟 Danh hiệu",
        value: "`-danhhieu` | alias: `-title`\nChọn danh hiệu đang hiển thị.",
      },
    ],
  },
  progress: {
    label: "Tiến độ & tài nguyên",
    emoji: "📈",
    description: "Lệnh nhận thưởng, theo dõi tiến độ và bảng xếp hạng.",
    fields: [
      {
        name: "🎁 Daily",
        value: "`-daily` | alias: `-dly`\nNhận thưởng hằng ngày.",
      },
      {
        name: "🧭 Nhiệm vụ",
        value: "`-quest` | alias: `-q`\nXem nhiệm vụ ngày/tuần và nhận thưởng.",
      },
      {
        name: "🏅 Thành tựu",
        value: "`-thanhtuu` | alias: `-tt`\nTheo dõi thành tựu và danh hiệu mở khóa.",
      },
      {
        name: "💎 Linh thạch",
        value: "`-lt`\nXem số linh thạch hiện có.",
      },
      {
        name: "🏆 Bảng xếp hạng tu vi",
        value: "`-rank`\nXem top tu vi của server.",
      },
      {
        name: "💰 Bảng xếp hạng linh thạch",
        value: "`-ranklt`\nXem top linh thạch của server.",
      },
      {
        name: "🆕 Phiên bản bot",
        value: "`-version`\nXem phiên bản hiện tại của bot.",
      },
    ],
  },
  inventory: {
    label: "Túi đồ & tu luyện",
    emoji: "🎒",
    description: "Nhóm lệnh xoay quanh đồ đạc, nguyên liệu và tiến trình tu luyện.",
    fields: [
      {
        name: "🛒 Shop",
        value: "`-shop` | alias: `-s`\nMở cửa hàng vật phẩm và khoáng cụ.",
      },
      {
        name: "🎒 Túi đồ",
        value: "`-bag` | alias: `-tui`\nMở menu túi đồ tổng hợp.",
      },
      {
        name: "📦 Kho đồ cũ",
        value: "`-inventory`\nXem kho đồ dạng danh sách nếu cần.",
      },
      {
        name: "⛏️ Khai khoáng",
        value: "`-dao` | alias: `-daokhoang`\nKhai khoáng theo lượt hồi.",
      },
      {
        name: "🛠️ Rèn đúc",
        value: "`-ren` | alias: `-forge`\nRèn hoặc ghép trang bị từ nguyên liệu.",
      },
      {
        name: "🎴 Dùng vật phẩm",
        value: "`-use ...`\nDùng nhanh vật phẩm nếu tính năng đó còn mở riêng.",
      },
      {
        name: "🧚 Tiểu Nhu",
        value: "`-tieunhu` | alias: `-tn`\nGọi NPC Tiểu Nhu để nhận thưởng theo cơ chế hiện tại.",
      },
    ],
  },
  pets: {
    label: "Linh thú & săn bắt",
    emoji: "🐾",
    description: "Lệnh liên quan tới linh thú, câu cá và phần thưởng phụ trợ.",
    fields: [
      {
        name: "🐾 Linh thú",
        value: "`-pet` | alias: `-linhthu`, `-thu`\nQuản lý ấp trứng, trang bị, công việc, đột phá.",
      },
      {
        name: "🎣 Câu cá",
        value: "`-cau [địa điểm]` | alias: `-fish`\nĐi câu cá theo địa điểm đang hỗ trợ.",
      },
      {
        name: "🐟 Túi cá",
        value: "`-fishbag`\nXem cá đang giữ lại.",
      },
      {
        name: "🏆 Top cá",
        value: "`-topfish`\nXem bảng xếp hạng câu cá.",
      },
    ],
  },
  combat: {
    label: "Chiến đấu",
    emoji: "⚔️",
    description: "Nhóm lệnh PvP, Boss và nội dung chiến đấu tổ đội.",
    fields: [
      {
        name: "⚔️ Thách đấu",
        value: "`-thachdau @user` | alias: `-td`\nGửi lời thách đấu tới người chơi khác.",
      },
      {
        name: "🔥 Chấp nhận",
        value: "`-acp` | alias: `-accept`\nChấp nhận lời thách đấu đang chờ.",
      },
      {
        name: "❌ Từ chối",
        value: "`-deny` | alias: `-d`\nTừ chối lời thách đấu.",
      },
      {
        name: "🚫 Hủy trận",
        value: "`-cancel` | alias: `-cxl`\nHủy toàn bộ trận đang diễn ra nếu được phép.",
      },
      {
        name: "🐉 World Boss",
        value: "`-boss` | alias: `-wb`\nTham gia đánh boss tuần.",
      },
      {
        name: "🏰 Phụ bản",
        value: "`-dungeon`\nVào hoặc tạo đội phụ bản nếu tính năng đang bật.",
      },
    ],
  },
  fun: {
    label: "Giải trí & tiện ích",
    emoji: "🎲",
    description: "Mini game, bói toán và các lệnh tiện ích nhanh.",
    fields: [
      {
        name: "🎲 Tài xỉu",
        value: "`-taixiu <LT>` | alias: `-tx`\nĐặt cược tài xỉu.",
      },
      {
        name: "🪙 Tung xu",
        value: "`-flip <LT> <ngửa/sấp>` | alias: `-coin`\nTung xu đặt cược.",
      },
      {
        name: "🎰 Slot",
        value: "`-slot <LT>` | alias: `-quay`\nQuay máy slot.",
      },
      {
        name: "🎟️ Xổ số",
        value: "`-lottery buy <số>` | alias: `-loto`, `-xs`\nMua vé số, xem pot và quay số.",
      },
      {
        name: "☯️ Khí vận",
        value: "`-khivan`\nXem quẻ khí vận hiện tại.",
      },
      {
        name: "🔮 Tử vi",
        value: "`-tuvi`\nXem nội dung tử vi đang hỗ trợ.",
      },
    ],
  },
  admin: {
    label: "Quản trị & nối từ",
    emoji: "🛠️",
    description: "Lệnh quản trị dữ liệu và setup game nối từ theo từng kênh.",
    fields: [
      {
        name: "🎮 Bật nối từ",
        value: "`-noitu setup vi`\n`-noitu setup en`\nBật game nối từ cho kênh hiện tại.",
      },
      {
        name: "📊 Trạng thái nối từ",
        value: "`-noitu status`\nXem mode, từ cần nối, emoji đang dùng và trạng thái kênh.",
      },
      {
        name: "🛑 Dừng / hủy setup",
        value: "`-noitu stop`\n`-noitu clear`\nDừng ván hiện tại hoặc hủy setup của kênh.",
      },
      {
        name: "😀 Chỉnh emoji nối từ",
        value: "`-noitu emoji dung <emoji>`\n`-noitu emoji sai <emoji>`\n`-noitu emoji status`\n`-noitu emoji reset`",
      },
      {
        name: "⚠️ Quyền dùng lệnh nối từ",
        value: "Chỉ người có quyền **Quản lý kênh** mới dùng được nhóm lệnh `-noitu`.",
      },
      {
        name: "🧰 Admin data",
        value: "`-addxp`, `-addlt`, `-fixdata`, `-reload`, `-update`, `-xoa`\nDùng cho quản trị hoặc owner tùy từng lệnh.",
      },
    ],
  },
};

const MENU_ORDER = [
  "overview",
  "character",
  "progress",
  "inventory",
  "pets",
  "combat",
  "fun",
  "admin",
];

function buildHelpEmbed(key, author) {
  const section = HELP_SECTIONS[key] || HELP_SECTIONS.overview;

  const embed = new EmbedBuilder()
    .setColor("Blue")
    .setTitle(`${section.emoji} ${section.label}`)
    .setDescription(section.description)
    .setFooter({
      text:
        key === "overview"
          ? `Người gọi: ${author.username} • Chọn một mục trong menu bên dưới`
          : `Người gọi: ${author.username} • Có thể đổi sang mục khác ngay trong menu`,
      iconURL: author.displayAvatarURL?.() || undefined,
    });

  if (Array.isArray(section.fields) && section.fields.length) {
    embed.addFields(section.fields);
  }

  return embed;
}

function buildHelpMenu(customId, selectedKey = "overview", disabled = false) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Chọn nhóm tính năng cần xem...")
    .setDisabled(disabled)
    .addOptions(
      MENU_ORDER.map((key) => ({
        label: HELP_SECTIONS[key].label,
        value: key,
        emoji: HELP_SECTIONS[key].emoji,
        default: key === selectedKey,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  name: "help",
  aliases: ["h"],
  run: async (client, msg) => {
    const nonce = `${msg.author.id}_${Date.now()}`;
    const menuId = `help_menu_${nonce}`;
    let currentKey = "overview";

    const sent = await msg.reply({
      embeds: [buildHelpEmbed(currentKey, msg.author)],
      components: [buildHelpMenu(menuId, currentKey)],
    });

    const collector = sent.createMessageComponentCollector({ time: 300000 });

    collector.on("collect", async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== menuId) return;

      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({
          content: "❌ Đây không phải bảng hướng dẫn của bạn.",
          ephemeral: true,
        });
      }

      currentKey = interaction.values?.[0] || "overview";

      await interaction.update({
        embeds: [buildHelpEmbed(currentKey, msg.author)],
        components: [buildHelpMenu(menuId, currentKey)],
      });
    });

    collector.on("end", async () => {
      try {
        await sent.edit({
          components: [buildHelpMenu(menuId, currentKey, true)],
        });
      } catch (_) {}
    });
  },
};
