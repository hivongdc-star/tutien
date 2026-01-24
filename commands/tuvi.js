const axios = require("axios");
const { EmbedBuilder } = require("discord.js");

// ===== Helpers =====
function norm(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "").trim();
}

const SIGN_SYNONYMS = {
  aries: ["aries", "bach duong", "bd"],
  taurus: ["taurus", "kim nguu", "kim ngu", "kn"],
  gemini: ["gemini", "song tu", "st"],
  cancer: ["cancer", "cu giai", "cg"],
  leo: ["leo", "su tu", "sutu"],
  virgo: ["virgo", "xu nu", "xn"],
  libra: ["libra", "thien binh", "tb"],
  scorpio: ["scorpio", "bo cap", "bocap", "thien yet", "thien y et"],
  sagittarius: ["sagittarius", "nhan ma", "nm"],
  capricorn: ["capricorn", "ma ket", "mk"],
  aquarius: ["aquarius", "bao binh", "bb"],
  pisces: ["pisces", "song ngu", "sn"],
};

const SIGN_MAP = (() => {
  const m = {};
  for (const [canon, arr] of Object.entries(SIGN_SYNONYMS)) {
    for (const s of arr) m[norm(s)] = canon;
  }
  return m;
})();

const SIGN_VI_NAME = {
  aries: "Bạch Dương",
  taurus: "Kim Ngưu",
  gemini: "Song Tử",
  cancer: "Cự Giải",
  leo: "Sư Tử",
  virgo: "Xử Nữ",
  libra: "Thiên Bình",
  scorpio: "Bọ Cạp",
  sagittarius: "Nhân Mã",
  capricorn: "Ma Kết",
  aquarius: "Bảo Bình",
  pisces: "Song Ngư",
};

const COLOR_VI = {
  red: "Đỏ", blue: "Xanh lam", green: "Xanh lục", yellow: "Vàng", orange: "Cam",
  purple: "Tím", pink: "Hồng", black: "Đen", white: "Trắng", gray: "Xám",
  brown: "Nâu", silver: "Bạc", gold: "Vàng kim", navy: "Xanh hải quân",
  teal: "Xanh mòng két", maroon: "Đỏ đô", beige: "Be", cyan: "Xanh lơ",
};

const MOOD_VI = {
  happy: "Vui vẻ", sad: "Buồn", calm: "Bình tĩnh", energetic: "Tràn đầy năng lượng",
  focused: "Tập trung", romantic: "Lãng mạn", thoughtful: "Suy tư", optimistic: "Lạc quan",
  pessimistic: "Bi quan", lucky: "May mắn", creative: "Sáng tạo", relaxed: "Thư thái",
  adventurous: "Ưa mạo hiểm", emotional: "Cảm xúc", practical: "Thực tế",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Try several public translators (no key). Return original text on failure.
async function translateVI(text) {
  const t = String(text || "").trim();
  if (!t) return t;

  // 1) Argos OpenTech (LibreTranslate instance)
  try {
    const { data } = await axios.post(
      "https://translate.argosopentech.com/translate",
      { q: t, source: "en", target: "vi", format: "text" },
      { timeout: 7000, headers: { "Content-Type": "application/json" } }
    );
    if (data?.translatedText) return data.translatedText;
  } catch (_) {}

  // 2) LibreTranslate.com (may throttle)
  try {
    const { data } = await axios.post(
      "https://libretranslate.com/translate",
      { q: t, source: "en", target: "vi", format: "text" },
      { timeout: 7000, headers: { "Content-Type": "application/json" } }
    );
    if (data?.translatedText) return data.translatedText;
  } catch (_) {}

  // 3) MyMemory
  try {
    const { data } = await axios.get("https://api.mymemory.translated.net/get", {
      params: { q: t.slice(0, 450), langpair: "en|vi" },
      timeout: 7000,
    });
    const out = data?.responseData?.translatedText;
    if (out) return out;
  } catch (_) {}

  return t; // fallback: original
}

function viColor(s) {
  const n = norm(String(s || ""));
  return COLOR_VI[n] || s;
}

function viMood(s) {
  const n = norm(String(s || ""));
  return MOOD_VI[n] || s;
}

function viSignName(s) {
  const n = norm(String(s || ""));
  return SIGN_VI_NAME[n] || s;
}

// Primary: Ohmanda (free, no key)
async function fetchOhmanda(sign) {
  const url = `https://ohmanda.com/api/horoscope/${encodeURIComponent(sign)}`;
  const { data } = await axios.get(url, { timeout: 7000 });
  if (!data?.horoscope) throw new Error("ohmanda: empty data");
  return {
    src: "Ohmanda",
    current_date: data.date || "",
    description: data.horoscope || "",
  };
}

// Fallback 1: Vercel wrapper (free, no key)
async function fetchVercel(sign) {
  const url = "https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily";
  const { data } = await axios.get(url, { params: { sign, day: "today" }, timeout: 7000 });
  const d = data?.data;
  if (!d?.horoscope_data) throw new Error("vercel: empty data");
  return {
    src: "Horoscope Fallback",
    current_date: d.date || "",
    description: d.horoscope_data || "",
  };
}

// Aztro for metadata enrichment (POST, no key) — retry x2
async function fetchAztro(sign) {
  const url = `https://aztro.sameerkumar.website/?sign=${encodeURIComponent(sign)}&day=today`;
  const headers = { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "cultivation-bot/1.5.6" };
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const { data } = await axios.post(url, "", { headers, timeout: 7000 });
      if (!data?.description) throw new Error("aztro: empty data");
      return { src: "Aztro", ...data };
    } catch (e) {
      last = e;
      const code = e?.response?.status;
      if (code && code < 500) break;
      await sleep(800 * (i + 1));
    }
  }
  throw last || new Error("aztro failed");
}

// Merge fields (use base, fill missing from enrich)
function enrich(base, extra) {
  const fields = ["compatibility", "mood", "color", "lucky_number", "lucky_time", "date_range", "current_date"];
  const out = { ...base };
  for (const k of fields) {
    if (!out[k] && extra[k]) out[k] = extra[k];
  }
  out.src = base.src === "Aztro" ? "Aztro" : `${base.src} + Aztro`;
  return out;
}

module.exports = {
  name: "tuvi",
  description: "Xem tử vi HÔM NAY theo 12 cung hoàng đạo (VI hoá nội dung)",
  aliases: ["tv", "horoscope", "zodiac"],
  usage: "-tuvi <cung>\nVD: -tuvi kim nguu | -tuvi bo cap",
  run: async (client, msg, args) => {
    try {
      if (!args || args.length === 0) {
        return msg.reply(
          "📌 Cách dùng: `-tuvi <cung>`\n" +
          "Ví dụ: `-tuvi kim nguu`, `-tuvi bo cap`.\n" +
          "Các cung: Bạch Dương, Kim Ngưu, Song Tử, Cự Giải, Sư Tử, Xử Nữ, Thiên Bình, Bọ Cạp, Nhân Mã, Ma Kết, Bảo Bình, Song Ngư."
        );
      }
      const signCanon = SIGN_MAP[norm(args.join(" "))];
      if (!signCanon) return msg.reply("❌ Không nhận dạng được **cung hoàng đạo**. Thử lại nhé!");

      let result = null;
      // 1) Thử Ohmanda; nếu lỗi -> Vercel; nếu vẫn lỗi -> Aztro (full)
      try {
        result = await fetchOhmanda(signCanon);
      } catch (e1) {
        try {
          result = await fetchVercel(signCanon);
        } catch (e2) {
          result = await fetchAztro(signCanon); // đã có đủ metadata
        }
      }

      // 2) Nếu nguồn không có metadata -> enrich bằng Aztro (best-effort)
      if (result.src !== "Aztro") {
        try {
          const az = await fetchAztro(signCanon);
          result = enrich(result, az);
        } catch (e) {
          // im lặng nếu enrich thất bại
        }
      }

      // 3) Việt hoá nội dung mô tả và một số trường
      if (result.description) result.description = await translateVI(result.description);
      if (result.mood) result.mood = viMood(result.mood);
      if (result.color) result.color = viColor(result.color);
      if (result.compatibility) {
        // Thử map sang tên cung TV; nếu không map được thì dịch
        const mapped = viSignName(result.compatibility);
        result.compatibility = mapped === result.compatibility ? await translateVI(result.compatibility) : mapped;
      }

      // Build fields dynamically
      const fields = [];
      if (result.compatibility) fields.push({ name: "🤝 Hợp cạ", value: String(result.compatibility), inline: true });
      if (result.mood)          fields.push({ name: "😊 Tâm trạng", value: String(result.mood), inline: true });
      if (result.color)         fields.push({ name: "🎨 Màu may mắn", value: String(result.color), inline: true });
      if (result.lucky_number)  fields.push({ name: "🔢 Số may mắn", value: String(result.lucky_number), inline: true });
      if (result.lucky_time)    fields.push({ name: "🕒 Giờ may mắn", value: String(result.lucky_time), inline: true });
      if (result.date_range)    fields.push({ name: "📅 Khoảng ngày", value: String(result.date_range), inline: true });

      const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`🔮 Hôm nay · ${SIGN_VI_NAME[signCanon]}${result.current_date ? ` (${result.current_date})` : ""}`)
        .setDescription(result.description || "Không có dữ liệu.")
        .setFooter({ text: `Nguồn: ${result.src} · Tiễn Tình` })
        .setTimestamp();

      if (fields.length) embed.addFields(fields);

      return msg.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error("tuvi error:", err?.response?.status || err?.message || err);
      return msg.reply("⚠️ Hệ thống tử vi đang bận. Thử lại sau một lát nhé!");
    }
  },
};
