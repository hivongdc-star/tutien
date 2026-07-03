const { loadBattuData } = require('./battuData');
const { diffDays, mod, getEffectiveYear, getSolarMonthBoundary, getHourBranch, getTrueSolarTimeParts, formatDateTimeParts } = require('./battuCalendar');
const {
  relationType,
  getFavorableElements,
  scoreElementBalance,
  getYinYangBreakdown,
  aggregateTenGodInfluence,
  determineUsefulGods,
  determinePattern,
  getChangShengSummary,
  detectShenSha,
} = require('./battuRules');
const { calculateLuckCycles } = require('./battuLuck');

const REF_DAY = { year: 1984, month: 1, day: 31 }; // Giáp Tý day reference
const REF_DAY_STEM_INDEX = 0;
const REF_DAY_BRANCH_INDEX = 0;
const BIRTH_YEAR_MIN = 1995;
const BIRTH_YEAR_MAX = 2015;
const CURRENT_BATTU_PROFILE_VERSION = 3;
const ZI_HOUR_DAY_SWITCH = true; // 23:00-23:59 is treated as the next day pillar.
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

function calcYearPillar(year, month, day, hour = 12, minute = 0) {
  const { stems, branches } = loadBattuData();
  const effectiveYear = getEffectiveYear(year, month, day, hour, minute);
  const offset = effectiveYear - 1984;
  const stem = stems[mod(offset, 10)];
  const branch = branches[mod(offset, 12)];
  return makePillar(stem, branch);
}

function calcMonthPillar(year, month, day, hour, minute, yearStemName) {
  const { stems, branches, monthStemRules, stemIndex } = loadBattuData();
  const boundary = getSolarMonthBoundary(year, month, day, hour, minute);
  const monthBranchName = boundary.branch;
  const monthIndex = MONTH_BRANCH_ORDER.indexOf(monthBranchName);
  const firstStemName = monthStemRules[yearStemName];
  const firstStemIdx = stemIndex[firstStemName];
  const stem = stems[mod(firstStemIdx + monthIndex, 10)];
  const branch = branches.find((x) => x.name === monthBranchName);
  return { pillar: makePillar(stem, branch), boundary };
}

function shiftGregorianDate(year, month, day, deltaDays) {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function getDayPillarDate(year, month, day, hour = 12) {
  if (ZI_HOUR_DAY_SWITCH && hour === 23) {
    return shiftGregorianDate(year, month, day, 1);
  }
  return { year, month, day };
}

function calcDayPillar(year, month, day, hour = 12) {
  const { stems, branches } = loadBattuData();
  const dayDate = getDayPillarDate(year, month, day, hour);
  const offset = diffDays(dayDate, REF_DAY);
  const stem = stems[mod(REF_DAY_STEM_INDEX + offset, 10)];
  const branch = branches[mod(REF_DAY_BRANCH_INDEX + offset, 12)];
  const pillar = makePillar(stem, branch);
  pillar.dayPillarDate = dayDate;
  return pillar;
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
  const supportRatio = support / Math.max(1, support + pressure + drain);
  const pressureRatio = pressure / Math.max(1, support + pressure + drain);
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
  const followCfg = weights.followThresholds || {};
  let followMode = null;
  if (normalizedScore >= (followCfg.followStrong || 88) && supportRatio >= (followCfg.supportRatio || 0.62)) followMode = 'followStrong';
  if (normalizedScore <= (followCfg.followWeak || 26) && pressureRatio >= (followCfg.pressureRatio || 0.62)) followMode = 'followWeak';

  return {
    elementCounts,
    strengthScore: normalizedScore,
    strong,
    followMode,
    supportRatio,
    pressureRatio,
    strengthBand: followMode || strengthBand,
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

function enrichAnalysis(chart) {
  chart.analysis.tenGodInfluence = aggregateTenGodInfluence(chart);
  chart.analysis.usefulGods = determineUsefulGods(chart);
  chart.analysis.pattern = determinePattern(chart);
  chart.analysis.growthStages = getChangShengSummary(chart);
  chart.analysis.shenSha = detectShenSha(chart);
  return chart;
}

function buildNatalChart(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = Number(input.hour);
  const minute = input.minute === undefined ? 0 : Number(input.minute);
  const longitude = Number(input.longitude ?? input.birthPlace?.longitude);
  const gender = String(input.gender || '').toLowerCase();
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('Thông tin ngày giờ sinh không hợp lệ.');
  }
  if (year < BIRTH_YEAR_MIN || year > BIRTH_YEAR_MAX) {
    throw new Error(`Năm sinh hiện chỉ hỗ trợ từ ${BIRTH_YEAR_MIN} đến ${BIRTH_YEAR_MAX}.`);
  }
  if (!isValidGregorianDate(year, month, day)) {
    throw new Error('Ngày sinh dương lịch không tồn tại.');
  }
  if (hour < 0 || hour > 23) {
    throw new Error('Giờ sinh không hợp lệ.');
  }
  if (minute < 0 || minute > 59) {
    throw new Error('Phút sinh không hợp lệ.');
  }
  if (!Number.isFinite(longitude) || longitude < 102 || longitude > 110) {
    throw new Error('Thiếu hoặc sai kinh độ nơi sinh. Hệ chỉ nhận kinh độ Việt Nam khoảng 102°E-110°E.');
  }
  if (!['male', 'female'].includes(gender)) {
    throw new Error('Thiếu giới tính để tính Đại vận.');
  }

  const civil = { year, month, day, hour, minute };
  const trueSolar = getTrueSolarTimeParts(civil, longitude);

  // Niên trụ và nguyệt trụ so với tiết khí theo thời điểm thực của giờ Việt Nam.
  // Nhật trụ và thời trụ dùng giờ mặt trời tại nơi sinh để tránh sai ở ranh giờ.
  const yearPillar = calcYearPillar(year, month, day, hour, minute);
  const monthResult = calcMonthPillar(year, month, day, hour, minute, yearPillar.stem.name);
  const dayPillar = calcDayPillar(trueSolar.year, trueSolar.month, trueSolar.day, trueSolar.hour);
  const hourPillar = calcHourPillar(dayPillar.stem.name, trueSolar.hour);
  const solarHourBranch = getHourBranch(trueSolar.hour);
  const chart = {
    birth: {
      year,
      month,
      day,
      hour,
      minute,
      timeLabel: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      hourRange: solarHourBranch.hourRange,
      timezone: input.timezone || 'Asia/Ho_Chi_Minh',
      gender,
      genderLabel: gender === 'male' ? 'Nam' : 'Nữ',
      birthPlace: input.birthPlace ? {
        id: input.birthPlace.id,
        name: input.birthPlace.name,
        longitude,
        isCustom: !!input.birthPlace.isCustom,
      } : { id: 'custom', name: `Kinh độ ${longitude.toFixed(4)}°E`, longitude, isCustom: true },
      civil,
      trueSolar: {
        year: trueSolar.year,
        month: trueSolar.month,
        day: trueSolar.day,
        hour: trueSolar.hour,
        minute: trueSolar.minute,
        second: trueSolar.second,
        timeLabel: `${String(trueSolar.hour).padStart(2, '0')}:${String(trueSolar.minute).padStart(2, '0')}`,
        dateTimeLabel: formatDateTimeParts(trueSolar),
        offsetMinutes: Math.round(trueSolar.offsetMinutes * 100) / 100,
        roundedOffsetMinutes: trueSolar.roundedOffsetMinutes,
      },
      dayPillarDate: dayPillar.dayPillarDate,
      dayChangeMode: ZI_HOUR_DAY_SWITCH ? 'zi_23_next_day' : 'midnight',
    },
    year: yearPillar,
    month: monthResult.pillar,
    day: dayPillar,
    hour: hourPillar,
    solarBoundary: monthResult.boundary,
    dayMaster: dayPillar.stem,
    meta: {
      version: CURRENT_BATTU_PROFILE_VERSION,
      engine: 'battu_exact_vn_true_solar',
      note: 'Year/month pillars use exact solar-term instants in Vietnam standard time; day/hour pillars use apparent solar time at birthplace longitude.',
    },
  };
  chart.analysis = assessChartStrength(chart);
  enrichAnalysis(chart);
  chart.luck = calculateLuckCycles(chart);
  return chart;
}

module.exports = {
  buildNatalChart,
  calcDayPillar,
  calcYearPillar,
  calcMonthPillar,
  calcHourPillar,
  getDayPillarDate,
  collectElementCounts,
  assessChartStrength,
  enrichAnalysis,
  BIRTH_YEAR_MIN,
  BIRTH_YEAR_MAX,
  CURRENT_BATTU_PROFILE_VERSION,
};
