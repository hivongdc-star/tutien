const fs = require("fs");
const path = require("path");
const { loadUsers, saveUsers } = require("../utils/storage");
const { addXp, getRealm, races, elements } = require("./character");

function ownerOnly(msg) {
  return Boolean(process.env.OWNER_ID && msg.author.id === process.env.OWNER_ID);
}

const addlt = {
  name: "addlt",
  aliases: ["alt", "addstone"],
  description: "Thêm Linh thạch cho một người chơi (chỉ owner)",
  run: async (_client, msg, args) => {
    if (!ownerOnly(msg)) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    const mentionedUser = msg.mentions.users.first() || null;
    const targetId = mentionedUser ? mentionedUser.id : msg.author.id;
    const amount = Number.parseInt(mentionedUser ? args[1] : args[0], 10);
    if (!Number.isFinite(amount)) return msg.reply("❌ Cú pháp: `-addlt @user <số>` hoặc `-addlt <số>` (cho chính mình).");
    const users = loadUsers();
    const targetUser = users[targetId];
    if (!targetUser) return msg.reply("❌ Người chơi này chưa có nhân vật.");
    targetUser.lt = (Number(targetUser.lt) || 0) + amount;
    saveUsers(users);
    return msg.reply(targetId === msg.author.id
      ? `✅ Đạo hữu nhận thêm **${amount}** 💎 Linh thạch. Linh khố: **${targetUser.lt}**`
      : `✅ Đã cộng **${amount}** 💎 Linh thạch cho <@${targetId}>. Tổng: **${targetUser.lt}**`);
  },
};

const addxp = {
  name: "addxp",
  aliases: ["axp"],
  description: "Cộng EXP cho nhân vật chỉ định (chỉ owner)",
  run: async (_client, message, args) => {
    if (!ownerOnly(message)) return message.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    const target = message.mentions.users.first();
    if (!target) return message.reply("⚠️ Vui lòng mention người cần cộng EXP.");
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) return message.reply("⚠️ Vui lòng nhập số EXP hợp lệ.");
    const levelsGained = addXp(target.id, amount);
    const user = loadUsers()[target.id];
    if (!user) return message.reply("❌ Nhân vật này chưa được tạo.");
    let text = `✅ Đã cộng **${amount} EXP** cho **${user.name}**.`;
    if (levelsGained > 0) text += `\n⚡️ Nhân vật đã đột phá lên **${getRealm(user.level)}** (Level ${user.level}).`;
    return message.reply(text);
  },
};

const fixdata = {
  name: "fixdata",
  aliases: ["fix", "fd"],
  description: "Chuẩn hóa & tính lại chỉ số nhân vật theo level (chỉ owner)",
  run: (_client, msg) => {
    if (!ownerOnly(msg)) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    const users = loadUsers();
    let fixed = 0;
    for (const id in users) {
      const u = users[id];
      if (!u) continue;
      const level = u.level || 1;
      const race = u.race || "nhan";
      const element = u.element || "kim";
      let maxHp = 100, maxMp = 100, atk = 10, def = 10, spd = 10;
      for (let lv = 2; lv <= level; lv++) {
        const raceGain = races[race]?.gain || {};
        if (Number.isFinite(raceGain.hp)) maxHp += raceGain.hp;
        if (Number.isFinite(raceGain.mp)) maxMp += raceGain.mp;
        if (Number.isFinite(raceGain.atk)) atk += raceGain.atk;
        if (Number.isFinite(raceGain.def)) def += raceGain.def;
        if (Number.isFinite(raceGain.spd)) spd += raceGain.spd;
        const eleGain = elements[element] || {};
        if (Number.isFinite(eleGain.hp)) maxHp += eleGain.hp;
        if (Number.isFinite(eleGain.mp)) maxMp += eleGain.mp;
        if (Number.isFinite(eleGain.atk)) atk += eleGain.atk;
        if (Number.isFinite(eleGain.def)) def += eleGain.def;
        if (Number.isFinite(eleGain.spd)) spd += eleGain.spd;
        maxHp += 100;
        maxMp += 20;
        if (lv % 10 === 1) {
          const multiplier = race === "than" ? 1.6 : 1.5;
          atk = Math.floor(atk * multiplier);
          def = Math.floor(def * multiplier);
          spd = Math.floor(spd * multiplier);
          maxHp = Math.floor(maxHp * multiplier);
          maxMp = Math.floor(maxMp * multiplier);
        }
      }
      users[id] = {
        ...u, race, element, level, realm: getRealm(level),
        hp: maxHp, maxHp, mp: maxMp, maxMp, atk, def, spd,
        fury: 0, buffs: [], shield: 0, buffCooldowns: {},
      };
      fixed++;
    }
    saveUsers(users);
    return msg.reply(`✅ Đã chuẩn hóa & tính lại chỉ số cho **${fixed}** nhân vật.`);
  },
};

const MAX_MESSAGE = 1900;
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (err) { console.error(`[userdata] Failed to parse ${filePath}:`, err); return {}; }
}
function resolveTargetId(msg, args) {
  const mentioned = msg.mentions?.users?.first?.();
  if (mentioned) return mentioned.id;
  const raw = (args[0] || "").trim();
  return /^\d{16,20}$/.test(raw) ? raw : null;
}

const userdata = {
  name: "userdata",
  aliases: ["udata", "uinfojson"],
  description: "Owner-only: DM toàn bộ data của một user",
  run: async (_client, msg, args) => {
    if (!ownerOnly(msg)) return msg.reply("Đạo hữu không có quyền dùng lệnh này.");
    const targetId = resolveTargetId(msg, args);
    if (!targetId) return msg.reply("Dùng: `-userdata @user` hoặc `-userdata <userId>`");
    const usersPath = path.join(__dirname, "..", "data", "users.json");
    const battuPath = path.join(__dirname, "..", "data", "battu_profiles.json");
    const coreUserData = loadJson(usersPath)[targetId] ?? null;
    const battuProfile = loadJson(battuPath)[targetId] ?? null;
    if (!coreUserData && !battuProfile) return msg.reply(`Không tìm thấy dữ liệu cho user \`${targetId}\`.`);
    const payload = JSON.stringify({ userId: targetId, data: { users: coreUserData, battuProfile } }, null, 2);
    try {
      await msg.author.send(`📦 Dữ liệu của user \`${targetId}\`:\n- users.json: ${coreUserData ? "có" : "không"}\n- battu_profiles.json: ${battuProfile ? "có" : "không"}`);
      if (payload.length <= MAX_MESSAGE) {
        await msg.author.send(`\`\`\`json\n${payload}\n\`\`\``);
      } else if (payload.length <= 25000) {
        for (let i = 0; i < payload.length; i += MAX_MESSAGE) await msg.author.send(`\`\`\`json\n${payload.slice(i, i + MAX_MESSAGE)}\n\`\`\``);
      } else {
        const tmpPath = path.join(__dirname, "..", "data", `userdata_${targetId}.json`);
        fs.writeFileSync(tmpPath, payload, "utf8");
        await msg.author.send({ content: `📎 Dữ liệu quá dài, gửi kèm file cho user \`${targetId}\`.`, files: [tmpPath] });
        fs.unlinkSync(tmpPath);
      }
      return msg.reply(`Đã gửi hồ sơ kiểm tra của user \`${targetId}\` qua DM.`);
    } catch (err) {
      console.error("[userdata] Failed to DM owner:", err);
      return msg.reply("Không thể gửi DM. Hãy kiểm tra cài đặt tin nhắn riêng.");
    }
  },
};

const xoa = {
  name: "xoa",
  aliases: ["delete", "del"],
  run: async (_client, msg) => {
    if (!ownerOnly(msg)) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    const target = msg.mentions.users.first();
    if (!target) return msg.reply("⚠️ Hãy tag người cần xóa nhân vật. Ví dụ: `-xoa @user`");
    const users = loadUsers();
    if (!users[target.id]) return msg.reply("❌ Người này chưa nhập đạo.");
    delete users[target.id];
    saveUsers(users);
    return msg.channel.send(`🗑️ Nhân vật của **${target.username}** đã bị xóa bởi Admin.`);
  },
};

const version = {
  name: "version",
  aliases: ["ver"],
  description: "Hiển thị phiên bản tông môn và ghi chú mới nhất",
  run: async (_client, msg) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
      const lines = fs.readFileSync(path.join(__dirname, "../changelog.md"), "utf8").split("\n").map((l) => l.trim());
      const idx = lines.findIndex((l) => l.startsWith("##"));
      const note = idx >= 0 && lines[idx + 1] ? lines[idx + 1] : "Chưa tìm thấy ghi chú cập nhật.";
      return msg.reply(`📌 **Phiên bản tông môn:** v${pkg.version || "0.0.0"}\n📝 **Ghi chú:** ${note}`);
    } catch (e) {
      console.error("Lỗi đọc phiên bản:", e);
      return msg.reply("❌ Không thể đọc thông tin phiên bản.");
    }
  },
};

module.exports = [addlt, addxp, fixdata, userdata, xoa, version];
