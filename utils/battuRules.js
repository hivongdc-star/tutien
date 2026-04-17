const { loadBattuData } = require('./battuData');

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
  const pattern = Math.abs(diff) <= 1 ? 'balanced' : diff > 0 ? 'yangHeavy' : 'yinHeavy';
  return { yin, yang, pattern };
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
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

module.exports = {
  elementGenerates,
  elementControls,
  relationType,
  getTenGod,
  getFavorableElements,
  scoreElementBalance,
  getYinYangBreakdown,
  detectRelations,
  getBranchRelationAgainst,
};
