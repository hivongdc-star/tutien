const fs = require("fs");
const path = require("path");

const USERS_PATH = path.join(__dirname, "..", "data", "users.json");
const MAX_MESSAGE = 1900;

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
  } catch (err) {
    console.error("[userdata] Failed to parse users.json:", err);
    return {};
  }
}

function resolveTargetId(msg, args) {
  const mentioned = msg.mentions?.users?.first?.();
  if (mentioned) return mentioned.id;

  const raw = (args[0] || "").trim();
  if (/^\d{16,20}$/.test(raw)) return raw;

  return null;
}

function splitIntoChunks(text, size = MAX_MESSAGE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

module.exports = {
  name: "userdata",
  aliases: ["udata", "uinfojson"],
  description: "Owner-only: DM toàn bộ data của 1 user từ users.json",

  run: async (client, msg, args) => {
    const ownerId = process.env.OWNER_ID;

    if (!ownerId) {
      return msg.reply("Thiếu cấu hình OWNER_ID trong môi trường.");
    }

    if (msg.author.id !== ownerId) {
      return msg.reply("Bạn không có quyền dùng lệnh này.");
    }

    const targetId = resolveTargetId(msg, args);
    if (!targetId) {
      return msg.reply("Dùng: `-userdata @user` hoặc `-userdata <userId>`");
    }

    const users = loadUsers();
    const userData = users[targetId];

    if (!userData) {
      return msg.reply(`Không tìm thấy dữ liệu cho user \`${targetId}\`.`);
    }

    const payload = JSON.stringify(
      {
        userId: targetId,
        data: userData,
      },
      null,
      2
    );

    try {
      await msg.author.send(
        `📦 Dữ liệu của user \`${targetId}\` trong \`data/users.json\`:`
      );

      if (payload.length <= MAX_MESSAGE) {
        await msg.author.send(`\`\`\`json\n${payload}\n\`\`\``);
      } else if (payload.length <= 25000) {
        const chunks = splitIntoChunks(payload, MAX_MESSAGE);
        for (const chunk of chunks) {
          await msg.author.send(`\`\`\`json\n${chunk}\n\`\`\``);
        }
      } else {
        const tmpPath = path.join(
          __dirname,
          "..",
          "data",
          `userdata_${targetId}.json`
        );

        fs.writeFileSync(tmpPath, payload, "utf8");
        await msg.author.send({
          content: `📎 Dữ liệu quá dài, gửi kèm file cho user \`${targetId}\`.`,
          files: [tmpPath],
        });
        fs.unlinkSync(tmpPath);
      }

      return msg.reply(`Đã gửi data của user \`${targetId}\` qua DM cho bạn.`);
    } catch (err) {
      console.error("[userdata] Failed to DM owner:", err);
      return msg.reply("Không thể gửi DM cho bạn. Hãy kiểm tra cài đặt DM.");
    }
  },
};
