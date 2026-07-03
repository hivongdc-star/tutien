const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const { calcDayPillar, calcYearPillar, calcMonthPillar, enrichAnalysis } = require('./battuCore');
const { getVietnamNowParts, localPartsToUtcMs } = require('./battuCalendar');
const { analyzeTransitAgainstNatal } = require('./battuRules');
const {
  hexFullName,
  hexInlineSymbol,
  compactJudgment,
  oneLineAction,
  movingLineText,
  tierMoodLine,
} = require('./khivanText');

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

function stableHashInt(...parts) {
  const raw = parts.map((x) => {
    if (x === null || x === undefined) return '';
    if (typeof x === 'string') return x;
    return JSON.stringify(x);
  }).join('|');
  const hex = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return parseInt(hex, 16);
}

function pickByHash(items, seed) {
  if (!items?.length) return null;
  return items[Math.abs(seed) % items.length];
}

function getTrigramForSymbol(symbol) {
  const { trigramByKey, trigrams } = loadBattuData();
  return trigramByKey[`${symbol.element}:${symbol.polarity}`] || trigrams.find((x) => x.element === symbol.element) || trigrams[0];
}

function pillarLabel(pillar) {
  if (!pillar) return '—';
  return `${pillar.stem?.han || ''}${pillar.branch?.han || ''} ${pillar.stem?.name || '?'}${pillar.branch?.name || '?'}`.trim();
}

function getTierByScore(score) {
  const { dailyTiers } = loadBattuData();
  const normalized = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const tierCfg = dailyTiers.tiers.find((x) => normalized >= x.min) || dailyTiers.tiers.at(-1);
  return {
    score: normalized,
    tier: tierCfg.name,
    emoji: tierCfg.emoji,
    color: tierCfg.color,
    descriptor: tierCfg.descriptor,
  };
}

function buildFallbackHex(profile, dailyPillar, finalScore, monthScore) {
  const hexagrams = loadHexagrams();
  if (!hexagrams.length) return null;
  const natalTrig = getTrigramForSymbol(profile.natalChart.day.stem);
  const dailyTrig = getTrigramForSymbol(dailyPillar.branch);
  const monthTrig = getTrigramForSymbol(monthScore.pillar.stem);
  const upper = finalScore.score >= 65 ? natalTrig.name : (monthScore.analysis.score >= 60 ? monthTrig.name : dailyTrig.name);
  const lower = finalScore.score >= 55 ? dailyTrig.name : natalTrig.name;
  let hex = hexagrams.find((x) => x.upper === upper && x.lower === lower);
  if (!hex) {
    const stemTrig = getTrigramForSymbol(dailyPillar.stem);
    hex = hexagrams.find((x) => x.upper === stemTrig.name && x.lower === natalTrig.name) || null;
  }
  return hex;
}

function tierPoolNames(tier) {
  const map = {
    'Đại Cát': ['Đại Cát', 'Cát'],
    'Cát': ['Đại Cát', 'Cát', 'Tiểu Cát'],
    'Tiểu Cát': ['Cát', 'Tiểu Cát', 'Bình'],
    'Bình': ['Tiểu Cát', 'Bình', 'Tiểu Hung'],
    'Tiểu Hung': ['Bình', 'Tiểu Hung', 'Hung'],
    'Hung': ['Tiểu Hung', 'Hung', 'Đại Hung'],
    'Đại Hung': ['Hung', 'Đại Hung'],
  };
  return map[tier] || ['Bình'];
}

function buildDivinationHex(user, profile, now, dailyPillar, finalScore, layers, monthScore) {
  const hexagrams = loadHexagrams();
  if (!hexagrams.length) {
    return { hex: buildFallbackHex(profile, dailyPillar, finalScore, monthScore), movingLine: null };
  }

  const seed = stableHashInt(
    user?.id || profile.userId || '',
    profile.meta?.createdAt || '',
    `${now.year}-${now.month}-${now.day}`,
    profile.natalChart?.day?.stem?.name,
    profile.natalChart?.day?.branch?.name,
    layers.map((x) => `${x.key}:${pillarLabel(x.pillar)}:${x.analysis.score}`).join(';'),
    finalScore.tier,
  );

  const poolNames = tierPoolNames(finalScore.tier);
  let pool = hexagrams.filter((x) => poolNames.includes(x.tier7));
  if (!pool.length) pool = hexagrams;
  const hex = pickByHash(pool, seed) || buildFallbackHex(profile, dailyPillar, finalScore, monthScore);
  const movingLine = (stableHashInt(seed, 'moving-line') % 6) + 1;
  return { hex, movingLine };
}

function buildDailyGuide(finalScore, dailyPillar, hex) {
  const { dailyGuides } = loadBattuData();
  const base = dailyGuides.tiers[finalScore.tier] || { should: [], avoid: [] };
  const byElement = dailyGuides.byElement[dailyPillar.stem.element] || dailyGuides.byElement[dailyPillar.branch.element] || { should: [], avoid: [] };
  const should = [...(base.should || []), ...(byElement.should || [])];
  const avoid = [...(base.avoid || []), ...(byElement.avoid || [])];
  if (hex?.do?.length) should.push(...hex.do.slice(0, 2));
  if (hex?.dont?.length) avoid.push(...hex.dont.slice(0, 2));
  return {
    theme: byElement.theme || '',
    should: [...new Set(should)].slice(0, 4),
    avoid: [...new Set(avoid)].slice(0, 4),
  };
}

function getCurrentLuckCycle(profile, now) {
  const birth = profile.birth?.civil || profile.natalChart?.birth?.civil;
  const cycles = profile.luck?.cycles || profile.natalChart?.luck?.cycles || [];
  if (!birth || !cycles.length) return null;
  const birthMs = localPartsToUtcMs(birth.year, birth.month, birth.day, birth.hour || 0, birth.minute || 0, 0);
  const nowMs = localPartsToUtcMs(now.year, now.month, now.day, now.hour || 0, now.minute || 0, now.second || 0);
  const ageYears = (nowMs - birthMs) / (365.2425 * 86400000);
  const cycle = cycles.find((x) => ageYears >= x.startAgeYears && ageYears < x.endAgeYears) || null;
  return { cycle, ageYears };
}

function buildTransitLayers(profile, now) {
  const yearPillar = calcYearPillar(now.year, now.month, now.day, now.hour, now.minute);
  const monthPillar = calcMonthPillar(now.year, now.month, now.day, now.hour, now.minute, yearPillar.stem.name).pillar;
  const dailyPillar = calcDayPillar(now.year, now.month, now.day, now.hour);
  const currentLuck = getCurrentLuckCycle(profile, now);

  const layers = [];
  if (currentLuck?.cycle?.pillar) {
    layers.push({
      key: 'luck',
      name: 'Đại vận',
      pillar: currentLuck.cycle.pillar,
      weight: 0.22,
      note: currentLuck.cycle.ageRange,
      analysis: analyzeTransitAgainstNatal(profile, currentLuck.cycle.pillar, 'year'),
    });
  }
  layers.push({ key: 'year', name: 'Lưu niên', pillar: yearPillar, weight: 0.22, analysis: analyzeTransitAgainstNatal(profile, yearPillar, 'year') });
  layers.push({ key: 'month', name: 'Lưu nguyệt', pillar: monthPillar, weight: 0.24, analysis: analyzeTransitAgainstNatal(profile, monthPillar, 'month') });
  layers.push({ key: 'day', name: 'Lưu nhật', pillar: dailyPillar, weight: 0.32, analysis: analyzeTransitAgainstNatal(profile, dailyPillar, 'day') });

  const totalWeight = layers.reduce((sum, item) => sum + item.weight, 0) || 1;
  const composite = layers.reduce((sum, item) => sum + item.analysis.score * item.weight, 0) / totalWeight;
  const finalScore = getTierByScore(composite);
  return { layers, finalScore, yearPillar, monthPillar, dailyPillar, currentLuck };
}

function elementHitText(profile, dailyPillar) {
  const analysis = profile.natalChart?.analysis || {};
  const useful = analysis.usefulGods || {};
  const dayElements = [...new Set([dailyPillar.stem.element, dailyPillar.branch.element])];
  const dung = dayElements.filter((el) => useful.dungThan?.includes(el));
  const hy = dayElements.filter((el) => useful.hyThan?.includes(el));
  const ky = dayElements.filter((el) => useful.kyThan?.includes(el));
  const weak = dayElements.filter((el) => analysis.weakElements?.includes(el));
  const excess = dayElements.filter((el) => analysis.excessElements?.includes(el));

  const out = [];
  if (dung.length) out.push(`Chạm **Dụng thần ${dung.join(' / ')}**, ngày có cửa dùng lực đúng chỗ.`);
  if (hy.length) out.push(`Có **Hỷ thần ${hy.join(' / ')}**, hợp đẩy việc vừa sức.`);
  if (weak.length) out.push(`Bồi vào hành đang yếu: **${weak.join(' / ')}**.`);
  if (ky.length) out.push(`Chạm **Kỵ thần ${ky.join(' / ')}**, nên bớt nóng và tránh quyết liều.`);
  if (excess.length) out.push(`Đụng hành đang dư: **${excess.join(' / ')}**, dễ quá tay nếu ép nhịp.`);
  return out;
}

function layerLine(item) {
  const sign = item.analysis.score >= 60 ? '＋' : item.analysis.score <= 44 ? '－' : '＝';
  const note = item.note ? ` · ${item.note}` : '';
  return `${sign} **${item.name}** ${pillarLabel(item.pillar)}: ${item.analysis.tier} (${item.analysis.score}/100)${note}`;
}

function buildMingpanReading(profile, dailyPillar, finalScore, layers) {
  const natal = profile.natalChart;
  const notes = [];
  notes.push(`Nhật chủ bản mệnh: **${natal.day.stem.han}${natal.day.stem.name} ${natal.day.stem.element}**; lưu nhật hôm nay: **${pillarLabel(dailyPillar)}**.`);
  notes.push(...elementHitText(profile, dailyPillar));

  const dayLayer = layers.find((x) => x.key === 'day');
  const monthLayer = layers.find((x) => x.key === 'month');
  const luckLayer = layers.find((x) => x.key === 'luck');
  const reasonPool = [
    ...(dayLayer?.analysis?.reasons || []),
    ...(monthLayer?.analysis?.reasons || []),
    ...(luckLayer?.analysis?.reasons || []),
  ];
  for (const reason of reasonPool) {
    if (notes.length >= 4) break;
    if (reason && !notes.includes(reason)) notes.push(reason);
  }

  if (notes.length < 2) notes.push(tierMoodLine(finalScore.tier));
  return notes.slice(0, 4).join('\n');
}

function shortList(items, fallback) {
  const picked = [...new Set((items || []).filter(Boolean))].slice(0, 2);
  return picked.length ? picked.join('; ') : fallback;
}

function createKhivanEmbed(user, profile) {
  if (!profile?.natalChart?.analysis?.usefulGods || !profile?.natalChart?.analysis?.pattern) enrichAnalysis(profile.natalChart);
  const now = getVietnamNowParts();
  const { layers, finalScore, monthPillar, dailyPillar } = buildTransitLayers(profile, now);
  const monthScore = { pillar: monthPillar, analysis: layers.find((x) => x.key === 'month')?.analysis || analyzeTransitAgainstNatal(profile, monthPillar, 'month') };
  const { hex } = buildDivinationHex(user, profile, now, dailyPillar, finalScore, layers, monthScore);
  const guide = buildDailyGuide(finalScore, dailyPillar, hex);

  const hexName = hexFullName(hex);
  const hexLine = compactJudgment(hex?.judgment || hex?.shortMeaning);
  const shouldLine = shortList(guide.should, 'giữ nhịp ổn định, xử việc vừa sức');
  const avoidLine = shortList(guide.avoid, 'hấp tấp, quyết việc lớn khi chưa đủ chắc');

  return new EmbedBuilder()
    .setColor(finalScore.color)
    .setTitle('🔮 Khí Vận Hôm Nay')
    .addFields({
      name: 'Quẻ cát hung',
      value: `${hexInlineSymbol(hex)} **${hexName}**\n${finalScore.emoji} **${finalScore.tier}** (${finalScore.score}/100)\n**Giải quẻ:** ${hexLine}\n**Nên:** ${shouldLine}.\n**Không nên:** ${avoidLine}.`,
      inline: false,
    })
    .setFooter({ text: `Ngày ${String(now.day).padStart(2, '0')}/${String(now.month).padStart(2, '0')}/${now.year} • giờ Việt Nam • quẻ ổn định trong ngày` });
}

module.exports = { createKhivanEmbed };
