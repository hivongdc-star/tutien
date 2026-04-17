const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const { calcDayPillar, calcYearPillar, calcMonthPillar, enrichAnalysis } = require('./battuCore');
const { getVietnamNowParts } = require('./battuCalendar');
const { analyzeTransitAgainstNatal } = require('./battuRules');
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

function getTrigramForSymbol(symbol) {
  const { trigramByKey, trigrams } = loadBattuData();
  return trigramByKey[`${symbol.element}:${symbol.polarity}`] || trigrams.find((x) => x.element === symbol.element) || trigrams[0];
}

function buildDailyHex(profile, dailyPillar, scored, monthScore) {
  const hexagrams = loadHexagrams();
  if (!hexagrams.length) return null;
  const natalTrig = getTrigramForSymbol(profile.natalChart.day.stem);
  const dailyTrig = getTrigramForSymbol(dailyPillar.branch);
  const monthTrig = getTrigramForSymbol(monthScore.pillar.stem);
  const upper = scored.score >= 65 ? natalTrig.name : (monthScore.analysis.score >= 60 ? monthTrig.name : dailyTrig.name);
  const lower = scored.score >= 55 ? dailyTrig.name : natalTrig.name;
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
  if (!profile?.natalChart?.analysis?.usefulGods || !profile?.natalChart?.analysis?.pattern) enrichAnalysis(profile.natalChart);
  const { content } = loadBattuData();
  const now = getVietnamNowParts();
  const yearPillar = calcYearPillar(now.year, now.month, now.day, now.hour);
  const monthPillar = calcMonthPillar(now.year, now.month, now.day, now.hour, yearPillar.stem.name).pillar;
  const dailyPillar = calcDayPillar(now.year, now.month, now.day);

  const yearScore = { pillar: yearPillar, analysis: analyzeTransitAgainstNatal(profile, yearPillar, 'year') };
  const monthScore = { pillar: monthPillar, analysis: analyzeTransitAgainstNatal(profile, monthPillar, 'month') };
  const scored = analyzeTransitAgainstNatal(profile, dailyPillar, 'day');
  const hex = buildDailyHex(profile, dailyPillar, scored, monthScore);
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
      { name: 'Mệnh gốc quy chiếu', value: `Nhật chủ **${profile.natalChart.day.stem.name} ${profile.natalChart.day.stem.element}** • Nhật chi **${profile.natalChart.day.branch.name}**\nDụng thần hiện hành: **${(profile.natalChart.analysis?.usefulGods?.dungThan || []).join(' / ') || '—'}**`, inline: false },
      { name: 'Lưu niên & lưu nguyệt đi cùng hôm nay', value: `• Lưu niên **${yearScore.pillar.label}** — ${yearScore.analysis.emoji} **${yearScore.analysis.tier}** (${yearScore.analysis.score}/100)\n• Lưu nguyệt **${monthScore.pillar.label}** — ${monthScore.analysis.emoji} **${monthScore.analysis.tier}** (${monthScore.analysis.score}/100)`, inline: false },
      { name: 'Giải thích khí vận', value: scored.reasons.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Khí vận bình ổn.', inline: false },
      { name: 'Bản quẻ hôm nay', value: `${hexTitle}\n${hex?.judgment ? hex.judgment.slice(0, 240) : '—'}`, inline: false },
      { name: 'Nên làm', value: guide.should.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Giữ nhịp ổn định.', inline: true },
      { name: 'Không nên', value: guide.avoid.map((x) => `• ${x}`).join('\n').slice(0, 1024) || '• Tránh hấp tấp.', inline: true },
      { name: 'Chủ đề khí ngày', value: clamp((guide.theme || flavorByTier(scored.tier)) + `\n${content.transitNarratives?.day || ''}`, 1024), inline: false },
    )
    .setFooter({ text: 'Lưu nhật tính theo giờ Việt Nam (Asia/Ho_Chi_Minh), đối chiếu cùng lúc với bản mệnh, lưu niên và lưu nguyệt.' });
}

function clamp(text, max = 1024) {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

module.exports = { createKhivanEmbed };
