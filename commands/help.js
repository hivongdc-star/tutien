const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  aliases: ["h"],
  run: async (client, msg) => {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("📘 Sổ Tay Tu Luyện")
      .setDescription("Các lối đi quan trọng trên hành trình tu luyện.")
      .addFields(
        { name: "✨ Khai mở nhân vật", value: "`-create` | alias: `-c`, `-crate`\nKhai mở nhân vật mới" },
        { name: "🪪 Hồ sơ tu luyện", value: "`-profile` | alias: `-p`\nXem thẻ hồ sơ nhân vật" },
        { name: "🧾 Nền tảng nhân vật", value: "`-nv` | alias: `-nhanvat`\nXem nền tảng và gia tăng hiện có" },
        { name: "♻️ Tái lập nhân vật", value: "`-reset` | alias: `-rs`\nChọn lại tộc và ngũ hành" },
        { name: "📖 Lời tự thuật", value: "`-bio` | alias: `-b`\nLưu giới thiệu của nhân vật" },
        { name: "✍️ Đổi danh xưng", value: "`-doiten <tên>` | alias: `-rename`, `-name`\nĐổi tên nhân vật" },
        { name: "🌟 Danh hiệu", value: "`-danhhieu` | alias: `-title`\nChọn danh hiệu đang dùng" },
        { name: "🎁 Tích lũy mỗi ngày", value: "`-daily` | alias: `-dly`\nNhận linh thạch hằng ngày" },
        { name: "🧭 Nhiệm vụ", value: "`-quest` | alias: `-q`\nXem mục tiêu ngày/tuần và nhận thưởng" },
        { name: "🏅 Thành tựu", value: "`-thanhtuu` | alias: `-tt`\nTheo dõi cột mốc và danh hiệu mở khóa" },
        { name: "🎒 Túi hành trang", value: "`-bag` | alias: `-tui`\nMở trang bị, khoáng cụ, khoáng thạch, bí kíp" },
        { name: "🛒 Linh Bảo Các", value: "`-shop` | alias: `-s`\nMua khoáng cụ, trứng linh thú và bí kíp phù hợp" },
        { name: "⛏️ Khai khoáng & rèn đúc", value: "`-dao` | alias: `-daokhoang`\nThu hoạch mạch khoáng\n`-ren` | alias: `-forge`\nRèn trang bị từ khoáng thạch" },
        { name: "🎣 Thu hoạch thủy vực", value: "`-cau [song|ho|bien]` | alias: `-fish`\nThả cần, lưu cá quý và bồi dưỡng linh thú" },
        { name: "🐾 Linh thú đồng hành", value: "`-pet` | alias: `-linhthu`, `-thu`\nẤp trứng, xuất chiến, công việc, bồi dưỡng" },
        { name: "🐉 Chiến tuyến lớn", value: "`-boss` | alias: `-wb`\nTranh công với world boss" },
        { name: "⚔️ Tỷ thí", value: "`-thachdau @user` | alias: `-td`\nGửi lời mời tỷ thí\n`-acp` | alias: `-accept`\nChấp nhận\n`-deny`\nTừ chối" },
        { name: "🎲 May rủi", value: "`-taixiu <LT>` | alias: `-tx`\n`-flip <LT> <ngửa/sấp>` | alias: `-coin`\n`-slot <LT>` | alias: `-quay`\n`-lottery ...` | alias: `-loto`, `-xs`" },
        { name: "🧚 Tiểu Nhu", value: "`-tieunhu` | alias: `-tn`\nGọi Tiểu Nhu để nhận thêm EXP" }
      )
      .setFooter({ text: "Mở -bag để đi vào hầu hết tính năng quan trọng." });

    msg.reply({ embeds: [embed] });
  },
};
