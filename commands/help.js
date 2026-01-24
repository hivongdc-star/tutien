const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  aliases: ["h"],
  run: async (client, msg) => {
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📖 Danh sách lệnh cho người chơi")
      .setDescription(
        "Dưới đây là các lệnh bạn có thể sử dụng trong bot Tu Tiên:"
      )
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
          name: "♻️ Reset nhân vật",
          value:
            "`-reset` | alias: `-rs`\nReset lại nhân vật (chọn lại Tộc + Ngũ hành)",
        },
        {
          name: "📖 Bio",
          value: "`-bio` | alias: `-b`\nĐặt giới thiệu nhân vật",
        },
        {
          name: "✍️ Đổi tên",
          value:
            "`-doiten <tên>` | alias: `-rename`, `-name`\nĐổi tên nhân vật",
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
          name: "🛒 Shop",
          value: "`-shop` | alias: `-s`\nXem cửa hàng",
        },
        {
          name: "🧚 Tiểu Nhu",
          value: "`-tieunhu` | alias: `-tn`\nGọi NPC Tiểu Nhu để nhận EXP",
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
          value: "`-deny` | alias: `-d`\nTừ chối lời thách đấu",
        },
        {
          name: "🚫 Hủy hành động",
          value: "`-cancel` | alias: `-cxl`\nHủy lời thách đấu hoặc hành động",
        },

        // --- Cờ bạc & Xổ số ---
        {
          name: "🎲 Tài Xỉu",
          value:
            "`-taixiu <LT>` | alias: `-tx`\nTung 3 xúc xắc, ≥13 điểm = thắng x2 LT",
        },
        {
          name: "🪙 Tung Xu",
          value:
            "`-flip <LT> <ngửa/sấp>` | alias: `-coin`\nĐoán mặt đồng xu, thắng x2 LT",
        },
        {
          name: "🎰 Slot Machine",
          value:
            "`-slot <LT>` | alias: `-quay`\nQuay 3 ô emoji (Ngũ hành + 💎), có jackpot x50",
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
