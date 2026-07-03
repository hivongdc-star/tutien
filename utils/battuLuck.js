const { loadBattuData } = require('./battuData');
const { getAdjacentSolarMonthBoundary, localPartsToUtcMs, mod } = require('./battuCalendar');
const { getTenGod, relationType } = require('./battuRules');

const GENDER_LABEL = { male: 'Nam', female: 'Nữ' };

function getLuckDirection(gender, yearStem) {
  if (!['male', 'female'].includes(gender)) throw new Error('Thiếu giới tính để tính Đại vận.');
  const yangYear = yearStem.polarity === 'Dương';
  const forward = (gender === 'male' && yangYear) || (gender === 'female' && !yangYear);
  return forward ? 'forward' : 'backward';
}

function splitStartAge(yearsFloat) {
  const safe = Math.max(0, Number(yearsFloat) || 0);
  let years = Math.floor(safe);
  let months = Math.round((safe - years) * 12);
  if (months >= 12) {
    years += 1;
    months -= 12;
  }
  return { years, months, label: `${years} tuổi ${months} tháng` };
}

function formatAgeRange(startAgeYears) {
  const a = splitStartAge(startAgeYears);
  const b = splitStartAge(startAgeYears + 10);
  return `${a.years}t${a.months ? ` ${a.months}th` : ''} – ${b.years}t${b.months ? ` ${b.months}th` : ''}`;
}

function buildPillarFromIndices(stemIndex, branchIndex) {
  const { stems, branches } = loadBattuData();
  const stem = stems[mod(stemIndex, 10)];
  const branch = branches[mod(branchIndex, 12)];
  return { stem, branch, label: `${stem.han}${branch.han} ${stem.name}${branch.name}` };
}

function summarizeLuckCycle(chart, pillar) {
  const dayElement = chart.day.stem.element;
  const relStem = relationType(dayElement, pillar.stem.element);
  const god = getTenGod(chart.day.stem.name, pillar.stem.name);
  const favorable = chart.analysis?.favorableElements || [];
  const flags = [];
  if (favorable.includes(pillar.stem.element) || favorable.includes(pillar.branch.element)) flags.push('có hành trợ mệnh');
  if ((chart.analysis?.excessElements || []).includes(pillar.stem.element) || (chart.analysis?.excessElements || []).includes(pillar.branch.element)) flags.push('chạm hành đang dư');
  const relText = {
    same: 'tăng lực tự thân, nhưng dễ cố chấp hoặc cạnh tranh mạnh',
    generatedBy: 'được bồi lực, hợp học hỏi, tích nền và nhận hỗ trợ',
    generates: 'phải xuất lực ra ngoài, hợp sản xuất, biểu đạt và làm việc',
    controlledBy: 'gặp áp lực/khuôn phép, hợp rèn kỷ luật nhưng dễ căng',
    controls: 'có việc để nắm quyền xử lý, hợp quản trị nguồn lực',
  }[relStem] || 'tạo thế hỗn hợp với nhật chủ';
  return `Thập thần thiên can: **${god}**; khuynh hướng: ${relText}${flags.length ? `; ${flags.join(', ')}` : ''}.`;
}

function calculateLuckCycles(chart) {
  const { stemIndex, branchIndex } = loadBattuData();
  const gender = chart.birth.gender;
  const direction = getLuckDirection(gender, chart.year.stem);
  const boundary = getAdjacentSolarMonthBoundary(
    chart.birth.civil.year,
    chart.birth.civil.month,
    chart.birth.civil.day,
    chart.birth.civil.hour,
    chart.birth.civil.minute,
    direction
  );
  const birthMs = localPartsToUtcMs(
    chart.birth.civil.year,
    chart.birth.civil.month,
    chart.birth.civil.day,
    chart.birth.civil.hour,
    chart.birth.civil.minute,
    0
  );
  const deltaDays = Math.abs(boundary.utcMs - birthMs) / 86400000;
  const startAgeYears = deltaDays / 3;
  const startAge = splitStartAge(startAgeYears);
  const monthStemIdx = stemIndex[chart.month.stem.name];
  const monthBranchIdx = branchIndex[chart.month.branch.name];
  const stepSign = direction === 'forward' ? 1 : -1;
  const cycles = [];
  for (let i = 0; i < 8; i += 1) {
    const step = stepSign * (i + 1);
    const pillar = buildPillarFromIndices(monthStemIdx + step, monthBranchIdx + step);
    const cycleStart = startAgeYears + i * 10;
    cycles.push({
      index: i + 1,
      pillar,
      startAgeYears: Math.round(cycleStart * 100) / 100,
      endAgeYears: Math.round((cycleStart + 10) * 100) / 100,
      ageRange: formatAgeRange(cycleStart),
      summary: summarizeLuckCycle(chart, pillar),
    });
  }
  return {
    gender,
    genderLabel: GENDER_LABEL[gender],
    direction,
    directionLabel: direction === 'forward' ? 'thuận hành' : 'nghịch hành',
    boundary: {
      name: boundary.name,
      year: boundary.year,
      month: boundary.month,
      day: boundary.day,
      hour: boundary.hour,
      minute: boundary.minute,
    },
    deltaDays: Math.round(deltaDays * 1000) / 1000,
    startAge,
    startAgeYears: Math.round(startAgeYears * 1000) / 1000,
    cycles,
  };
}

module.exports = {
  getLuckDirection,
  splitStartAge,
  calculateLuckCycles,
};
