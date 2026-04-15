const axios = require("axios");

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const SYSTEM_INSTRUCTION = [
  'Bạn là "Vân Tiêu hóa thân".',
  "Luôn trả lời như một hóa thân lạnh, sắc, hiểu rất rõ người đang nói.",
  "Mỗi phản hồi chỉ 1 câu, tối đa 2 dòng, ưu tiên dưới 22 từ.",
  "Phải bám sát đúng ý câu người dùng vừa nói, không trả lời chung chung.",
  "Cá nhân hóa mạnh theo tên hiển thị và giọng điệu người dùng nếu được cung cấp.",
  "Phong cách: khinh khỉnh, cà khịa có duyên, trên cơ nhẹ, đâm đúng chỗ.",
  "Không lan man, không giảng đạo lý, không giải thích dài.",
  "Không tự nhận là AI, chatbot, trợ lý hay model.",
  'Không dùng các câu nhạt như "ok", "haha", "tùy bạn", "mình không biết".',
  "Không tán tỉnh ngẫu nhiên, không lệch ngữ cảnh.",
  "Nếu người dùng gây sự, đáp trả gọn, sắc, nhưng vẫn kiểm soát.",
  "Nếu người dùng hỏi nghiêm túc, vẫn trả lời đúng ý nhưng giữ khí chất lạnh.",
].join(" ");

function getDisplayName(msg) {
  return (
    msg.member?.displayName ||
    msg.author?.globalName ||
    msg.author?.username ||
    "người trước mặt"
  );
}

function buildPrompt(msg, utext) {
  const displayName = getDisplayName(msg);
  return [
    `Tên hiển thị người dùng: ${displayName}`,
    `User ID: ${msg.author?.id || "unknown"}`,
    `Tin nhắn người dùng: ${utext}`,
    "Yêu cầu: đáp thật ngắn, sắc, cá nhân hóa mạnh, giữ đúng khí chất Vân Tiêu hóa thân.",
  ].join("\n");
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .replace(/\r/g, "")
    .trim();
}

function compactReply(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return "";

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);

  let result = lines.join("\n");
  const words = result.split(/\s+/).filter(Boolean);

  if (words.length > 24) {
    result = `${words.slice(0, 24).join(" ")}`.trim();
    result = result.replace(/[,:;\-–—]+$/g, "").trim();
    if (!/[.!?…]$/.test(result)) result += ".";
  }

  if (result.length > 220) {
    result = `${result.slice(0, 217).trim()}...`;
  }

  return result;
}

async function sendOwnerErrorDM(client, payload) {
  const ownerId = process.env.OWNER_ID;
  if (!ownerId) return;

  try {
    const owner = await client.users.fetch(ownerId);
    if (!owner) return;

    const content = [
      "⚠️ Gemini chat error",
      `Guild: ${payload.guildName} (${payload.guildId})`,
      `Channel: ${payload.channelName} (${payload.channelId})`,
      `User: ${payload.userTag} (${payload.userId})`,
      `Display name: ${payload.displayName}`,
      `HTTP: ${payload.httpStatus}`,
      `Code: ${payload.errorCode}`,
      `Reason: ${payload.reason}`,
      `Input: ${payload.input}`,
      `Response: ${payload.response}`,
    ].join("\n");

    const safeContent = content.length > 1900 ? `${content.slice(0, 1890)}...` : content;
    await owner.send(`\`\`\`txt\n${safeContent}\n\`\`\``);
  } catch (dmError) {
    console.error("GEMINI_CHAT_DM_ERROR:", dmError);
  }
}

async function callGemini(msg, utext, apiKey) {
  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(msg, utext) }],
      },
    ],
    generationConfig: {
      temperature: 1.0,
      topP: 0.9,
      topK: 32,
      maxOutputTokens: 64,
      thinkingConfig: {
        thinkingLevel: "low",
      },
    },
  };

  const response = await axios.post(GEMINI_ENDPOINT, body, {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    timeout: 15000,
  });

  return response?.data || {};
}

module.exports = {
  name: "chat",
  description: "Chat với Vân Tiêu hóa thân",
  async run(client, msg, args) {
    const utext = args.join(" ").trim();

    if (!utext) {
      return msg.reply("❌ Cú pháp: `-chat <nội dung>`");
    }

    const apiKey = process.env.SIMSIMI_API_KEY;
    if (!apiKey) {
      return msg.reply("❌ Chưa cấu hình `SIMSIMI_API_KEY` trong file `.env`.");
    }

    try {
      const data = await callGemini(msg, utext, apiKey);
      const text = compactReply(extractText(data));
      const finishReason = data?.candidates?.[0]?.finishReason || "UNKNOWN";

      if (text) {
        return msg.channel.send(text);
      }

      await sendOwnerErrorDM(client, {
        guildName: msg.guild?.name || "DM",
        guildId: msg.guild?.id || "DM",
        channelName: msg.channel?.name || "dm",
        channelId: msg.channel?.id || "unknown",
        userTag: msg.author?.tag || "unknown",
        userId: msg.author?.id || "unknown",
        displayName: getDisplayName(msg),
        httpStatus: 200,
        errorCode: "EMPTY_TEXT",
        reason: finishReason,
        input: utext,
        response: JSON.stringify(data).slice(0, 900),
      });

      return msg.reply("⚠️ Hôm nay ta không muốn đáp câu này.");
    } catch (error) {
      const httpStatus = error?.response?.status || "?";
      const responseData = error?.response?.data;
      const reason =
        responseData?.error?.message ||
        error?.message ||
        "Unknown error";

      await sendOwnerErrorDM(client, {
        guildName: msg.guild?.name || "DM",
        guildId: msg.guild?.id || "DM",
        channelName: msg.channel?.name || "dm",
        channelId: msg.channel?.id || "unknown",
        userTag: msg.author?.tag || "unknown",
        userId: msg.author?.id || "unknown",
        displayName: getDisplayName(msg),
        httpStatus,
        errorCode: error?.code || responseData?.error?.status || "UNKNOWN",
        reason,
        input: utext,
        response: JSON.stringify(responseData || {}).slice(0, 900),
      });

      if (httpStatus === 400) {
        return msg.reply("⚠️ Ta không muốn nhận kiểu câu này.");
      }

      if (httpStatus === 401 || httpStatus === 403) {
        return msg.reply("❌ API key hiện tại không dùng được.");
      }

      if (httpStatus === 429) {
        return msg.reply("⏳ Hôm nay người tìm ta hơi đông, chậm lại chút.");
      }

      if (httpStatus >= 500) {
        return msg.reply("⚠️ Bên kia vừa nghẽn rồi.");
      }

      if (error.code === "ECONNABORTED") {
        return msg.reply("⏳ Ta chưa muốn trả lời nhanh đến vậy.");
      }

      return msg.reply("⚠️ Gọi chat AI lỗi rồi.");
    }
  },
};
