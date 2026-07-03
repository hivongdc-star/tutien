const { loadBattuData } = require('./battuData');

const TZ = 'Asia/Ho_Chi_Minh';
const STANDARD_MERIDIAN = 105;
const TERM_ORDER = ['Đại Tuyết', 'Tiểu Hàn', 'Lập Xuân', 'Kinh Trập', 'Thanh Minh', 'Lập Hạ', 'Mang Chủng', 'Tiểu Thử', 'Lập Thu', 'Bạch Lộ', 'Hàn Lộ', 'Lập Đông'];
const MONTH_BOUNDARY_TERMS = ['Tiểu Hàn', 'Lập Xuân', 'Kinh Trập', 'Thanh Minh', 'Lập Hạ', 'Mang Chủng', 'Tiểu Thử', 'Lập Thu', 'Bạch Lộ', 'Hàn Lộ', 'Lập Đông', 'Đại Tuyết'];

function getTimeParts(date = new Date(), timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getVietnamNowParts() {
  return getTimeParts(new Date(), TZ);
}

function localPartsToUtcMs(year, month, day, hour = 0, minute = 0, second = 0) {
  return Date.UTC(year, month - 1, day, hour - 7, minute, second, 0);
}

function utcMsToVietnamParts(ms) {
  return getTimeParts(new Date(ms), TZ);
}

function toLocalDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}

function diffDays(a, b) {
  const ms = toLocalDate(a.year, a.month, a.day).getTime() - toLocalDate(b.year, b.month, b.day).getTime();
  return Math.round(ms / 86400000);
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function dayOfYear(year, month, day) {
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000) + 1;
}

function equationOfTimeMinutes(year, month, day, hour = 12, minute = 0) {
  const n = dayOfYear(year, month, day);
  const gamma = (2 * Math.PI / 365) * (n - 1 + ((hour + minute / 60) - 12) / 24);
  return 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  );
}

function getTrueSolarOffsetMinutes(year, month, day, hour, minute, longitude) {
  const lon = Number(longitude);
  if (!Number.isFinite(lon)) throw new Error('Thiếu hoặc sai kinh độ nơi sinh.');
  const longitudeOffset = 4 * (lon - STANDARD_MERIDIAN);
  const eot = equationOfTimeMinutes(year, month, day, hour, minute);
  return longitudeOffset + eot;
}

function getTrueSolarTimeParts(input, longitude) {
  const { year, month, day, hour = 12, minute = 0 } = input;
  const civilUtcMs = localPartsToUtcMs(year, month, day, hour, minute, 0);
  const offsetMinutes = getTrueSolarOffsetMinutes(year, month, day, hour, minute, longitude);
  const solarUtcMs = civilUtcMs + Math.round(offsetMinutes * 60 * 1000);
  const parts = utcMsToVietnamParts(solarUtcMs);
  return {
    ...parts,
    offsetMinutes,
    roundedOffsetMinutes: Math.round(offsetMinutes),
    civilUtcMs,
    solarUtcMs,
  };
}

function getSolarTermsOfYear(year) {
  const { solarTerms } = loadBattuData();
  return solarTerms[String(year)] || null;
}

function termToUtcMs(term) {
  if (!term || !Number.isInteger(term.year)) throw new Error('Dữ liệu tiết khí thiếu năm.');
  return localPartsToUtcMs(term.year, term.month, term.day, term.hour || 0, term.minute || 0, 0);
}

function addTerm(candidates, year, name) {
  const terms = getSolarTermsOfYear(year);
  if (!terms || !terms[name]) return;
  const item = { ...terms[name], name, year };
  item.utcMs = termToUtcMs(item);
  candidates.push(item);
}

function getSolarMonthBoundaryCandidates(year) {
  const candidates = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const name of MONTH_BOUNDARY_TERMS) addTerm(candidates, y, name);
  }
  candidates.sort((a, b) => a.utcMs - b.utcMs);
  return candidates;
}

function getSolarMonthBoundary(year, month, day, hour = 12, minute = 0) {
  const birthMs = localPartsToUtcMs(year, month, day, hour, minute, 0);
  const candidates = getSolarMonthBoundaryCandidates(year).filter((x) => x.utcMs <= birthMs);
  if (!candidates.length) throw new Error('Tiết khí của năm này chưa sẵn sàng.');
  return candidates.at(-1);
}

function getAdjacentSolarMonthBoundary(year, month, day, hour = 12, minute = 0, direction = 'forward') {
  const birthMs = localPartsToUtcMs(year, month, day, hour, minute, 0);
  const candidates = getSolarMonthBoundaryCandidates(year);
  if (direction === 'backward') {
    const prev = candidates.filter((x) => x.utcMs < birthMs).at(-1);
    if (!prev) throw new Error('Thiếu tiết khí trước sinh để tính Đại vận.');
    return prev;
  }
  const next = candidates.find((x) => x.utcMs > birthMs);
  if (!next) throw new Error('Thiếu tiết khí sau sinh để tính Đại vận.');
  return next;
}

function getEffectiveYear(year, month, day, hour = 12, minute = 0) {
  const terms = getSolarTermsOfYear(year);
  if (!terms?.['Lập Xuân']) throw new Error('Mốc Lập Xuân của năm này chưa sẵn sàng.');
  const birthMs = localPartsToUtcMs(year, month, day, hour, minute, 0);
  const lapXuan = { ...terms['Lập Xuân'], name: 'Lập Xuân', year };
  return birthMs < termToUtcMs(lapXuan) ? year - 1 : year;
}

function getHourBranch(hour) {
  const { branches } = loadBattuData();
  const idx = hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12;
  return branches[idx];
}

function getGanzhiIndicesFromOffset(baseStemIndex, baseBranchIndex, offset) {
  return {
    stemIndex: mod(baseStemIndex + offset, 10),
    branchIndex: mod(baseBranchIndex + offset, 12),
  };
}

function formatDateTimeParts(parts) {
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

module.exports = {
  TZ,
  STANDARD_MERIDIAN,
  TERM_ORDER,
  MONTH_BOUNDARY_TERMS,
  getTimeParts,
  getVietnamNowParts,
  localPartsToUtcMs,
  utcMsToVietnamParts,
  diffDays,
  mod,
  equationOfTimeMinutes,
  getTrueSolarOffsetMinutes,
  getTrueSolarTimeParts,
  getEffectiveYear,
  getSolarTermsOfYear,
  getSolarMonthBoundary,
  getAdjacentSolarMonthBoundary,
  termToUtcMs,
  getHourBranch,
  getGanzhiIndicesFromOffset,
  formatDateTimeParts,
};
