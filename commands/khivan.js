// 2/commands/khivan.js
// 🔮 Khí vận theo Kinh Dịch — 7 bậc: Đại Cát → Cát → Tiểu Cát → Bình → Tiểu Hung → Hung → Đại Hung
// Chuẩn hóa theo dự án: export { name, description, aliases, usage, run(client, msg, args) }
// ❗ Không dùng template string để tránh lỗi copy/paste (${...}) → chỉ dùng chuỗi thường.

const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ==== JST date + RNG deterministic ====
function getJSTDateKey() {
  const nowJST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = nowJST.getFullYear();
  const m = String(nowJST.getMonth() + 1).padStart(2, "0");
  const d = String(nowJST.getDate()).padStart(2, "0");
  return y + m + d; // YYYYMMDD
}
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35);
  return h >>> 0;
}
function createPRNG(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

// ==== Static pools ====
const NGU_HANH = ["Kim", "Mộc", "Thủy", "Hỏa", "Thổ"];
const HUONG = ["Đông", "Tây", "Nam", "Bắc", "Đông Nam", "Tây Nam", "Đông Bắc", "Tây Bắc"];
const MAU = [
  { name: "Đen huyền", hex: 0x111111 }, { name: "Trắng ngọc", hex: 0xEEEEEE },
  { name: "Xanh lục", hex: 0x22AA66 }, { name: "Xanh dương", hex: 0x2A6FE8 },
  { name: "Đỏ son", hex: 0xE53935 }, { name: "Vàng kim", hex: 0xF6C343 },
  { name: "Tím mộng", hex: 0x8E44AD }, { name: "Nâu đất", hex: 0x8D6E63 },
  { name: "Xám bạc", hex: 0x95A5A6 }, { name: "Lam nhạt", hex: 0x7FB3D5 }
];
const LOI_NHAN = [
  "Giữ tâm bất biến giữa dòng đời vạn biến.",
  "Tiến một, giữ hai, lùi một — đúng thời thì làm.",
  "Hoàn thành việc nhỏ quan trọng ngay.",
  "Hít sâu, làm chậm, ưu tiên thứ tự.",
  "Tránh tranh biện vô ích; hành động nói thay.",
  "Đắc thời chớ kiêu, thất thời chớ nản.",
  "Gieo thiện niệm, gặt thiện duyên.",
  "Tĩnh để biết, động để thành.",
  "Cát tại tâm, hung do vọng.",
  "Dọn gọn một góc — thông một việc."
];

// ==== BÁT QUÁI ====
const TRIGRAMS = [
  { code: 0, name: "Khôn", symbol: "☷" },
  { code: 1, name: "Cấn", symbol: "☶" },
  { code: 2, name: "Khảm", symbol: "☵" },
  { code: 3, name: "Tốn", symbol: "☴" },
  { code: 4, name: "Chấn", symbol: "☳" },
  { code: 5, name: "Ly",   symbol: "☲" },
  { code: 6, name: "Đoài", symbol: "☱" },
  { code: 7, name: "Càn",  symbol: "☰" },
];
const codeToTri = (c) => TRIGRAMS.find(t => t.code === c);
const nameToTri = (n) => TRIGRAMS.find(t => t.name === n);
const TRI_PAIR = { "Càn": "Khôn", "Khôn": "Càn", "Khảm": "Ly", "Ly": "Khảm", "Chấn": "Tốn", "Tốn": "Chấn", "Cấn": "Đoài", "Đoài": "Cấn" };

function makeSixLines(rng) { return Array.from({ length: 6 }, () => (rng() < 0.5 ? 0 : 1)); }
function linesToTriCode(lines, startIdx) {
  return (lines[startIdx] ? 1 : 0) | (lines[startIdx + 1] ? 2 : 0) | (lines[startIdx + 2] ? 4 : 0);
}
function renderHex(lines) {
  const lineStr = (b) => (b ? "———" : "— —");
  return [5,4,3,2,1,0].map(function(i){ return lineStr(lines[i]); }).join("\n");
}
function triLabel(code) { const t = codeToTri(code); return t.symbol + " " + t.name; }
function makeCompatHexagrams(upperCode, lowerCode) {
  const up = codeToTri(upperCode), low = codeToTri(lowerCode);
  const upPair = nameToTri(TRI_PAIR[up.name]); const lowPair = nameToTri(TRI_PAIR[low.name]);
  return { upperCompat: { upper: upPair, lower: low }, lowerCompat: { upper: up, lower: lowPair }, doubleCompat: { upper: upPair, lower: lowPair } };
}

// ==== Load 64 hex data ====
let ICHING_CACHE = null;
function loadIChingVI() {
  if (ICHING_CACHE) return ICHING_CACHE;
  const p = path.join(__dirname, "../data/iching_vi.json");
  try { ICHING_CACHE = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { ICHING_CACHE = []; }
  return ICHING_CACHE;
}
function findHexRecord(upperCode, lowerCode) {
  const iching = loadIChingVI();
  const up = codeToTri(upperCode) ? codeToTri(upperCode).name : null;
  const low = codeToTri(lowerCode) ? codeToTri(lowerCode).name : null;
  if (!up || !low) return null;
  return iching.find(h => h.upper === up && h.lower === low) || null;
}

// ==== Tier 7 + điểm ====
function tierFromScore7(score) {
  if (score >= 90) return { tier: "Đại Cát", emoji: "✨", note: "Thời cơ chín, nên hành đại sự.", color: 0xF6C343 };
  if (score >= 80) return { tier: "Cát", emoji: "🌟", note: "Thuận lợi chủ đạo, quyết nhanh việc chính.", color: 0x2ECC71 };
  if (score >= 70) return { tier: "Tiểu Cát", emoji: "💫", note: "Khá tốt, kiên trì sẽ nên.", color: 0x7FB3D5 };
  if (score >= 55) return { tier: "Bình", emoji: "🌤️", note: "Ổn định, lo phần nền.", color: 0x95A5A6 };
  if (score >= 40) return { tier: "Tiểu Hung", emoji: "🌫️", note: "Cẩn thận chi tiết, tránh vội.", color: 0x8D6E63 };
  if (score >= 25) return { tier: "Hung", emoji: "⚠️", note: "Giảm rủi ro, trì hoãn quyết định lớn.", color: 0xE67E22 };
  return { tier: "Đại Hung", emoji: "☠️", note: "Thu mình dưỡng sức, chờ thời.", color: 0xE53935 };
}
const TIER7_CENTROIDS = { "Đại Cát":95,"Cát":85,"Tiểu Cát":75,"Bình":62,"Tiểu Hung":47,"Hung":32,"Đại Hung":15 };
function evaluateTierFromHex(hexRec, rng) {
  var baseTier = hexRec && hexRec.tier7 ? hexRec.tier7 : null;
  if (!baseTier && hexRec && typeof hexRec.scoreHint === "number") baseTier = tierFromScore7(hexRec.scoreHint).tier;
  if (!baseTier) baseTier = "Bình";
  const centroid = TIER7_CENTROIDS[baseTier] || 62;
  const jitter = Math.floor((rng() - 0.5) * 12);
  const score = Math.max(0, Math.min(100, centroid + jitter));
  const t = tierFromScore7(score);
  return { score: score, tier: t.tier, emoji: t.emoji, note: t.note, color: t.color, baseTier: baseTier };
}
function bar(score) {
  const filled = Math.round(score / 10);
  return "▰".repeat(filled) + "▱".repeat(10 - filled);
}

module.exports = {
  name: "khivan",
  description: "Bói khí vận hôm nay (JST) dựa theo Kinh Dịch — 7 bậc: Đại Cát → ... → Đại Hung.",
  aliases: ["kv", "kivan", "khi", "khi-van", "fortune", "luck"],
  usage: "-khivan [@ai đó (tuỳ chọn)]",
  run: async (client, msg, args) => {
    const dateKey = getJSTDateKey();
    const target = (msg.mentions && msg.mentions.users && msg.mentions.users.first && msg.mentions.users.first()) || msg.author;
    const rng = createPRNG(hash32(String(target.id) + "-" + dateKey));

    // Phụ trợ
    const element = pick(rng, NGU_HANH);
    const color = pick(rng, MAU);
    const direction = pick(rng, HUONG);
    const luckyNumber = clamp(Math.floor(rng() * 90) + 10, 10, 99);
    const tip = pick(rng, LOI_NHAN);

    // Quẻ
    const six = makeSixLines(rng);
    const lowerCode = linesToTriCode(six, 0);
    const upperCode = linesToTriCode(six, 3);
    const hexAscii = renderHex(six);

    const upLabel = triLabel(upperCode);
    const lowLabel = triLabel(lowerCode);
    const compat = makeCompatHexagrams(upperCode, lowerCode);

    const hexRec = findHexRecord(upperCode, lowerCode);
    const evald = evaluateTierFromHex(hexRec, rng);
    const adjScore = evald.score, tier = evald.tier, emoji = evald.emoji, note = evald.note, tierColor = evald.color;

    const embed = new EmbedBuilder()
      .setColor(tierColor || color.hex)
      .setTitle("🔮 Bói Khí Vận Hôm Nay")
      .setDescription(
        emoji + " **" + tier + "** _(theo Kinh Dịch)_ — " + note + "\n" +
        "**" + bar(adjScore) + "**  " + "\\`" + adjScore + "/100\\`" + "\n\n" +
        "> Kết quả cố định trong ngày " +
        dateKey.slice(0,4) + "-" + dateKey.slice(4,6) + "-" + dateKey.slice(6) +
        " (JST) đối với " + "**" + target.username + "**."
      );

    if (hexRec) {
      const titleLine = "**" + (hexRec.symbol || "") + " " + (hexRec.vn || "Quẻ") + "**" +
        (hexRec.han ? " — " + hexRec.han : "") + (hexRec.no ? " (Quẻ " + hexRec.no + ")" : "");
      const luckLines =
        (hexRec.luck && hexRec.luck.career ? "• CV: " + hexRec.luck.career + "\n" : "") +
        (hexRec.luck && hexRec.luck.wealth ? "• Tài: " + hexRec.luck.wealth + "\n" : "") +
        (hexRec.luck && hexRec.luck.love   ? "• Tình: " + hexRec.luck.love   + "\n" : "") +
        (hexRec.luck && hexRec.luck.health ? "• SK: " + hexRec.luck.health : "");
      embed.addFields(
        { name: "Bản quẻ", value: "```\n" + hexAscii + "\n```\n" + "**Thượng:** " + upLabel + "\n" + "**Hạ:** " + lowLabel + "\n" + titleLine },
        { name: "Lời quẻ", value: (hexRec.judgment || "—").slice(0, 256), inline: false },
        { name: "Tượng", value: (hexRec.image || "—").slice(0, 256), inline: false },
        { name: "Nên", value: (hexRec.do || []).slice(0,3).map(function(i){return "• " + i;}).join("\n") || "—", inline: true },
        { name: "Tránh", value: (hexRec.dont || []).slice(0,3).map(function(i){return "• " + i;}).join("\n") || "—", inline: true },
        { name: "Gợi ý 4 mặt", value: luckLines || "—", inline: false }
      );
    }

    // Phụ trợ
    embed.addFields(
      { name: "Hành khí", value: element, inline: true },
      { name: "Màu cát tường", value: (hexRec && hexRec.colorHint) ? hexRec.colorHint : color.name, inline: true },
      { name: "Con số may mắn", value: String(luckyNumber), inline: true },
      { name: "Phương hướng thuận", value: (hexRec && hexRec.directionHint) ? hexRec.directionHint : direction, inline: true },
      { name: "Lời nhắn", value: tip, inline: false }
    );

    // Quẻ hợp
    const upperCompatLabel = triLabel(compat.upperCompat.upper.code) + " trên " + triLabel(compat.upperCompat.lower.code);
    const lowerCompatLabel = triLabel(compat.lowerCompat.upper.code) + " trên " + triLabel(compat.lowerCompat.lower.code);
    const doubleCompatLabel = triLabel(compat.doubleCompat.upper.code) + " trên " + triLabel(compat.doubleCompat.lower.code);
    embed.addFields(
      { name: "Quẻ hợp (theo Thượng)", value: upperCompatLabel, inline: true },
      { name: "Quẻ hợp (theo Hạ)", value: lowerCompatLabel, inline: true },
      { name: "Song hợp", value: doubleCompatLabel, inline: true }
    );

    embed.setFooter({ text: "Đổi ngày (JST) sẽ đổi khí vận. Dùng: -khivan [@user]" });
    return msg.reply({ embeds: [embed] });
  },
};
