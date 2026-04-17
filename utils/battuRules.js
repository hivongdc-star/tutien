const { loadBattuData } = require('./battuData');

const BRANCH_ORDER = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

function elementGenerates(a, b) {
  const { relations } = loadBattuData();
  return relations.generate[a] === b;
}

function elementControls(a, b) {
  const { relations } = loadBattuData();
  return relations.control[a] === b;
}

function relationType(dayElement, otherElement) {
  if (dayElement === otherElement) return 'same';
  if (elementGenerates(otherElement, dayElement)) return 'generatedBy';
  if (elementGenerates(dayElement, otherElement)) return 'generates';
  if (elementControls(otherElement, dayElement)) return 'controlledBy';
  if (elementControls(dayElement, otherElement)) return 'controls';
  return 'other';
}

function findGeneratorOf(element) {
  const { relations } = loadBattuData();
  return Object.keys(relations.generate).find((k) => relations.generate[k] === element);
}

function findControllerOf(element) {
  const { relations } = loadBattuData();
  return Object.keys(relations.control).find((k) => relations.control[k] === element);
}

function getTenGod(dayStem, otherStem) {
  const { stemByName, tenGods } = loadBattuData();
  const day = stemByName[dayStem];
  const other = stemByName[otherStem];
  if (!day || !other) return '—';
  const type = relationType(day.element, other.element);
  const samePolarity = day.polarity === other.polarity;
  const bucket = tenGods[type];
  if (!bucket) return '—';
  return samePolarity ? bucket.samePolarity : bucket.oppositePolarity;
}

function getFavorableElements(dayElement, strong) {
  const { content } = loadBattuData();
  const cfg = content.favorableElements?.[dayElement];
  if (!cfg) return [];
  return strong ? cfg.strong : cfg.weak;
}

function scoreElementBalance(elementCounts) {
  const values = Object.values(elementCounts);
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return 50;
  const ideal = total / 5;
  const variance = values.reduce((acc, v) => acc + Math.abs(v - ideal), 0) / total;
  return Math.max(20, Math.min(95, Math.round(92 - variance * 30)));
}

function getYinYangBreakdown(chart) {
  const pillars = [chart.year, chart.month, chart.day, chart.hour];
  let yin = 0;
  let yang = 0;
  for (const p of pillars) {
    if (p.stem.polarity === 'Âm') yin += 2; else yang += 2;
    if (p.branch.polarity === 'Âm') yin += 1; else yang += 1;
  }
  const diff = yang - yin;
  let pattern = 'balanced';
  if (Math.abs(diff) >= 6) pattern = diff > 0 ? 'yangExtreme' : 'yinExtreme';
  else if (Math.abs(diff) > 1) pattern = diff > 0 ? 'yangHeavy' : 'yinHeavy';
  return { yin, yang, pattern };
}

function includesAll(haystack, needles) {
  const counts = new Map();
  for (const item of haystack) counts.set(item, (counts.get(item) || 0) + 1);
  for (const item of needles) {
    const left = counts.get(item) || 0;
    if (!left) return false;
    counts.set(item, left - 1);
  }
  return true;
}

function detectRelations(chart) {
  const { relations } = loadBattuData();
  const stemNames = [chart.year.stem.name, chart.month.stem.name, chart.day.stem.name, chart.hour.stem.name];
  const branchNames = [chart.year.branch.name, chart.month.branch.name, chart.day.branch.name, chart.hour.branch.name];
  const uniqueBranches = [...new Set(branchNames)];

  const canCombos = relations.combos.can.filter((x) => x.pair.every((n) => stemNames.includes(n)));
  const chiLucHop = relations.combos.chiLucHop.filter((x) => x.pair.every((n) => uniqueBranches.includes(n)));
  const chiXung = relations.combos.chiXung.filter((x) => x.pair.every((n) => uniqueBranches.includes(n)));
  const chiHai = relations.combos.chiHai.filter((x) => x.pair.every((n) => uniqueBranches.includes(n)));
  const chiPha = relations.combos.chiPha.filter((x) => x.pair.every((n) => uniqueBranches.includes(n)));
  const chiHinh = relations.combos.chiHinh.filter((x) => includesAll(branchNames, x.group));
  const tamHop = relations.combos.tamHop.filter((x) => x.group.every((n) => uniqueBranches.includes(n)));
  const tamHoi = relations.combos.tamHoi.filter((x) => x.group.every((n) => uniqueBranches.includes(n)));
  const banHop = relations.combos.banHop.filter((x) => x.pair.every((n) => uniqueBranches.includes(n)));

  return { canCombos, chiLucHop, chiXung, chiHai, chiPha, chiHinh, tamHop, tamHoi, banHop };
}

function getBranchRelationAgainst(branchName, natalBranches) {
  const { relations } = loadBattuData();
  const set = [...new Set(natalBranches)];
  const out = [];
  const hasPair = (pair) => pair.includes(branchName) && pair.some((x) => set.includes(x));
  for (const item of relations.combos.chiLucHop) if (hasPair(item.pair)) out.push({ kind: 'lucHop', item });
  for (const item of relations.combos.chiXung) if (hasPair(item.pair)) out.push({ kind: 'xung', item });
  for (const item of relations.combos.chiHai) if (hasPair(item.pair)) out.push({ kind: 'hai', item });
  for (const item of relations.combos.chiPha) if (hasPair(item.pair)) out.push({ kind: 'pha', item });
  for (const item of relations.combos.banHop) if (hasPair(item.pair)) out.push({ kind: 'banHop', item });
  for (const item of relations.combos.tamHop) {
    if (item.group.includes(branchName) && item.group.filter((x) => set.includes(x)).length >= 1) out.push({ kind: 'tamHop', item });
  }
  for (const item of relations.combos.tamHoi) {
    if (item.group.includes(branchName) && item.group.filter((x) => set.includes(x)).length >= 1) out.push({ kind: 'tamHoi', item });
  }
  for (const item of relations.combos.chiHinh) {
    if (item.group.includes(branchName) && item.group.filter((x) => set.includes(x)).length >= 1) out.push({ kind: 'hinh', item });
  }
  return out;
}

function getHiddenStemDetails(chart) {
  const { hiddenStems, stemByName, tenGods } = loadBattuData();
  const priorities = tenGods.hiddenStemPriorities || { main: 1, secondary: 0.65, tertiary: 0.45 };
  const weightByIndex = [priorities.main, priorities.secondary, priorities.tertiary];
  const pillars = [
    ['Niên', chart.year],
    ['Nguyệt', chart.month],
    ['Nhật', chart.day],
    ['Thời', chart.hour],
  ];
  return pillars.map(([position, pillar]) => {
    const hidden = (hiddenStems[pillar.branch.name] || []).map((stemName, idx) => {
      const stem = stemByName[stemName];
      const god = getTenGod(chart.day.stem.name, stemName);
      return {
        name: stemName,
        han: stem?.han || '',
        element: stem?.element || '—',
        polarity: stem?.polarity || '—',
        tenGod: god,
        weight: weightByIndex[idx] || weightByIndex.at(-1) || 0.45,
      };
    });
    return { position, branch: pillar.branch.name, hidden };
  });
}

function aggregateTenGodInfluence(chart) {
  const { tenGods } = loadBattuData();
  const counts = {};
  const stems = [
    { source: 'Niên can', stem: chart.year.stem.name, weight: 1.0 },
    { source: 'Nguyệt can', stem: chart.month.stem.name, weight: 1.4 },
    { source: 'Nhật can', stem: chart.day.stem.name, weight: 0.8 },
    { source: 'Thời can', stem: chart.hour.stem.name, weight: 0.9 },
  ];
  for (const item of stems) {
    const god = getTenGod(chart.day.stem.name, item.stem);
    counts[god] = (counts[god] || 0) + item.weight;
  }
  for (const pillar of getHiddenStemDetails(chart)) {
    for (const hidden of pillar.hidden) {
      counts[hidden.tenGod] = (counts[hidden.tenGod] || 0) + hidden.weight;
    }
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, score]) => ({
    name,
    score: Number(score.toFixed(2)),
    profile: tenGods.profiles[name] || {},
  }));
  return { counts, ranked, top: ranked[0] || null, second: ranked[1] || null };
}

function getChangShengStage(stemName, branchName) {
  const { growthStages } = loadBattuData();
  return growthStages?.matrix?.[stemName]?.[branchName] || '—';
}

function getChangShengSummary(chart) {
  const stages = {
    year: getChangShengStage(chart.day.stem.name, chart.year.branch.name),
    month: getChangShengStage(chart.day.stem.name, chart.month.branch.name),
    day: getChangShengStage(chart.day.stem.name, chart.day.branch.name),
    hour: getChangShengStage(chart.day.stem.name, chart.hour.branch.name),
  };
  return stages;
}

function determinePattern(chart) {
  const { hiddenStems, patterns, content } = loadBattuData();
  const mainHidden = hiddenStems[chart.month.branch.name]?.[0] || chart.month.stem.name;
  const monthGod = getTenGod(chart.day.stem.name, mainHidden);
  const primary = patterns.primaryByTenGod?.[monthGod] || patterns.mixed || 'Tạp Khí cách';
  const followCfg = chart.analysis.followMode;
  const label = followCfg === 'followStrong'
    ? patterns.followPatterns.strong
    : followCfg === 'followWeak'
      ? patterns.followPatterns.weak
      : primary;

  let supportText = `Nguyệt lệnh lấy **${mainHidden}** làm khí chính, quy ra **${monthGod}** nên cục thiên về **${primary}**.`;
  if (followCfg === 'followStrong') {
    supportText = 'Nội cục tụ nhiều thân-ấn, khí tự đứng thành cục; xét theo thế thuận, lá số nghiêng về **Tòng Vượng cách**.';
  } else if (followCfg === 'followWeak') {
    supportText = 'Nội cục nghiêng rõ sang tài/quan/thực thương, nhật chủ khó tự lập cục; xét theo thế thuận, lá số nghiêng về **Tòng Nhược cách**.';
  }

  const desc = content.patternDescriptions?.[label] || content.patternDescriptions?.[primary] || 'Cách cục chưa đủ dấu hiệu để chốt một cửa duy nhất.';

  let synergy = 'Khí cục đi theo lối hỗn hợp, phải xem vận đến mới biết cửa nào mở rõ nhất.';
  const ranked = chart.analysis.tenGodInfluence?.ranked || [];
  const top2 = ranked.slice(0, 2).map((x) => x.name);
  if (top2.includes('Thực Thần') && top2.some((x) => ['Chính Tài', 'Thiên Tài'].includes(x))) {
    synergy = 'Cục có dấu **Thực thần sinh tài**, hợp biến năng lực và sản phẩm thành giá trị thực.';
  } else if (top2.includes('Thất Sát') && top2.some((x) => ['Chính Ấn', 'Thiên Ấn'].includes(x))) {
    synergy = 'Cục có dấu **Sát Ấn tương sinh**, áp lực lớn nhưng nếu học lực đủ thì càng ép càng thành danh.';
  } else if (top2.includes('Thương Quan') && top2.includes('Chính Quan')) {
    synergy = 'Cục có dấu **Thương Quan kiến Quan**, tài biểu đạt mạnh nhưng va khuôn phép; cần rất chặt nhịp nói và luật.';
  } else if (top2.includes('Tỷ Kiên') && top2.includes('Kiếp Tài')) {
    synergy = 'Cục đồng phe dày, rất mạnh ở tự thân và mạng lưới ngang hàng, nhưng phải giữ ranh giới tài lực.';
  }

  return { label, base: primary, monthGod, mainHidden, description: desc, supportText, synergy };
}

function determineUsefulGods(chart) {
  const { relations, ruleset, content } = loadBattuData();
  const weightCfg = ruleset.natalAnalysis.usefulGodWeights || {};
  const dayEl = chart.day.stem.element;
  const resEl = findGeneratorOf(dayEl);
  const outputEl = relations.generate[dayEl];
  const wealthEl = relations.control[dayEl];
  const officerEl = findControllerOf(dayEl);
  const sameEl = dayEl;
  const season = relations.seasonSupport[chart.month.branch.name] || { dominant: chart.month.branch.element, supports: [], pressures: [] };
  const excess = new Set(chart.analysis.excessElements || []);
  const weak = new Set(chart.analysis.weakElements || []);
  const mode = chart.analysis.followMode || (chart.analysis.strong ? 'strong' : 'weak');

  const scoreMap = { Kim: 0, Mộc: 0, Thủy: 0, Hỏa: 0, Thổ: 0 };
  const boost = (el, value) => { scoreMap[el] = (scoreMap[el] || 0) + value; };

  if (mode === 'followStrong') {
    boost(officerEl, 10 + (weightCfg.controllerPriority || 0));
    boost(outputEl, 8 + (weightCfg.outputPriority || 0));
    boost(wealthEl, 6);
    boost(sameEl, -(weightCfg.samePenalty || 10));
    boost(resEl, -(weightCfg.samePenalty || 10));
  } else if (mode === 'followWeak') {
    boost(wealthEl, 8);
    boost(officerEl, 8);
    boost(outputEl, 6);
    boost(sameEl, -(weightCfg.samePenalty || 10));
    boost(resEl, -(weightCfg.samePenalty || 10));
  } else if (chart.analysis.strong) {
    boost(officerEl, 12 + (weightCfg.controllerPriority || 0));
    boost(outputEl, 10 + (weightCfg.outputPriority || 0));
    boost(wealthEl, 8);
    boost(sameEl, -(weightCfg.samePenalty || 10));
    boost(resEl, -(weightCfg.samePenalty || 10));
  } else {
    boost(resEl, 12 + (weightCfg.resourcePriority || 0));
    boost(sameEl, 10 + (weightCfg.companionPriority || 0));
    boost(officerEl, -8);
    boost(wealthEl, -8);
    boost(outputEl, -6);
  }

  if (season.supports?.includes(dayEl)) boost(dayEl, weightCfg.seasonBoost || 8);
  if (season.supports?.includes(resEl)) boost(resEl, weightCfg.seasonBoost || 8);
  if (season.pressures?.includes(dayEl)) boost(officerEl, weightCfg.seasonBoost || 8);

  weak.forEach((el) => boost(el, weightCfg.weakFillBoost || 10));
  excess.forEach((el) => boost(el, -(weightCfg.excessPenalty || 8)));

  const ranked = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  const dungThan = ranked.slice(0, 2).map(([el]) => el);
  const hyThan = ranked.slice(2, 4).filter(([, score]) => score > 0).map(([el]) => el);
  const kyThan = ranked.slice(-2).reverse().map(([el]) => el);
  const nhanThan = ranked.filter(([, score]) => score >= -2 && score <= 2).map(([el]) => el);

  const modeCfg = content.usefulGods?.[mode] || {};
  const explanation = [
    modeCfg.core,
    `Cục hiện ${chart.analysis.strong ? 'vượng thân' : 'nhược thân'} với trọng tâm mùa khí ở **${season.dominant}**.`,
    `Ưu tiên dùng **${dungThan.join(' / ')}** để điều nhịp; vui dùng **${hyThan.join(' / ') || 'không rõ'}**; kỵ nhất **${kyThan.join(' / ')}**.`,
  ].filter(Boolean).join(' ');

  return { mode, scores: scoreMap, dungThan, hyThan, kyThan, nhanThan, explanation };
}

function summarizeStagePattern(stages) {
  const arr = Object.values(stages);
  const active = ['Lâm Quan', 'Đế Vượng', 'Quan Đới'].filter((x) => arr.includes(x));
  const dormant = ['Mộ', 'Tuyệt', 'Thai', 'Dưỡng'].filter((x) => arr.includes(x));
  if (active.length >= 2) return 'Các trụ có nhiều điểm dựng khí mạnh, hợp gánh việc khi vận đến đúng cửa.';
  if (dormant.length >= 2) return 'Khí cục có xu hướng tàng, cần ủ lực và chọn nhịp mở đúng thời mới phát hết tiềm năng.';
  return 'Trường sinh 12 vận phân bố khá pha trộn, cần xét từng trụ theo việc cụ thể.';
}

function detectShenSha(chart) {
  const { shensha, content } = loadBattuData();
  const branches = [chart.year.branch.name, chart.month.branch.name, chart.day.branch.name, chart.hour.branch.name];
  const stems = [chart.year.stem.name, chart.month.stem.name, chart.day.stem.name, chart.hour.stem.name];
  const active = [];

  const refBranches = [chart.day.branch.name, chart.year.branch.name];
  for (const ref of refBranches) {
    const group = shensha.branchGroupMap?.[ref];
    const cfg = shensha.groups?.[group];
    if (!cfg) continue;
    if (branches.includes(cfg.peach)) active.push({ name: 'Đào Hoa', by: ref, target: cfg.peach, desc: content.shenShaDescriptions?.['Đào Hoa'] });
    if (branches.includes(cfg.horse)) active.push({ name: 'Dịch Mã', by: ref, target: cfg.horse, desc: content.shenShaDescriptions?.['Dịch Mã'] });
    if (branches.includes(cfg.huagai)) active.push({ name: 'Hoa Cái', by: ref, target: cfg.huagai, desc: content.shenShaDescriptions?.['Hoa Cái'] });
    if (cfg.hongluan && branches.includes(cfg.hongluan)) active.push({ name: 'Hồng Loan', by: ref, target: cfg.hongluan, desc: content.shenShaDescriptions?.['Hồng Loan'] });
  }

  const tianyiTargets = shensha.tianyiByStem?.[chart.day.stem.name] || [];
  if (tianyiTargets.some((x) => branches.includes(x))) {
    active.push({ name: 'Thiên Ất Quý Nhân', by: chart.day.stem.name, target: tianyiTargets.filter((x) => branches.includes(x)).join(', '), desc: content.shenShaDescriptions?.['Thiên Ất Quý Nhân'] });
  }
  const wenchangTarget = shensha.wenchangByStem?.[chart.day.stem.name];
  if (wenchangTarget && branches.includes(wenchangTarget)) {
    active.push({ name: 'Văn Xương', by: chart.day.stem.name, target: wenchangTarget, desc: content.shenShaDescriptions?.['Văn Xương'] });
  }

  const dedup = [];
  const seen = new Set();
  for (const item of active) {
    const key = `${item.name}:${item.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(item);
  }
  return dedup;
}

function analyzeTransitAgainstNatal(profileOrChart, transitPillar, granularity = 'day') {
  const { ruleset, dailyTiers, dailyGuides } = loadBattuData();
  const profile = profileOrChart.natalChart ? profileOrChart : { natalChart: profileOrChart };
  const natal = profile.natalChart;
  const cfg = granularity === 'day' ? ruleset.dailyAnalysis : (ruleset.transitAnalysis?.[granularity] || ruleset.dailyAnalysis);
  const dayMasterElement = natal.day.stem.element;
  const favorable = natal.analysis?.favorableElements || [];
  const weakElements = natal.analysis?.weakElements || [];
  const excessElements = natal.analysis?.excessElements || [];
  const natalBranches = [natal.year.branch.name, natal.month.branch.name, natal.day.branch.name, natal.hour.branch.name];

  let score = cfg.baseScore;
  const reasons = [];

  const relStem = relationType(dayMasterElement, transitPillar.stem.element);
  score += cfg.relationScores?.[relStem] || 0;
  const relationNote = dailyGuides.byRelationType?.[relStem]?.note;
  if (relationNote) reasons.push(relationNote);

  const relBranch = relationType(dayMasterElement, transitPillar.branch.element);
  score += Math.round((cfg.relationScores?.[relBranch] || 0) * 0.5);
  reasons.push(`Chi **${transitPillar.branch.name} ${transitPillar.branch.element}** tạo thế **${relBranch}** với nhật chủ.`);

  for (const el of [transitPillar.stem.element, transitPillar.branch.element]) {
    if (favorable.includes(el)) {
      score += cfg.favorableElementBonus || 0;
      reasons.push(`Khí **${el}** thuộc nhóm hành đang trợ mệnh.`);
    }
    if (weakElements.includes(el)) {
      score += cfg.supportsWeak || cfg.balanceAdjust?.supportsWeak || 0;
      reasons.push(`Khí **${el}** đang bồi vào phần yếu của cục.`);
    }
    if (excessElements.includes(el)) {
      score += cfg.hitsExcess || cfg.balanceAdjust?.hitsExcess || 0;
      reasons.push(`Khí **${el}** chạm phần đang dư, dễ hóa quá tay.`);
    }
  }

  const branchRelations = getBranchRelationAgainst(transitPillar.branch.name, natalBranches);
  const seenKinds = new Set();
  for (const rel of branchRelations) {
    if (!seenKinds.has(rel.kind)) {
      score += cfg.branchRelationScores?.[rel.kind] || 0;
      seenKinds.add(rel.kind);
    }
    if (rel.item.note) reasons.push(rel.item.note);
  }

  const touchCfg = cfg.touchWeights || cfg.pillarTouch || {};
  const pillarTouch = [
    ['year', natal.year.branch.name],
    ['month', natal.month.branch.name],
    ['day', natal.day.branch.name],
    ['hour', natal.hour.branch.name],
  ];
  for (const [pos, branchName] of pillarTouch) {
    if (transitPillar.branch.name === branchName) {
      score += touchCfg[pos] || 0;
      reasons.push(`Khí vận chạm trực tiếp ${pos === 'day' ? 'nhật chi' : pos === 'month' ? 'nguyệt chi' : pos === 'year' ? 'niên chi' : 'thời chi'} bản mệnh.`);
    }
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const tierCfg = dailyTiers.tiers.find((x) => normalized >= x.min) || dailyTiers.tiers.at(-1);
  return {
    score: normalized,
    tier: tierCfg.name,
    emoji: tierCfg.emoji,
    color: tierCfg.color,
    descriptor: tierCfg.descriptor,
    relStem,
    reasons: [...new Set(reasons)].slice(0, 8),
  };
}

module.exports = {
  elementGenerates,
  elementControls,
  relationType,
  findGeneratorOf,
  findControllerOf,
  getTenGod,
  getFavorableElements,
  scoreElementBalance,
  getYinYangBreakdown,
  detectRelations,
  getBranchRelationAgainst,
  getHiddenStemDetails,
  aggregateTenGodInfluence,
  getChangShengStage,
  getChangShengSummary,
  determinePattern,
  determineUsefulGods,
  summarizeStagePattern,
  detectShenSha,
  analyzeTransitAgainstNatal,
};
