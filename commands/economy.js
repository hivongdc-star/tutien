const { EmbedBuilder } = require("discord.js");
const { getUser, loadUsers } = require("../utils/storage");
const { claimDaily, addLT, removeLT, getLT } = require("../utils/currency");

function fmt(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

const daily = {
  name: "daily",
  aliases: ["dly", "nhanlt", "nhanhang"],
  description: "Nhận Linh thạch hằng ngày",
  run: async (_client, msg) => msg.reply(claimDaily(msg.author.id).message),
};

const lt = {
  name: "lt",
  aliases: ["linhthach"],
  description: "Xem Linh thạch trong linh khố",
  run: async (_client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) return msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    return msg.reply(`💎 Linh khố hiện có **${user.lt ?? 0} Linh thạch**.`);
  },
};

const chuyen = {
  name: "chuyen",
  aliases: ["give", "pay", "transfer", "chuyenlt"],
  description: "Chuyển Linh thạch cho đạo hữu khác",
  usage: "-chuyen @nguoi_nhan <so_luong>",
  run: async (_client, msg, args) => {
    const mention = msg.mentions.users.first();
    const senderId = msg.author.id;
    let targetId = mention?.id || null;
    let amountStr = null;

    if (mention) {
      amountStr = args.find((a) => /^\d+$/.test(a));
    } else {
      const idArg = args.find((a) => /^<@!?(\d+)>$/.test(a));
      if (idArg) {
        targetId = idArg.replace(/[<@!>]/g, "");
        amountStr = args.find((a) => /^\d+$/.test(a));
      } else if (args.length >= 2 && /^\d+$/.test(args[0])) {
        amountStr = args[0];
        const id2 = args.find((a) => /^<@!?(\d+)>$/.test(a));
        if (id2) targetId = id2.replace(/[<@!>]/g, "");
      }
    }

    if (!targetId || !amountStr) {
      return msg.reply("❌ Cú pháp: `-chuyen @nguoi_nhan <so_luong>` hoặc `-chuyen <so_luong> @nguoi_nhan>`");
    }
    if (targetId === senderId) return msg.reply("❌ Không thể tự chuyển Linh thạch cho chính mình.");

    const amount = parseInt(amountStr, 10);
    if (!Number.isFinite(amount) || amount <= 0) return msg.reply("❌ Số lượng phải là số nguyên dương.");

    const users = loadUsers();
    if (!users[senderId]) return msg.reply("⚠️ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    if (!users[targetId]) return msg.reply("⚠️ Người nhận chưa nhập đạo.");

    const senderLT = getLT(senderId) || 0;
    if (senderLT < amount) return msg.reply(`❌ Linh thạch không đủ. Hiện có: **${senderLT}**`);

    removeLT(senderId, amount);
    addLT(targetId, amount);

    return msg.reply(
      `✅ Đã chuyển **${amount}** 💎 Linh thạch cho <@${targetId}>.\n` +
      `📤 Linh khố của đạo hữu: **${getLT(senderId) || 0}**\n` +
      `📥 Linh khố người nhận: **${getLT(targetId) || 0}**`
    );
  },
};

const rank = {
  name: "rank",
  aliases: ["top", "bxh"],
  run: async (_client, msg) => {
    const all = Object.values(loadUsers() || {})
      .filter((u) => u && Number.isFinite(Number(u.level)))
      .sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0) || (Number(b.exp) || 0) - (Number(a.exp) || 0))
      .slice(0, 10);
    if (!all.length) return msg.reply("❌ Hiện chưa có ai trên Bảng Phong Vân.");

    const desc = all
      .map((u, i) => `${i + 1}. **${u.title ? `[${u.title}] ` : ""}${u.name || "Ẩn danh"}**\n${u.realm || "(chưa rõ)"} • Cấp **${u.level || 1}**`)
      .join("\n\n");
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle("🏆 Bảng Phong Vân").setDescription(desc).setFooter({ text: "Những người đang đi xa nhất trên con đường tu luyện." })],
    });
  },
};

const ranklt = {
  name: "ranklt",
  aliases: ["toplt", "bxhlt"],
  run: async (_client, msg) => {
    const all = Object.values(loadUsers() || {})
      .filter(Boolean)
      .sort((a, b) => (Number(b.lt) || 0) - (Number(a.lt) || 0))
      .slice(0, 10);
    if (!all.length) return msg.reply("❌ Hiện chưa có ai trên Bảng Tàng Phú.");

    const desc = all
      .map((u, i) => `${i + 1}. **${u.title ? `[${u.title}] ` : ""}${u.name || "Ẩn danh"}**\nLinh thạch: **${fmt(u.lt)}**`)
      .join("\n\n");
    return msg.reply({
      embeds: [new EmbedBuilder().setColor(0x00B0F4).setTitle("💎 Bảng Tàng Phú").setDescription(desc).setFooter({ text: "Những người đang nắm giữ nhiều linh thạch nhất." })],
    });
  },
};

module.exports = [daily, lt, chuyen, rank, ranklt];
