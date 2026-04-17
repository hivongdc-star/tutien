const { loadBattuData } = require('./battuData');
const { diffDays, mod, getEffectiveYear, getSolarMonthBoundary, getHourBranch } = require('./battuCalendar');
const { relationType, getFavorableElements, scoreElementBalance, getYinYangBreakdown } = require('./battuRules');

const REF_DAY = { year: 1984, month: 2, day: 2 }; // Giáp Tý day reference
const REF_DAY_STEM_INDEX = 0;
const REF_DAY_BRANCH_INDEX = 0;
const HOUR_BRANCH_ORDER = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];
const MONTH_BRANCH_ORDER = ['Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi', 'Tý', 'Sửu'];
const ELEMENTS = ['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'];

function makePillar(stem, branch) {
  return { stem, branch, label: `${stem.han}${branch.han} ${stem.name}${branch.name}` };
}

function isValidGregorianDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function calcYearPillar(year, month, day, hour = 12) {
  const { stems, branches } = loadBattuData();
  const effectiveYear = getEffectiveYear(year, month, day, hour);
  const offset = effectiveYear - 1984;
  const stem = stems[mod(offset, 10)];
  const branch = branches[mod(offset, 12)];
  return makePillar(stem, branch);
}

function calcMonthPillar(year, month, day, hour, yearStemName) {
  const { stems, branches, monthStemRules, stemIndex } = loadBattuData();
  const boundary = getSolarMonthBoundary(year, month, day, hour);
  const monthBranchName = boundary.branch;
  const monthIndex = MONTH_BRANCH_ORDER.indexOf(monthBranchName);
  const firstStemName = monthStemRules[yearStemName];
  const firstStemIdx = stemIndex[firstStemName];
  const stem = stems[mod(firstStemIdx + monthIndex, 10)];
  const branch = branches.find((x) => x.name === monthBranchName);
  return { pillar: makePillar(stem, branch), boundary };
}

function calcDayPillar(year, month, day) {
  const { stems, branches } = loadBattuData();
  const offset = diffDays({ year, month, day }, REF_DAY);
  const stem = stems[mod(REF_DAY_STEM_INDEX + offset, 10)];
  const branch = branches[mod(REF_DAY_BRANCH_INDEX + offset, 12)];
  return makePillar(stem, branch);
}

function calcHourPillar(dayStemName, hour) {
  const { stems, branches, hourStemRules, stemIndex } = loadBattuData();
  const hourBranch = getHourBranch(hour);
  const startStemName = hourStemRules[dayStemName];
  const startStemIdx = stemIndex[startStemName];
  const hourIndex = HOUR_BRANCH_ORDER.indexOf(hourBranch.name);
  const stem = stems[mod(startStemIdx + hourIndex, 10)];
  const branch = branches.find((x) => x.name === hourBranch.name);
  return makePillar(stem, branch);
}

function collectElementCounts(chart) {
  const { hiddenStems, stemByName, ruleset } = loadBattuData();
  const weights = ruleset.natalAnalysis;
  const counts = { Kim: 0, Mộc: 0, Thủy: 0, Hỏa: 0, Thổ: 0 };
  const pillars = [
    ['year', chart.year],
    ['month', chart.month],
    ['day', chart.day],
    ['hour', chart.hour],
  ];

  for (const [position, p] of pillars) {
    const posWeight = weights.positionWeights[position] || 1;
    counts[p.stem.element] += weights.stemWeight * posWeight;
    counts[p.branch.element] += weights.branchWeight * posWeight;
    const hs = hiddenStems[p.branch.name] || [];
    hs.forEach((name, idx) => {
      const stem = stemByName[name];
      const hiddenWeight = weights.hiddenStemWeights[idx] || weights.hiddenStemWeights.at(-1) || 0.3;
      if (stem) counts[stem.element] += hiddenWeight * posWeight;
    });
  }
  return counts;
}

function assessChartStrength(chart) {
  const { relations, ruleset } = loadBattuData();
  const weights = ruleset.natalAnalysis;
  const elementCounts = collectElementCounts(chart);
  const dayElement = chart.day.stem.element;
  const contributions = { same: 0, generatedBy: 0, generates: 0, controlledBy: 0, controls: 0 };

  for (const [el, val] of Object.entries(elementCounts)) {
    const type = relationType(dayElement, el);
    if (contributions[type] !== undefined) contributions[type] += val;
  }

  const seasonal = relations.seasonSupport[chart.month.branch.name];
  let seasonalScore = 0;
  if (seasonal) {
    if (seasonal.supports.includes(dayElement)) seasonalScore += weights.seasonalBonus.same;
    else if (seasonal.supports.includes(relations.generate[dayElement])) seasonalScore += weights.seasonalBonus.generates;
    else if (seasonal.pressures.includes(dayElement)) seasonalScore += weights.seasonalBonus.controlledBy;
    else if (relations.generate[seasonal.dominant] === dayElement) seasonalScore += weights.seasonalBonus.generatedBy;
    else if (relations.control[dayElement] === seasonal.dominant) seasonalScore += weights.seasonalBonus.controls;
  }

  const support = contributions.same + contributions.generatedBy;
  const drain = contributions.generates * 0.5;
  const pressure = contributions.controlledBy + contributions.controls * 0.6;
  const score = Math.round(weights.scoreBase + (support - drain - pressure) * weights.scoreMultiplier + seasonalScore);
  const normalizedScore = Math.max(8, Math.min(96, score));
  const balanceScore = scoreElementBalance(elementCounts);
  const strong = normalizedScore >= 60;
  const favorableElements = getFavorableElements(dayElement, strong);
  const avg = Object.values(elementCounts).reduce((a, b) => a + b, 0) / 5;
  const excessElements = ELEMENTS.filter((el) => elementCounts[el] >= avg * 1.2).sort((a, b) => elementCounts[b] - elementCounts[a]);
  const weakElements = ELEMENTS.filter((el) => elementCounts[el] <= avg * 0.8).sort((a, b) => elementCounts[a] - elementCounts[b]);
  const yinYang = getYinYangBreakdown(chart);
  const strengthBand = weights.strengthBands.find((x) => normalizedScore >= x.min)?.label || 'balanced';

  return {
    elementCounts,
    strengthScore: normalizedScore,
    strong,
    strengthBand,
    favorableElements,
    balanceScore,
    sameSupport: contributions.same,
    generatingSupport: contributions.generatedBy,
    outputDrain: contributions.generates,
    controlPressure: contributions.controlledBy,
    controlOutbound: contributions.controls,
    seasonalScore,
    excessElements,
    weakElements,
    yinYang,
  };
}

function buildNatalChart(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = Number(input.hour);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(hour)) {
    throw new Error('Thông tin ngày giờ sinh không hợp lệ.');
  }
  if (!isValidGregorianDate(year, month, day)) {
    throw new Error('Ngày sinh dương lịch không tồn tại.');
  }
  if (hour < 0 || hour > 23) {
    throw new Error('Giờ sinh không hợp lệ.');
  }

  const yearPillar = calcYearPillar(year, month, day, hour);
  const monthResult = calcMonthPillar(year, month, day, hour, yearPillar.stem.name);
  const dayPillar = calcDayPillar(year, month, day);
  const hourPillar = calcHourPillar(dayPillar.stem.name, hour);
  const chart = {
    birth: {
      year,
      month,
      day,
      hour,
      hourRange: getHourBranch(hour).hourRange,
      timezone: input.timezone || 'Asia/Ho_Chi_Minh',
    },
    year: yearPillar,
    month: monthResult.pillar,
    day: dayPillar,
    hour: hourPillar,
    solarBoundary: monthResult.boundary,
    dayMaster: dayPillar.stem,
  };
  chart.analysis = assessChartStrength(chart);
  return chart;
}

module.exports = {
  buildNatalChart,
  calcDayPillar,
  calcYearPillar,
  calcMonthPillar,
  calcHourPillar,
  collectElementCounts,
  assessChartStrength,
};
