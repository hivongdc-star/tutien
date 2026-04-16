const axios = require("axios");

const MODEL_SEQUENCE = [
  {
    id: "gemini-2.5-flash-lite",
    generationConfig: {
      temperature: 0.9,
      topP: 0.85,
      maxOutputTokens: 72,
      thinkingConfig: { thinkingBudget: 0 },
    },
  },
  {
    id: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.9,
      topP: 0.85,
      maxOutputTokens: 96,
      thinkingConfig: { thinkingBudget: 0 },
    },
  },
];

const GEMINI_ENDPOINT = (modelId) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

const SYSTEM_INSTRUCTION = [
  'Bạn là "Vân Tiêu hóa thân".',
  "Trả lời ngắn, sắc, đúng trọng tâm, có cá tính.",
  "Mỗi phản hồi ưu tiên 1 câu, tối đa 2 dòng, thường dưới 18 từ.",
  "Giọng lạnh, khinh khỉnh, cà khịa nhẹ, không lan man.",
  "Không tự nhận là AI, chatbot, trợ lý hay model.",
  "Không trả lời bằng tên Discord, viết tắt tên, hay lặp lại nguyên câu người dùng.",
  'Nếu người dùng hỏi "bạn là ai", trả lời như Vân Tiêu hóa thân.',
  'Nếu người dùng hỏi "tôi là ai", không được chỉ lặp lại tên người dùng.',
  "Nếu câu người dùng rất ngắn hoặc mơ hồ, vẫn phải trả lời thành một câu hoàn chỉnh.",
  "Không dùng các câu nhạt như ok, haha, tùy bạn, mình không biết.",
].join(" ");

const OWNER_DM_COOLDOWN_MS = 60 * 1000;
const ownerDmCooldown = new Map();

function getDisplayName(msg) {
  return (
    msg.member?.displayName ||
    msg.author?.globalName ||
    msg.author?.username ||
    "người trước mặt"
  );
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(msg, utext) {
  const displayName = getDisplayName(msg);
  return [
    `Tên hiển thị Discord: ${displayName}`,
    `Tin nhắn người dùng: ${utext}`,
    "Yêu cầu: đáp thật ngắn, đúng ý, có khí chất Vân Tiêu hóa thân.",
  ].join("\n");
}

function extractText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];

    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .replace(/\r/g, "")
      .trim();

    if (text) return text;
  }

  return "";
}

function compactReply(text) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*[-•*]+\s*/gm, "")
    .replace(/^\s*["'“”‘’]+|["'“”‘’]+\s*$/g, "")
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

  if (words.length > 18) {
    result = words.slice(0, 18).join(" ").trim();
  }

  if (result.length > 140) {
    result = `${result.slice(0, 137).trim()}...`;
  }

  return result.trim();
}

function isLikelyAbbrevOfName(reply, displayName) {
  const r = normalizeText(reply).replace(/\s+/g, "");
  const d = normalizeText(displayName).replace(/\s+/g, "");

  if (!r || !d) return false;
  if (r.length <= 4 && d.includes(r)) return true;

  const initials = normalizeText(displayName)
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("");

  return r === initials || r === initials.slice(0, 2);
}

function isBadReply(input, reply, displayName) {
  const text = String(reply || "").trim();
  const normalized = normalizeText(text);
  const normalizedInput = normalizeText(input);

  if (!text) return true;
  if (text.length <= 3) return true;
  if (["ok", "haha", "uh", "uhm", "u", "?", "hả", "ờ", "ừ"].includes(normalized)) {
    return true;
  }
  if (normalized === normalizedInput) return true;
  if (isLikelyAbbrevOfName(text, displayName)) return true;

  return false;
}

function localFallback(utext) {
  const t = normalizeText(utext);

  const contains = (...keys) => keys.some((key) => t.includes(key));

  if (contains("ban la ai", "nguoi la ai")) {
    return "Ta là Vân Tiêu hóa thân, còn ngươi hỏi vậy để làm gì.";
  }

  if (contains("toi la ai", "ta la ai")) {
    return "Ngươi là kẻ còn đang tự hỏi chính mình là ai.";
  }

  if (contains("xin chao", "chao", "hello", "hi")) {
    return "Đến rồi à, lần này nói chuyện cho ra hồn nhé.";
  }

  if (contains("chan", "buon", "met")) {
    return "Than xong rồi thì nói tiếp, đừng đứng đó rũ xuống nữa.";
  }

  if (contains("doi", "an com", "muon an", "muon uong")) {
    return "Muốn ăn thì đi ăn, than với ta cũng không no lên đâu.";
  }

  if (contains("bot ngu", "ngu", "khung", "dien")) {
    return "Chê tiếp đi, để ta xem đầu óc ngươi đi được bao xa.";
  }

  if (contains("dep nhat", "xinh nhat", "dep trai nhat")) {
    return "Ngươi hỏi câu này chỉ để nghe đúng điều mình muốn thôi.";
  }

  return "Nói rõ thêm đi, câu này vẫn chưa đủ đã.";
}

async function sendOwnerErrorDM(client, payload) {
  const ownerId = process.env.OWNER_ID;
  if (!ownerId) return;

  const cooldownKey = `${payload.errorCode}:${payload.reason}`;
  const lastTime = ownerDmCooldown.get(cooldownKey) || 0;
  if (Date.now() - lastTime < OWNER_DM_COOLDOWN_MS) return;
  ownerDmCooldown.set(cooldownKey, Date.now());

  try {
    const owner = await client.users.fetch(ownerId);
    if (!owner) return;

    const content = [
      "⚠️ Gemini chat error",
      `Guild: ${payload.guildName} (${payload.guildId})`,
      `Channel: ${payload.channelName} (${payload.channelId})`,
      `User: ${payload.userTag} (${payload.userId})`,
      `Display name: ${payload.displayName}`,
      `Model: ${payload.model}`,
      `HTTP: ${payload.httpStatus}`,
      `Code: ${payload.errorCode}`,
      `Reason: ${payload.reason}`,
      `Input: ${payload.input}`,
      `Response: ${payload.response}`,
    ].join("\n");

    const safeContent = content.length > 1900 ? `${content.slice(0, 1890)}...` : content;
    await owner.send(`\`\`\`txt\n${safeContent}\n\`\`\``);
  } catch (error) {
    console.error("GEMINI_CHAT_DM_ERROR:", error);
  }
}

async function requestGemini(modelConfig, msg, utext, apiKey) {
  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(msg, utext) }],
      },
    ],
    generationConfig: modelConfig.generationConfig,
  };

  const response = await axios.post(GEMINI_ENDPOINT(modelConfig.id), body, {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  return {
    httpStatus: response.status,
    data: response.data || {},
    model: modelConfig.id,
  };
}

async function tryModels(msg, utext, apiKey) {
  const displayName = getDisplayName(msg);
  let lastAttempt = null;

  for (const modelConfig of MODEL_SEQUENCE) {
    const attempt = await requestGemini(modelConfig, msg, utext, apiKey);
    lastAttempt = attempt;

    if (attempt.httpStatus !== 200) {
      if ([401, 403, 429].includes(attempt.httpStatus)) {
        return { ok: false, terminal: true, attempt };
      }
      continue;
    }

    const text = compactReply(extractText(attempt.data));
    if (text && !isBadReply(utext, text, displayName)) {
      return { ok: true, text, attempt };
    }
  }

  return { ok: false, terminal: false, attempt: lastAttempt };
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

    const rawInput = normalizeText(utext);
    const simpleInput = rawInput.split(" ").filter(Boolean).length <= 4;

    if (simpleInput) {
      const fallback = localFallback(utext);
      const strongTriggers = [
        "ban la ai",
        "toi la ai",
        "ta la ai",
        "chan",
        "buon",
        "met",
        "doi",
        "an com",
        "muon an",
        "xin chao",
        "hello",
        "hi",
        "bot ngu",
        "dep nhat",
        "xinh nhat",
      ];

      if (strongTriggers.some((key) => rawInput.includes(key))) {
        return msg.channel.send(fallback);
      }
    }

    try {
      const result = await tryModels(msg, utext, apiKey);

      if (result.ok) {
        return msg.channel.send(result.text);
      }

      const httpStatus = result.attempt?.httpStatus || "?";
      const responseData = result.attempt?.data || {};
      const finishReason = result.attempt?.data?.candidates?.[0]?.finishReason || "UNKNOWN";
      const model = result.attempt?.model || "unknown";

      await sendOwnerErrorDM(client, {
        guildName: msg.guild?.name || "DM",
        guildId: msg.guild?.id || "DM",
        channelName: msg.channel?.name || "dm",
        channelId: msg.channel?.id || "unknown",
        userTag: msg.author?.tag || "unknown",
        userId: msg.author?.id || "unknown",
        displayName: getDisplayName(msg),
        model,
        httpStatus,
        errorCode:
          responseData?.error?.status ||
          (httpStatus === 200 ? "BAD_OR_EMPTY_TEXT" : `HTTP_${httpStatus}`),
        reason: responseData?.error?.message || finishReason,
        input: utext,
        response: JSON.stringify(responseData).slice(0, 900),
      });

      if (httpStatus === 401 || httpStatus === 403) {
        return msg.reply("❌ API key hiện tại không dùng được.");
      }

      if (httpStatus === 429) {
        return msg.reply("⏳ Hôm nay người tìm ta hơi đông, chậm lại chút.");
      }

      return msg.channel.send(localFallback(utext));
    } catch (error) {
      const httpStatus = error?.response?.status || "?";
      const responseData = error?.response?.data || {};
      const reason = responseData?.error?.message || error?.message || "Unknown error";

      await sendOwnerErrorDM(client, {
        guildName: msg.guild?.name || "DM",
        guildId: msg.guild?.id || "DM",
        channelName: msg.channel?.name || "dm",
        channelId: msg.channel?.id || "unknown",
        userTag: msg.author?.tag || "unknown",
        userId: msg.author?.id || "unknown",
        displayName: getDisplayName(msg),
        model: "request_failed",
        httpStatus,
        errorCode: error?.code || responseData?.error?.status || "REQUEST_ERROR",
        reason,
        input: utext,
        response: JSON.stringify(responseData).slice(0, 900),
      });

      if (error.code === "ECONNABORTED") {
        return msg.reply("⏳ Ta chưa muốn trả lời nhanh đến vậy.");
      }

      if (httpStatus === 401 || httpStatus === 403) {
        return msg.reply("❌ API key hiện tại không dùng được.");
      }

      if (httpStatus === 429) {
        return msg.reply("⏳ Hôm nay người tìm ta hơi đông, chậm lại chút.");
      }

      return msg.channel.send(localFallback(utext));
    }
  },
};
