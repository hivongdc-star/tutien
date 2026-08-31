const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// ==================================================
// BÁT TỰ + KHÍ VẬN — SELF-CONTAINED FEATURE
// Không phụ thuộc bộ battu_*.json cũ đã thất lạc.
// ==================================================
const PROFILE_PATH = path.join(__dirname, "../data/battu_profiles.json");
const PROFILE_VERSION = 4;
const TZ = "Asia/Ho_Chi_Minh";
const BIRTH_YEAR_MIN = 1940;
const BIRTH_YEAR_MAX = new Date().getFullYear();
const STANDARD_MERIDIAN = 105;

const STEMS = [
  { name: "Giáp", element: "Mộc", polarity: "Dương" },
  { name: "Ất", element: "Mộc", polarity: "Âm" },
  { name: "Bính", element: "Hỏa", polarity: "Dương" },
  { name: "Đinh", element: "Hỏa", polarity: "Âm" },
  { name: "Mậu", element: "Thổ", polarity: "Dương" },
  { name: "Kỷ", element: "Thổ", polarity: "Âm" },
  { name: "Canh", element: "Kim", polarity: "Dương" },
  { name: "Tân", element: "Kim", polarity: "Âm" },
  { name: "Nhâm", element: "Thủy", polarity: "Dương" },
  { name: "Quý", element: "Thủy", polarity: "Âm" },
];
const BRANCHES = [
  { name: "Tý", element: "Thủy" }, { name: "Sửu", element: "Thổ" },
  { name: "Dần", element: "Mộc" }, { name: "Mão", element: "Mộc" },
  { name: "Thìn", element: "Thổ" }, { name: "Tỵ", element: "Hỏa" },
  { name: "Ngọ", element: "Hỏa" }, { name: "Mùi", element: "Thổ" },
  { name: "Thân", element: "Kim" }, { name: "Dậu", element: "Kim" },
  { name: "Tuất", element: "Thổ" }, { name: "Hợi", element: "Thủy" },
];
const HIDDEN_STEMS = {
  "Tý": ["Quý"], "Sửu": ["Kỷ", "Quý", "Tân"], "Dần": ["Giáp", "Bính", "Mậu"],
  "Mão": ["Ất"], "Thìn": ["Mậu", "Ất", "Quý"], "Tỵ": ["Bính", "Mậu", "Canh"],
  "Ngọ": ["Đinh", "Kỷ"], "Mùi": ["Kỷ", "Đinh", "Ất"], "Thân": ["Canh", "Nhâm", "Mậu"],
  "Dậu": ["Tân"], "Tuất": ["Mậu", "Tân", "Đinh"], "Hợi": ["Nhâm", "Giáp"],
};
const GENERATES = { "Mộc": "Hỏa", "Hỏa": "Thổ", "Thổ": "Kim", "Kim": "Thủy", "Thủy": "Mộc" };
const CONTROLS = { "Mộc": "Thổ", "Thổ": "Thủy", "Thủy": "Hỏa", "Hỏa": "Kim", "Kim": "Mộc" };
const ELEMENT_EMOJI = { "Mộc": "🌿", "Hỏa": "🔥", "Thổ": "⛰️", "Kim": "⚔️", "Thủy": "💧" };

// Mốc bắt đầu 12 tháng tiết khí, dạng [month, day]. Đây là mốc ổn định gần đúng;
// không còn phụ thuộc battu_solar_terms.json bị thiếu.
const SOLAR_MONTH_STARTS = [
  [2, 4], [3, 6], [4, 5], [5, 6], [6, 6], [7, 7],
  [8, 8], [9, 8], [10, 8], [11, 7], [12, 7], [1, 6],
];

const BIRTH_PLACES = {
  north: [
    ["ha_noi", "Hà Nội", 105.8542], ["hai_phong", "Hải Phòng", 106.6822],
    ["quang_ninh", "Quảng Ninh", 107.0800], ["lao_cai", "Lào Cai", 104.0000],
    ["thai_nguyen", "Thái Nguyên", 105.8442], ["nam_dinh", "Nam Định", 106.1683],
    ["son_la", "Sơn La", 103.9188], ["lang_son", "Lạng Sơn", 106.7610],
  ],
  central: [
    ["thanh_hoa", "Thanh Hóa", 105.7764], ["nghe_an", "Nghệ An", 105.6813],
    ["hue", "Huế", 107.5909], ["da_nang", "Đà Nẵng", 108.2022],
    ["quang_ngai", "Quảng Ngãi", 108.8044], ["gia_lai", "Gia Lai", 108.0000],
    ["dak_lak", "Đắk Lắk", 108.0500], ["khanh_hoa", "Khánh Hòa", 109.1967],
  ],
  south: [
    ["hcm", "TP. Hồ Chí Minh", 106.6297], ["dong_nai", "Đồng Nai", 106.8240],
    ["binh_duong", "Bình Dương", 106.6667], ["vung_tau", "Bà Rịa - Vũng Tàu", 107.0843],
    ["can_tho", "Cần Thơ", 105.7469], ["an_giang", "An Giang", 105.1500],
    ["kien_giang", "Kiên Giang", 105.0809], ["ca_mau", "Cà Mau", 105.1524],
  ],
};
const PLACE_BY_ID = Object.fromEntries(Object.values(BIRTH_PLACES).flat().map(([id, name, longitude]) => [id, { id, name, longitude }]));

function mod(n, m) { return ((n % m) + m) % m; }
function pad2(n) { return String(n).padStart(2, "0"); }
function stem(index) { return STEMS[mod(index, 10)]; }
function branch(index) { return BRANCHES[mod(index, 12)]; }
function ganzhi(index) {
  return { index: mod(index, 60), stem: stem(index), branch: branch(index), text: `${stem(index).name} ${branch(index).name}` };
}
function ensureProfileFile() {
  if (!fs.existsSync(PROFILE_PATH)) fs.writeFileSync(PROFILE_PATH, "{}", "utf8");
}
function loadProfiles() {
  ensureProfileFile();
  try { return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8")); } catch { return {}; }
}
function saveProfiles(data) {
  ensureProfileFile();
  const tmp = path.join(path.dirname(PROFILE_PATH), `.battu_profiles.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, PROFILE_PATH);
}
function getBattuProfile(id) { return loadProfiles()[id] || null; }
function setBattuProfile(id, profile) { const all = loadProfiles(); all[id] = profile; saveProfiles(all); return profile; }
function resetBattuProfile(id) { const all = loadProfiles(); if (!all[id]) return false; delete all[id]; saveProfiles(all); return true; }

function dayOfYear(year, month, day) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}
function equationOfTimeMinutes(year, month, day, hour = 12, minute = 0) {
  const n = dayOfYear(year, month, day);
  const gamma = (2 * Math.PI / 365) * (n - 1 + ((hour + minute / 60) - 12) / 24);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
}
function trueSolarOffsetMinutes(year, month, day, hour, minute, longitude) {
  return 4 * (Number(longitude) - STANDARD_MERIDIAN) + equationOfTimeMinutes(year, month, day, hour, minute);
}
function trueSolarParts(input, longitude) {
  const civilUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour - 7, input.minute || 0);
  const offsetMinutes = trueSolarOffsetMinutes(input.year, input.month, input.day, input.hour, input.minute || 0, longitude);
  const d = new Date(civilUtc + Math.round(offsetMinutes * 60000) + 7 * 3600000);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), offsetMinutes,
  };
}
function beforeApproxLichun(month, day) { return month < 2 || (month === 2 && day < 4); }
function yearPillar(year, month, day) {
  const effectiveYear = beforeApproxLichun(month, day) ? year - 1 : year;
  const index = mod(effectiveYear - 1984, 60);
  return { ...ganzhi(index), effectiveYear };
}
function solarMonthIndex(month, day) {
  // 0 = Dần, 11 = Sửu
  const md = month * 100 + day;
  const starts = [204, 306, 405, 506, 606, 707, 808, 908, 1008, 1107, 1207];
  for (let i = starts.length - 1; i >= 0; i--) if (md >= starts[i]) return i;
  return 11; // 1/1 -> trước Lập Xuân, thuộc tháng Sửu
}
function monthPillar(yearP, month, day) {
  const mi = solarMonthIndex(month, day);
  const firstStem = mod((yearP.stem.index ?? STEMS.findIndex((x) => x.name === yearP.stem.name)) % 5 * 2 + 2, 10);
  const stemIndex = mod(firstStem + mi, 10);
  const branchIndex = mod(2 + mi, 12);
  return { monthIndex: mi, stem: stem(stemIndex), branch: branch(branchIndex), text: `${stem(stemIndex).name} ${branch(branchIndex).name}` };
}
function julianDayNumber(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
function dayPillar(year, month, day) {
  // JDN + 49: quy ước 07/01/2000 là Giáp Tý trong chu kỳ 60.
  return ganzhi(mod(julianDayNumber(year, month, day) + 49, 60));
}
function hourBranchIndex(hour) { return hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12; }
function hourPillar(dayP, hour) {
  const bi = hourBranchIndex(hour);
  const dsi = STEMS.findIndex((x) => x.name === dayP.stem.name);
  const si = mod(dsi * 2 + bi, 10);
  return { stem: stem(si), branch: branch(bi), text: `${stem(si).name} ${branch(bi).name}` };
}

function elementCounts(pillars) {
  const out = { "Mộc": 0, "Hỏa": 0, "Thổ": 0, "Kim": 0, "Thủy": 0 };
  for (const p of pillars) {
    out[p.stem.element] += 1;
    out[p.branch.element] += 1;
    for (const hs of HIDDEN_STEMS[p.branch.name] || []) {
      const s = STEMS.find((x) => x.name === hs);
      if (s) out[s.element] += 0.35;
    }
  }
  return out;
}
function dominantElements(counts) {
  const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { strongest: arr[0][0], weakest: arr.at(-1)[0], sorted: arr };
}
function relationToDayMaster(dayEl, otherEl) {
  if (dayEl === otherEl) return "Tỷ/Kiếp";
  if (GENERATES[dayEl] === otherEl) return "Thực/Thương";
  if (GENERATES[otherEl] === dayEl) return "Ấn";
  if (CONTROLS[dayEl] === otherEl) return "Tài";
  if (CONTROLS[otherEl] === dayEl) return "Quan/Sát";
  return "Trung tính";
}
function computeLuckDirection(yearStemObj, gender) {
  const yang = yearStemObj.polarity === "Dương";
  return (gender === "male" && yang) || (gender === "female" && !yang) ? 1 : -1;
}
function nextMonthPillar(p, step) {
  const si = STEMS.findIndex((x) => x.name === p.stem.name);
  const bi = BRANCHES.findIndex((x) => x.name === p.branch.name);
  return { stem: stem(si + step), branch: branch(bi + step), text: `${stem(si + step).name} ${branch(bi + step).name}` };
}
function approximateLuckStartAge(birth) {
  // 3 ngày ≈ 1 tuổi. Không có bảng tiết khí phút-level nên dùng khoảng cách tới mốc tháng tiết khí gần nhất.
  const current = Date.UTC(birth.year, birth.month - 1, birth.day);
  const candidates = [];
  for (let y = birth.year - 1; y <= birth.year + 1; y++) {
    for (const [m, d] of SOLAR_MONTH_STARTS) {
      const yy = m === 1 && birth.month > 6 ? y + 1 : y;
      candidates.push(Date.UTC(yy, m - 1, d));
    }
  }
  const days = Math.min(...candidates.map((x) => Math.abs(x - current) / 86400000).filter((x) => x > 0));
  return Math.max(1, Math.min(10, Math.round((days / 3) * 10) / 10));
}
function buildDaYun(monthP, yearStemObj, gender, birth) {
  const direction = computeLuckDirection(yearStemObj, gender);
  const startAge = approximateLuckStartAge(birth);
  return Array.from({ length: 8 }, (_, i) => {
    const pillar = nextMonthPillar(monthP, direction * (i + 1));
    return { order: i + 1, startAge: Math.round((startAge + i * 10) * 10) / 10, endAge: Math.round((startAge + i * 10 + 9.9) * 10) / 10, pillar: pillar.text };
  });
}
function buildNatalChart(input) {
  const solar = trueSolarParts(input, input.longitude);
  const yp = yearPillar(solar.year, solar.month, solar.day);
  const mp = monthPillar(yp, solar.month, solar.day);
  const dp = dayPillar(solar.year, solar.month, solar.day);
  const hp = hourPillar(dp, solar.hour);
  const pillars = [yp, mp, dp, hp];
  const counts = elementCounts(pillars);
  const dom = dominantElements(counts);
  const dayMaster = dp.stem;
  const daYun = buildDaYun(mp, yp.stem, input.gender, input);
  return {
    birth: { ...input, civilTime: `${pad2(input.hour)}:${pad2(input.minute || 0)}` },
    solarTime: solar,
    pillars: { year: yp, month: mp, day: dp, hour: hp },
    dayMaster,
    elements: counts,
    strongestElement: dom.strongest,
    weakestElement: dom.weakest,
    relations: pillars.map((p) => ({ pillar: p.text, relation: relationToDayMaster(dayMaster.element, p.stem.element) })),
    daYun,
    meta: { engine: "self-contained-bazi-v4", version: PROFILE_VERSION },
  };
}

function fmtCounts(counts) {
  return Object.entries(counts).map(([el, n]) => `${ELEMENT_EMOJI[el]} ${el}: **${Number(n).toFixed(1)}**`).join(" • ");
}
function createBattuEmbeds(user, chart) {
  const p = chart.pillars;
  const e1 = new EmbedBuilder()
    .setColor(0x8E44AD)
    .setTitle(`🧭 Mệnh Bàn Bát Tự • ${user.username}`)
    .setDescription(
      `Dương lịch: **${pad2(chart.birth.day)}/${pad2(chart.birth.month)}/${chart.birth.year} ${chart.birth.civilTime}**\n` +
      `Giờ mặt trời: **${pad2(chart.solarTime.day)}/${pad2(chart.solarTime.month)}/${chart.solarTime.year} ${pad2(chart.solarTime.hour)}:${pad2(chart.solarTime.minute)}** ` +
      `(${chart.solarTime.offsetMinutes >= 0 ? "+" : ""}${chart.solarTime.offsetMinutes.toFixed(1)} phút)\n` +
      `Kinh độ: **${Number(chart.birth.longitude).toFixed(4)}°E**`
    )
    .addFields(
      { name: "Trụ Năm", value: `**${p.year.text}**`, inline: true },
      { name: "Trụ Tháng", value: `**${p.month.text}**`, inline: true },
      { name: "Trụ Ngày", value: `**${p.day.text}**`, inline: true },
      { name: "Trụ Giờ", value: `**${p.hour.text}**`, inline: true },
      { name: "Nhật chủ", value: `${ELEMENT_EMOJI[chart.dayMaster.element]} **${chart.dayMaster.name} • ${chart.dayMaster.element} ${chart.dayMaster.polarity}**`, inline: false }
    );

  const e2 = new EmbedBuilder().setColor(0x3498DB).setTitle("☯️ Ngũ Hành & Quan Hệ")
    .setDescription(`${fmtCounts(chart.elements)}\n\nVượng nhất: **${chart.strongestElement}** • Thiếu/yếu nhất: **${chart.weakestElement}**`)
    .addFields({ name: "Thập thần giản lược theo Nhật chủ", value: chart.relations.map((x) => `• ${x.pillar}: **${x.relation}**`).join("\n") });

  const e3 = new EmbedBuilder().setColor(0xF1C40F).setTitle("🌀 Đại Vận")
    .setDescription(chart.daYun.map((x) => `**${x.startAge}–${x.endAge} tuổi** • ${x.pillar}`).join("\n"))
    .setFooter({ text: "Đại vận dùng mốc tiết khí gần đúng vì repo cũ thiếu bảng tiết khí phút-level." });
  return [e1, e2, e3];
}

// ==================================================
// KHÍ VẬN NGÀY
// ==================================================
function vietnamDateParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}
function seededUnit(seed) {
  const h = crypto.createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}
function dailyScore(profile, userId, today) {
  const day = dayPillar(today.year, today.month, today.day);
  const natal = profile.natalChart;
  const dm = natal.dayMaster.element;
  const dayEl = day.stem.element;
  let base = 50;
  if (dayEl === dm) base += 8;
  if (GENERATES[dayEl] === dm) base += 14;
  if (GENERATES[dm] === dayEl) base += 5;
  if (CONTROLS[dayEl] === dm) base -= 13;
  if (CONTROLS[dm] === dayEl) base -= 5;
  const noise = Math.round((seededUnit(`${userId}:${today.year}-${today.month}-${today.day}`) - 0.5) * 24);
  return { score: clamp(base + noise, 10, 95), dayPillar: day };
}
function fortuneTier(score) {
  if (score >= 82) return ["Đại Cát", 0x2ECC71, "🌟"];
  if (score >= 68) return ["Cát", 0x27AE60, "✨"];
  if (score >= 52) return ["Bình", 0x3498DB, "☯️"];
  if (score >= 36) return ["Tiểu Hung", 0xE67E22, "🌫️"];
  return ["Hung", 0xC0392B, "⚠️"];
}
function createKhivanEmbed(user, profile) {
  const today = vietnamDateParts();
  const { score, dayPillar: dp } = dailyScore(profile, user.id, today);
  const [tier, color, icon] = fortuneTier(score);
  const dm = profile.natalChart.dayMaster.element;
  const dayEl = dp.stem.element;
  const favorable = GENERATES[dayEl] === dm || dayEl === dm;
  const good = favorable
    ? ["Giải quyết việc tồn đọng", "Giao tiếp và hợp tác", "Học tập / tu luyện", "Ra quyết định vừa phải"]
    : ["Ôn tập và củng cố", "Làm việc quen thuộc", "Giữ nhịp ổn định", "Quan sát trước khi hành động"];
  const avoid = score < 45
    ? ["Quyết định tài chính lớn", "Đối đầu trực diện", "Hứa hẹn khi chưa chắc chắn"]
    : ["Quá tự tin", "Ôm quá nhiều việc cùng lúc"];
  return new EmbedBuilder().setColor(color).setTitle(`${icon} Khí Vận Hôm Nay • ${tier}`)
    .setDescription(
      `Ngày **${pad2(today.day)}/${pad2(today.month)}/${today.year}** • **${dp.text}** (${ELEMENT_EMOJI[dayEl]} ${dayEl})\n` +
      `Nhật chủ của đạo hữu: **${profile.natalChart.dayMaster.name} • ${dm}**\n` +
      `Chỉ số khí vận: **${Math.round(score)}/100**`
    )
    .addFields(
      { name: "✅ Thuận", value: good.map((x) => `• ${x}`).join("\n"), inline: true },
      { name: "⚠️ Nên dè chừng", value: avoid.map((x) => `• ${x}`).join("\n"), inline: true }
    )
    .setFooter({ text: "Khí vận là nội dung giải trí dựa trên mệnh bàn và can-chi ngày." });
}

// ==================================================
// WIZARD DM
// ==================================================
const sessions = new Map();
const REGION_LABELS = { north: "Miền Bắc", central: "Miền Trung/Tây Nguyên", south: "Miền Nam" };
function customId(type, userId) { return `battu:${type}:${userId}`; }
function selectRow(id, placeholder, options) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));
}
function yearRow(uid) {
  const now = BIRTH_YEAR_MAX;
  const opts = [];
  // Discord chỉ cho 25 option/menu. Chọn năm theo 4 cụm qua menu “decade” trước.
  const start = Math.max(BIRTH_YEAR_MIN, now - 24);
  for (let y = now; y >= start; y--) opts.push({ label: String(y), value: String(y) });
  return [selectRow(customId("year_recent", uid), `Năm sinh ${start}-${now}`, opts),
    selectRow(customId("year_decade", uid), "Năm cũ hơn — chọn thập niên", Array.from({ length: Math.ceil((start - BIRTH_YEAR_MIN) / 10) }, (_, i) => {
      const hi = start - 1 - i * 10; const lo = Math.max(BIRTH_YEAR_MIN, hi - 9);
      return { label: `${lo}–${hi}`, value: `${lo}:${hi}` };
    }).slice(0,25))];
}
function yearsInRangeRow(uid, lo, hi) {
  return [selectRow(customId("year", uid), `Chọn năm ${lo}-${hi}`, Array.from({ length: hi - lo + 1 }, (_, i) => ({ label: String(hi - i), value: String(hi - i) })))];
}
function monthRow(uid) { return [selectRow(customId("month", uid), "Chọn tháng sinh", Array.from({ length: 12 }, (_, i) => ({ label: `Tháng ${i + 1}`, value: String(i + 1) })))]; }
function dayRows(uid, year, month) {
  const days = new Date(year, month, 0).getDate();
  const a = Array.from({ length: Math.min(25, days) }, (_, i) => ({ label: `Ngày ${i + 1}`, value: String(i + 1) }));
  const rows = [selectRow(customId("dayA", uid), "Chọn ngày 1-25", a)];
  if (days > 25) rows.push(selectRow(customId("dayB", uid), "Chọn ngày 26-31", Array.from({ length: days - 25 }, (_, i) => ({ label: `Ngày ${i + 26}`, value: String(i + 26) }))));
  return rows;
}
function hourRow(uid) { return [selectRow(customId("hour", uid), "Chọn giờ sinh (giờ Việt Nam)", Array.from({ length: 24 }, (_, h) => ({ label: `${pad2(h)}:xx`, value: String(h) })))]; }
function minuteRows(uid) {
  return [[0,24,"A"],[25,49,"B"],[50,59,"C"]].map(([lo,hi,k]) => selectRow(customId(`minute${k}`,uid),`Chọn phút ${pad2(lo)}-${pad2(hi)}`,Array.from({length:hi-lo+1},(_,i)=>({label:pad2(lo+i),value:String(lo+i)}))).components[0]).map((menu)=>new ActionRowBuilder().addComponents(menu));
}
function locationRows(uid) {
  return Object.entries(BIRTH_PLACES).map(([region, list]) => {
    const opts = list.map(([id,name,longitude]) => ({ label: name, value: id, description: `${longitude.toFixed(4)}°E` }));
    if (region === "south") opts.push({ label: "Nhập kinh độ thủ công", value: "custom_longitude", description: "Nếu biết kinh độ nơi sinh chính xác" });
    return selectRow(customId(`location_${region}`, uid), `Nơi sinh — ${REGION_LABELS[region]}`, opts);
  });
}
function genderRow(uid) { return [selectRow(customId("gender",uid),"Chọn giới tính để tính Đại vận",[{label:"Nam",value:"male"},{label:"Nữ",value:"female"}])]; }
function confirmRows(uid) { return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(customId("confirm",uid)).setLabel("Xác nhận").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(customId("restart",uid)).setLabel("Làm lại").setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(customId("cancel",uid)).setLabel("Hủy").setStyle(ButtonStyle.Danger)
)]; }
function wizardIntro() {
  return `🧭 **Khai Mệnh Bàn Bát Tự**\n\nChọn lần lượt **năm → tháng → ngày → giờ → phút → nơi sinh → giới tính**.\nGiờ sinh được hiệu chỉnh về **giờ mặt trời** theo kinh độ nơi sinh.`;
}
function wizardSummary(s) {
  const solar = trueSolarParts(s, s.longitude);
  return `📜 **Xác nhận sinh thần**\n• Dương lịch: **${pad2(s.day)}/${pad2(s.month)}/${s.year} ${pad2(s.hour)}:${pad2(s.minute)}**\n• Nơi sinh: **${s.birthPlace?.name || "Kinh độ thủ công"} (${Number(s.longitude).toFixed(4)}°E)**\n• Giới tính: **${s.gender === "male" ? "Nam" : "Nữ"}**\n• Giờ mặt trời: **${pad2(solar.day)}/${pad2(solar.month)}/${solar.year} ${pad2(solar.hour)}:${pad2(solar.minute)}**\n\nBấm **Xác nhận** để lập mệnh bàn.`;
}
async function startBattuWizard(user) {
  sessions.set(user.id, { step: "year" });
  const dm = await user.createDM();
  await dm.send({ content: wizardIntro(), components: yearRow(user.id) });
  return dm;
}
function parseOwner(value) { const p = String(value || "").split(":"); return { type: p[1], ownerId: p[2] }; }
async function askCustomLongitude(interaction, ownerId, state) {
  sessions.set(ownerId, state);
  await interaction.update({ content: "📍 Gửi **kinh độ nơi sinh** (102–110), ví dụ `105.8542`. Bot chờ 2 phút.", components: [] });
  const col = await interaction.channel.awaitMessages({ filter: (m) => m.author.id === ownerId, max: 1, time: 120000 }).catch(() => null);
  const raw = col?.first?.()?.content;
  const lon = Number(String(raw || "").replace(",", "."));
  if (!Number.isFinite(lon) || lon < 102 || lon > 110) { sessions.delete(ownerId); return interaction.followUp("❌ Kinh độ không hợp lệ hoặc hết thời gian."); }
  state.longitude = Math.round(lon * 10000) / 10000;
  state.birthPlace = { name: `Kinh độ ${state.longitude.toFixed(4)}°E` };
  state.step = "gender";
  sessions.set(ownerId, state);
  return interaction.followUp({ content: `📍 Đã nhận **${state.longitude.toFixed(4)}°E**. Chọn giới tính.`, components: genderRow(ownerId) });
}
async function handleBattuInteraction(interaction) {
  const { type, ownerId } = parseOwner(interaction.customId);
  if (interaction.user.id !== ownerId) return interaction.reply({ content: "❌ Đây không phải mệnh bàn của ngươi.", ephemeral: true });
  const s = sessions.get(ownerId) || { step: "year" };
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];
    if (type === "year_decade") { const [lo,hi]=v.split(":").map(Number); return interaction.update({ content:`📅 Chọn năm trong **${lo}–${hi}**.`, components:yearsInRangeRow(ownerId,lo,hi) }); }
    if (type === "year_recent" || type === "year") { s.year=Number(v);sessions.set(ownerId,s);return interaction.update({content:`📅 Năm **${s.year}**. Chọn tháng.`,components:monthRow(ownerId)}); }
    if (type === "month") { s.month=Number(v);sessions.set(ownerId,s);return interaction.update({content:`📅 Tháng **${s.month}**. Chọn ngày.`,components:dayRows(ownerId,s.year,s.month)}); }
    if (type === "dayA" || type === "dayB") { s.day=Number(v);sessions.set(ownerId,s);return interaction.update({content:`📅 ${pad2(s.day)}/${pad2(s.month)}/${s.year}. Chọn giờ.`,components:hourRow(ownerId)}); }
    if (type === "hour") { s.hour=Number(v);sessions.set(ownerId,s);return interaction.update({content:`🕒 ${pad2(s.hour)}:xx. Chọn phút.`,components:minuteRows(ownerId)}); }
    if (type?.startsWith("minute")) { s.minute=Number(v);sessions.set(ownerId,s);return interaction.update({content:"📍 Chọn nơi sinh. Nếu không thấy địa phương, chọn nơi gần nhất hoặc nhập kinh độ thủ công.",components:locationRows(ownerId)}); }
    if (type?.startsWith("location_")) {
      if (v === "custom_longitude") return askCustomLongitude(interaction,ownerId,s);
      const place=PLACE_BY_ID[v];if(!place)return interaction.reply({content:"❌ Nơi sinh không hợp lệ.",ephemeral:true});
      s.birthPlace=place;s.longitude=place.longitude;sessions.set(ownerId,s);return interaction.update({content:`📍 **${place.name}** (${place.longitude.toFixed(4)}°E). Chọn giới tính.`,components:genderRow(ownerId)});
    }
    if (type === "gender") { s.gender=v;sessions.set(ownerId,s);return interaction.update({content:wizardSummary(s),components:confirmRows(ownerId)}); }
  }
  if (interaction.isButton()) {
    if (type === "restart") { sessions.set(ownerId,{step:"year"}); return interaction.update({content:wizardIntro(),components:yearRow(ownerId)}); }
    if (type === "cancel") { sessions.delete(ownerId); return interaction.update({content:"❎ Đã hủy khai mệnh bàn.",components:[]}); }
    if (type === "confirm") {
      try {
        const chart=buildNatalChart(s);
        const profile={userId:ownerId,birth:chart.birth,natalChart:chart,meta:{timezone:TZ,createdAt:Date.now(),updatedAt:Date.now(),version:PROFILE_VERSION,engine:chart.meta.engine}};
        setBattuProfile(ownerId,profile);sessions.delete(ownerId);
        await interaction.update({content:"✅ Đã lập mệnh bàn. Bản chi tiết được gửi ngay sau đây.",components:[]});
        for(const emb of createBattuEmbeds(interaction.user,chart))await interaction.followUp({embeds:[emb]});
      } catch(e) { return interaction.update({content:`⚠️ Không thể lập mệnh bàn: ${e.message}`,components:[]}); }
    }
  }
}

// ==================================================
// COMMANDS
// ==================================================
const battu = {
  name: "battu", aliases: ["bazi", "batu", "bat-tu"],
  run: async (_client, msg, args) => {
    if (String(args?.[0] || "").toLowerCase() === "reset") {
      return msg.reply(resetBattuProfile(msg.author.id) ? "✅ Đã xóa mệnh bàn cũ. Dùng `-battu` để lập lại." : "❌ Chưa có mệnh bàn để xóa.");
    }
    const profile = getBattuProfile(msg.author.id);
    if (!profile || profile.meta?.version !== PROFILE_VERSION) {
      if (profile) resetBattuProfile(msg.author.id);
      try { await startBattuWizard(msg.author); return msg.reply("📩 Đã gửi **khế ước lập mệnh bàn** qua DM."); }
      catch { return msg.reply("❌ Không thể gửi DM. Hãy mở quyền nhận tin nhắn riêng rồi gọi lại `-battu`."); }
    }
    try {
      const dm = await msg.author.createDM();
      for (const emb of createBattuEmbeds(msg.author, profile.natalChart)) await dm.send({ embeds: [emb] });
      return msg.reply("📩 Mệnh bàn đã được gửi qua DM.");
    } catch { return msg.reply("❌ Không thể gửi mệnh bàn qua DM."); }
  },
};
const khivan = {
  name: "khivan", aliases: ["kv", "khi", "khi-van", "fortune", "luck"],
  run: async (_client, msg) => {
    const profile = getBattuProfile(msg.author.id);
    if (!profile) return msg.reply("❌ Đạo hữu chưa lập mệnh bàn. Dùng `-battu` trước.");
    if (profile.meta?.version !== PROFILE_VERSION) return msg.reply("❌ Mệnh bàn cũ không còn tương thích. Dùng `-battu reset` rồi lập lại.");
    return msg.reply({ embeds: [createKhivanEmbed(msg.author, profile)] });
  },
};

module.exports = {
  commands: [battu, khivan],
  handleBattuInteraction,
  buildNatalChart,
  getBattuProfile,
  resetBattuProfile,
};
