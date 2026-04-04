const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  aliases: ["h"],
  run: async (client, msg) => {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📖 Danh sách lệnh cho người chơi")
      .setDescription("Dưới đây là các lệnh bạn có thể sử dụng trong bot Tu Tiên:")
      .addFields(
        // --- Nhân vật ---
        {
          name: "✨ Tạo nhân vật",
          value: "`-create` | alias: `-c`, `-crate`\nTạo nhân vật mới",
        },
        {
          name: "📜 Hồ sơ",
          value: "`-profile` | alias: `-p`, `-prof`\nXem thông tin nhân vật",
        },
        {
          name: "🧾 Chỉ số nhân vật",
          value: "`-nv` | alias: `-nhanvat`\nXem chỉ số (base + % tăng + phụ tố)",
        },
        {
          name: "♻️ Reset nhân vật",
          value: "`-reset` | alias: `-rs`\nReset lại nhân vật (chọn lại Tộc + Ngũ hành)",
        },
        {
          name: "📖 Bio",
          value: "`-bio` | alias: `-b`\nĐặt giới thiệu nhân vật",
        },
        {
          name: "✍️ Đổi tên",
          value: "`-doiten <tên>` | alias: `-rename`, `-name`\nĐổi tên nhân vật",
        },
        {
          name: "🌟 Danh hiệu",
          value: "`-danhhieu` | alias: `-title`\nĐổi danh hiệu nhân vật",
        },

        // --- Kinh tế ---
        {
          name: "🎁 Daily",
          value: "`-daily` | alias: `-dly`\nNhận thưởng hàng ngày",
        },
        {
          name: "🧭 Nhiệm vụ",
          value: "`-quest` | alias: `-q`\nNhiệm vụ ngày/tuần + nhận thưởng",
        },
        {
          name: "🏅 Thành tựu",
          value: "`-thanhtuu` | alias: `-tt`\nXem tiến độ thành tựu + danh hiệu mở khoá",
        },
        {
          name: "🛒 Shop",
          value: "`-shop` | alias: `-s`\nXem cửa hàng (khoáng cụ / bí kíp / trứng linh thú)",
        },
        {
          name: "🎒 Túi",
          value: "`-bag` | alias: `-tui`\nXem khoáng cụ / khoáng thạch / trang bị / vật phẩm",
        },
        {
          name: "⛏️ Khai khoáng",
          value: "`-dao` | alias: `-daokhoang`\nKhai khoáng (5 giây/lần)",
        },
        {
          name: "🛠️ Rèn đúc",
          value: "`-ren` | alias: `-forge`\nRèn trang bị bằng 5 khoáng thạch",
        },
        {
          name: "🧚 Tiểu Nhu",
          value: "`-tieunhu` | alias: `-tn`\nGọi NPC Tiểu Nhu để nhận EXP",
        },
        {
          name: "🎣 Câu cá",
          value: "`-cau [địa điểm]` | alias: `-fish`\nCá không save sẽ tự động cho linh thú ăn",
        },
        {
          name: "🐾 Linh thú",
          value: "`-pet` | alias: `-linhthu`, `-thu`\nUI menu/button: Ấp trứng • Equip • Job • Đột phá",
        },

        // --- PvE ---
        {
          name: "🐉 World Boss",
          value: "`-boss` | alias: `-wb`\nĐánh boss tuần, nhận thưởng theo đóng góp",
        },

        // --- PK ---
        {
          name: "⚔️ Thách đấu",
          value: "`-thachdau @user` | alias: `-td`\nThách đấu một người chơi",
        },
        {
          name: "🔥 Chấp nhận thách đấu",
          value: "`-acp` | alias: `-accept`\nChấp nhận lời thách đấu",
        },
        {
          name: "❌ Từ chối thách đấu",
          value: "`-deny`\nTừ chối lời thách đấu",
        },
        {
          name: "🚫 Hủy hành động",
          value: "`-cancel` | alias: `-endall`\nHuỷ toàn bộ trận đấu (chỉ admin)",
        },

        // --- Cờ bạc & Xổ số ---
        {
          name: "🎲 Tài Xỉu",
          value: "`-taixiu <LT>` | alias: `-tx`\nTung 3 xúc xắc, ≥13 điểm = thắng x2 LT",
        },
        {
          name: "🪙 Tung Xu",
          value: "`-flip <LT> <ngửa/sấp>` | alias: `-coin`\nĐoán mặt đồng xu, thắng x2 LT",
        },
        {
          name: "🎰 Slot Machine",
          value: "`-slot <LT>` | alias: `-quay`\nQuay 3 ô emoji (Ngũ hành + 💎), có jackpot x50",
        },
        {
          name: "🎟️ Xổ số",
          value:
            "`-lottery buy <số vé>` | alias: `-loto`, `-xs`\nMua vé số (10 LT/vé)\n`-lottery pot` xem jackpot\n`-lottery draw` quay số thủ công (auto 20h)",
        },

        // --- Hỗ trợ ---
        {
          name: "ℹ️ Hướng dẫn",
          value: "`-help` | alias: `-h`\nXem danh sách lệnh",
        }
      )
      .setFooter({ text: "✨ Hãy tu luyện chăm chỉ để mạnh hơn!" });

    msg.reply({ embeds: [embed] });
  },
};
