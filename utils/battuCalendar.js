const { loadBattuData } = require('./battuData');

const TZ = 'Asia/Ho_Chi_Minh';
const TERM_ORDER = ['Đại Tuyết', 'Tiểu Hàn', 'Lập Xuân', 'Kinh Trập', 'Thanh Minh', 'Lập Hạ', 'Mang Chủng', 'Tiểu Thử', 'Lập Thu', 'Bạch Lộ', 'Hàn Lộ', 'Lập Đông'];

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

function getSolarTermsOfYear(year) {
  const { solarTerms } = loadBattuData();
  return solarTerms[String(year)] || null;
}

function termToComparable(term) {
  return (term.month * 1000000) + (term.day * 10000) + (term.hour * 100) + term.minute;
}

function birthToComparable(month, day, hour = 12, minute = 0) {
  return (month * 1000000) + (day * 10000) + (hour * 100) + minute;
}

function getSolarMonthBoundary(year, month, day, hour = 12, minute = 0) {
  const currentYearTerms = getSolarTermsOfYear(year);
  const prevYearTerms = getSolarTermsOfYear(year - 1);
  if (!currentYearTerms || !prevYearTerms) {
    throw new Error('Thiếu dữ liệu tiết khí cho năm đã chọn.');
  }

  const candidates = [
    { ...prevYearTerms['Đại Tuyết'], name: 'Đại Tuyết', year: year - 1 },
    { ...currentYearTerms['Tiểu Hàn'], name: 'Tiểu Hàn', year },
    { ...currentYearTerms['Lập Xuân'], name: 'Lập Xuân', year },
    { ...currentYearTerms['Kinh Trập'], name: 'Kinh Trập', year },
    { ...currentYearTerms['Thanh Minh'], name: 'Thanh Minh', year },
    { ...currentYearTerms['Lập Hạ'], name: 'Lập Hạ', year },
    { ...currentYearTerms['Mang Chủng'], name: 'Mang Chủng', year },
    { ...currentYearTerms['Tiểu Thử'], name: 'Tiểu Thử', year },
    { ...currentYearTerms['Lập Thu'], name: 'Lập Thu', year },
    { ...currentYearTerms['Bạch Lộ'], name: 'Bạch Lộ', year },
    { ...currentYearTerms['Hàn Lộ'], name: 'Hàn Lộ', year },
    { ...currentYearTerms['Lập Đông'], name: 'Lập Đông', year },
    { ...currentYearTerms['Đại Tuyết'], name: 'Đại Tuyết', year },
  ];

  const birthValue = birthToComparable(month, day, hour, minute);
  let chosen = candidates[0];
  for (const term of candidates) {
    if (term.year !== year) continue;
    if (birthValue >= termToComparable(term)) chosen = term;
  }
  if (month === 1 && birthValue < termToComparable(currentYearTerms['Tiểu Hàn'])) {
    chosen = { ...prevYearTerms['Đại Tuyết'], name: 'Đại Tuyết', year: year - 1 };
  }
  return chosen;
}

function getEffectiveYear(year, month, day, hour = 12, minute = 0) {
  const terms = getSolarTermsOfYear(year);
  if (!terms) throw new Error('Thiếu dữ liệu Lập Xuân cho năm đã chọn.');
  const birthValue = birthToComparable(month, day, hour, minute);
  return birthValue < termToComparable(terms['Lập Xuân']) ? year - 1 : year;
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

module.exports = {
  TZ,
  TERM_ORDER,
  getTimeParts,
  getVietnamNowParts,
  diffDays,
  mod,
  getEffectiveYear,
  getSolarTermsOfYear,
  getSolarMonthBoundary,
  getHourBranch,
  getGanzhiIndicesFromOffset,
};
