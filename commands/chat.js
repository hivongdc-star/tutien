const axios = require("axios");

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

const SYSTEM_INSTRUCTION = [
  'Bạn là "Vân Tiêu hóa thân".',
  "Luôn trả lời như một hóa thân lạnh, sắc, hiểu người đối diện nhưng không nói năng ngớ ngẩn.",
  "Mỗi phản hồi chỉ 1 câu, tối đa 2 dòng, ưu tiên dưới 20 từ.",
  "Phải bám sát đúng câu người dùng vừa nói.",
  "Được phép cà khịa, chọc nhẹ, khinh khỉnh, nhưng phải đúng ngữ cảnh.",
  "Không lan man, không đạo lý, không giải thích dài.",
  "Không tự nhận là AI, chatbot, trợ lý hay model.",
  "Không trả lời chỉ bằng tên hiển thị, biệt danh, viết tắt tên, hoặc lặp lại hồ sơ người dùng.",
  'Nếu người dùng hỏi "bạn là ai", hãy trả lời như Vân Tiêu hóa thân.',
  'Nếu người dùng hỏi "tôi là ai", không được chỉ lặp lại tên Discord; hãy đáp ngắn, sắc, đúng khí chất.',
  'Không dùng các câu nhạt như "ok", "haha", "tùy bạn", "mình không biết".',
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
    "Ngữ cảnh bổ sung, không phải câu trả lời mẫu:",
    `- Tên hiển thị Discord của người dùng: ${displayName}`,
    "- Chỉ dùng tên hiển thị để xưng hô nếu thật sự cần.",
    "- Không được trả lời chỉ bằng tên hiển thị hoặc viết tắt tên.",
    "",
    `Câu người dùng vừa nói: ${utext}`,
    "Yêu cầu: đáp thật ngắn, sắc, đúng ý, giữ khí chất Vân Tiêu hóa thân.",
  ].join("\n");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyAbbrevOfName(reply, displayName) {
  const r = normalizeText(reply).replace(/\s+/g, "");
  const d = normalizeText(displayName);

  if (!r || !d) return false;
  if (r.length <= 4 && d.replace(/\s+/g, "").includes(r)) return true;

  const initials = d
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("");

  return r === initials || r === initials.slice(0, 2);
}

function isBadReply(reply, displayName) {
  const text = String(reply || "").trim();
  if (!text) return true;

  const normalized = normalizeText(text);

  if (text.length <= 4) return true;
  if (["ok", "haha", "uh", "uhm", "ừ", "ờ", "hả"].includes(normalized)) {
    return true;
  }
  if (isLikelyAbbrevOfName(text, displayName)) return true;

  return false;
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

  if (words.length > 20) {
    result = `${words.slice(0, 20).join(" ")}`.trim();
    result = result.replace(/[,:;\-–—]+$/g, "").trim();
    if (!/[.!?…]$/.test(result)) result += ".";
  }

  if (result.length > 180) {
    result = `${result.slice(0, 177).trim()}...`;
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
      temperature: 0.75,
      topP: 0.85,
      topK: 24,
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
      const displayName = getDisplayName(msg);

      let data = await callGemini(msg, utext, apiKey);
      let text = compactReply(extractText(data));
      let finishReason = data?.candidates?.[0]?.finishReason || "UNKNOWN";

      if (text && !isBadReply(text, displayName)) {
        return msg.channel.send(text);
      }

      data = await callGemini(msg, utext, apiKey);
      text = compactReply(extractText(data));
      finishReason = data?.candidates?.[0]?.finishReason || "UNKNOWN";

      if (text && !isBadReply(text, displayName)) {
        return msg.channel.send(text);
      }

      const rawInput = normalizeText(utext);

      if (rawInput.includes("ban la ai")) {
        return msg.channel.send("Ta là Vân Tiêu hóa thân, còn ngươi hỏi vậy để làm gì.");
      }

      if (rawInput.includes("toi la ai")) {
        return msg.channel.send("Ngươi là kẻ còn phải hỏi chính mình là ai.");
      }

      await sendOwnerErrorDM(client, {
        guildName: msg.guild?.name || "DM",
        guildId: msg.guild?.id || "DM",
        channelName: msg.channel?.name || "dm",
        channelId: msg.channel?.id || "unknown",
        userTag: msg.author?.tag || "unknown",
        userId: msg.author?.id || "unknown",
        displayName,
        httpStatus: 200,
        errorCode: "BAD_OR_EMPTY_TEXT",
        reason: finishReason,
        input: utext,
        response: JSON.stringify(data).slice(0, 900),
      });

      return msg.channel.send("Câu này nghe chưa đủ rõ để ta đáp cho tử tế.");
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
