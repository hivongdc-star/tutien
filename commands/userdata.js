const fs = require("fs");
const path = require("path");

const USERS_PATH = path.join(__dirname, "..", "data", "users.json");
const BATTU_PROFILES_PATH = path.join(__dirname, "..", "data", "battu_profiles.json");
const MAX_MESSAGE = 1900;

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`[userdata] Failed to parse ${filePath}:`, err);
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
  description: "Owner-only: DM toàn bộ data của 1 user từ users.json và battu_profiles.json",

  run: async (client, msg, args) => {
    const ownerId = process.env.OWNER_ID;

    if (!ownerId) {
      return msg.reply("Thiếu cấu hình OWNER_ID trong môi trường.");
    }

    if (msg.author.id !== ownerId) {
      return msg.reply("Đạo hữu không có quyền dùng lệnh này.");
    }

    const targetId = resolveTargetId(msg, args);
    if (!targetId) {
      return msg.reply("Dùng: `-userdata @user` hoặc `-userdata <userId>`");
    }

    const users = loadJson(USERS_PATH);
    const battuProfiles = loadJson(BATTU_PROFILES_PATH);

    const coreUserData = users[targetId] ?? null;
    const battuProfile = battuProfiles[targetId] ?? null;

    if (!coreUserData && !battuProfile) {
      return msg.reply(`Không tìm thấy dữ liệu cho user \`${targetId}\`.`);
    }

    const payload = JSON.stringify(
      {
        userId: targetId,
        sources: {
          usersJson: USERS_PATH,
          battuProfilesJson: BATTU_PROFILES_PATH,
        },
        data: {
          users: coreUserData,
          battuProfile: battuProfile,
        },
      },
      null,
      2
    );

    try {
      await msg.author.send(
        `📦 Dữ liệu của user \`${targetId}\`:\n- users.json: ${coreUserData ? "có" : "không"}\n- battu_profiles.json: ${battuProfile ? "có" : "không"}`
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

      return msg.reply(`Đã gửi hồ sơ kiểm tra của user \`${targetId}\` qua DM.`);
    } catch (err) {
      console.error("[userdata] Failed to DM owner:", err);
      return msg.reply("Không thể gửi DM. Hãy kiểm tra cài đặt tin nhắn riêng.");
    }
  },
};
