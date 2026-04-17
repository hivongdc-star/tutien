const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const { calcDayPillar } = require('./battuCore');
const { getVietnamNowParts } = require('./battuCalendar');
const { relationType, getBranchRelationAgainst } = require('./battuRules');
const { flavorByTier } = require('./khivanText');

let ichingCache = null;
function loadHexagrams() {
  if (ichingCache) return ichingCache;
  const p = path.join(__dirname, '..', 'data', 'iching_vi.json');
  try {
    ichingCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    ichingCache = [];
  }
  return ichingCache;
}

function scoreDaily(profile, dailyPillar) {
  const { ruleset, dailyTiers, dailyGuides } = loadBattuData();
  const cfg = ruleset.dailyAnalysis;
  const natal = profile.natalChart;
  const dayMasterElement = natal.day.stem.element;
  const favorable = natal.analysis?.favorableElements || profile.analysis?.favorableElements || [];
  const weakElements = natal.analysis?.weakElements || [];
  const excessElements = natal.analysis?.excessElements || [];
  const natalBranches = [natal.year.branch.name, natal.month.branch.name, natal.day.branch.name, natal.hour.branch.name];

  let score = cfg.baseScore;
  const reasons = [];

  const relStem = relationType(dayMasterElement, dailyPillar.stem.element);
  score += cfg.relationScores[relStem] || 0;
  reasons.push((dailyGuides.byRelationType?.[relStem]?.note || `Quan hệ ngày: ${relStem}.`) + ` (Can ngày **${dailyPillar.stem.name} ${dailyPillar.stem.element}**).`);

  const relBranch = relationType(dayMasterElement, dailyPillar.branch.element);
  score += Math.round((cfg.relationScores[relBranch] || 0) * 0.5);
  reasons.push(`Địa chi ngày **${dailyPillar.branch.name} ${dailyPillar.branch.element}** tạo thế **${relBranch}** với nhật chủ.`);

  for (const el of [dailyPillar.stem.element, dailyPillar.branch.element]) {
    if (favorable.includes(el)) {
      score += cfg.favorableElementBonus;
      reasons.push(`Khí **${el}** nằm trong nhóm hành trợ mệnh của ngươi.`);
    }
    if (weakElements.includes(el)) {
      score += cfg.balanceAdjust.supportsWeak;
      reasons.push(`Khí **${el}** đang bồi vào phần yếu trong cục mệnh.`);
    }
    if (excessElements.includes(el)) {
      score += cfg.balanceAdjust.hitsExcess;
      reasons.push(`Khí **${el}** chạm vào phần đang dư, hôm nay dễ quá tay nếu không tiết chế.`);
    }
  }

  const branchRelations = getBranchRelationAgainst(dailyPillar.branch.name, natalBranches);
  const seenKinds = new Set();
  for (const rel of branchRelations) {
    if (!seenKinds.has(rel.kind)) {
      score += cfg.branchRelationScores[rel.kind] || 0;
      seenKinds.add(rel.kind);
    }
    if (rel.item.note) reasons.push(rel.item.note);
  }

  const pillarTouch = [
    ['year', natal.year.branch.name],
    ['month', natal.month.branch.name],
    ['day', natal.day.branch.name],
    ['hour', natal.hour.branch.name],
  ];
  for (const [pos, branchName] of pillarTouch) {
    if (dailyPillar.branch.name === branchName) {
      score += cfg.pillarTouch[pos] || 0;
      reasons.push(`Lưu nhật chạm trực tiếp ${pos === 'day' ? 'nhật chi' : pos === 'month' ? 'nguyệt chi' : pos === 'year' ? 'niên chi' : 'thời chi'} bản mệnh.`);
    }
  }

  const normalized = Math.max(0, Math.min(100, score));
  const tierCfg = dailyTiers.tiers.find((x) => normalized >= x.min) || dailyTiers.tiers.at(-1);
  return {
    score: normalized,
    tier: tierCfg.name,
    emoji: tierCfg.emoji,
    color: tierCfg.color,
    descriptor: tierCfg.descriptor,
    reasons: [...new Set(reasons)].slice(0, 8),
    relStem,
  };
}

function getTrigramForSymbol(symbol) {
  const { trigramByKey, trigrams } = loadBattuData();
  return trigramByKey[`${symbol.element}:${symbol.polarity}`] || trigrams.find((x) => x.element === symbol.element) || trigrams[0];
}

function buildDailyHex(profile, dailyPillar, scored) {
  const hexagrams = loadHexagrams();
  if (!hexagrams.length) return null;
  const natalTrig = getTrigramForSymbol(profile.natalChart.day.stem);
  const dailyTrig = getTrigramForSymbol(dailyPillar.branch);
  const upper = scored.score >= 60 ? natalTrig.name : dailyTrig.name;
  const lower = scored.score >= 60 ? dailyTrig.name : natalTrig.name;
  let hex = hexagrams.find((x) => x.upper === upper && x.lower === lower);
  if (!hex) {
    const stemTrig = getTrigramForSymbol(dailyPillar.stem);
    hex = hexagrams.find((x) => x.upper === stemTrig.name && x.lower === natalTrig.name) || null;
  }
  return hex;
}

function buildDailyGuide(scored, dailyPillar, hex) {
  const { dailyGuides } = loadBattuData();
  const base = dailyGuides.tiers[scored.tier] || { should: [], avoid: [] };
  const byElement = dailyGuides.byElement[dailyPillar.stem.element] || dailyGuides.byElement[dailyPillar.branch.element] || { should: [], avoid: [] };
  const should = [...(base.should || []), ...(byElement.should || [])];
  const avoid = [...(base.avoid || []), ...(byElement.avoid || [])];
  if (hex?.do?.length) should.push(...hex.do.slice(0, 2));
  if (hex?.dont?.length) avoid.push(...hex.dont.slice(0, 2));
  return {
    theme: byElement.theme || '',
    should: [...new Set(should)].slice(0, 6),
    avoid: [...new Set(avoid)].slice(0, 6),
  };
}

function createKhivanEmbed(user, profile) {
  const now = getVietnamNowParts();
  const dailyPillar = calcDayPillar(now.year, now.month, now.day);
  const scored = scoreDaily(profile, dailyPillar);
  const hex = buildDailyHex(profile, dailyPillar, scored);
  const guide = buildDailyGuide(scored, dailyPillar, hex);

  const hexTitle = hex
    ? `**${hex.symbol || ''} ${hex.vn || 'Quẻ vô danh'}**${hex.han ? ` — ${hex.han}` : ''}${hex.no ? ` (Quẻ ${hex.no})` : ''}`
    : 'Chưa thể dựng bản quẻ.';

  return new EmbedBuilder()
    .setColor(scored.color)
    .setTitle('☯️ Lưu Nhật Khí Vận')
    .setDescription(
      `${scored.emoji} **${scored.tier}** — ${scored.descriptor || flavorByTier(scored.tier)}\n` +
      `Điểm vận hôm nay: **${scored.score}/100**\n` +
      `Lưu nhật: **${dailyPillar.label}** • giờ VN **${String(now.day).padStart(2, '0')}/${String(now.month).padStart(2, '0')}/${now.year}**`
    )
    .addFields(
      { name: 'Mệnh gốc quy chiếu', value: `Nhật chủ **${profile.natalChart.day.stem.name} ${profile.natalChart.day.stem.element}** • Nhật chi **${profile.natalChart.day.branch.name}**`, inline: false },
      { name: 'Giải thích khí vận', value: scored.reasons.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Khí vận bình ổn.', inline: false },
      { name: 'Bản quẻ hôm nay', value: `${hexTitle}\n${hex?.judgment ? hex.judgment.slice(0, 240) : '—'}`, inline: false },
      { name: 'Nên làm', value: guide.should.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Giữ nhịp ổn định.', inline: true },
      { name: 'Không nên', value: guide.avoid.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Tránh hấp tấp.', inline: true },
      { name: 'Chủ đề khí ngày', value: (guide.theme || flavorByTier(scored.tier)).slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Lưu nhật tính theo giờ Việt Nam (Asia/Ho_Chi_Minh) và đối chiếu trực tiếp với bản mệnh đã lưu.' });
}

module.exports = { createKhivanEmbed };
