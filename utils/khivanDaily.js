const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const { calcDayPillar, calcYearPillar, calcMonthPillar, enrichAnalysis } = require('./battuCore');
const { getVietnamNowParts } = require('./battuCalendar');
const { analyzeTransitAgainstNatal } = require('./battuRules');
const {
  hexFullName,
  hexInlineSymbol,
  compactJudgment,
  oneLineAction,
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
    should: [...new Set(should)].slice(0, 4),
    avoid: [...new Set(avoid)].slice(0, 4),
  };
}

function createKhivanEmbed(user, profile) {
  if (!profile?.natalChart?.analysis?.usefulGods || !profile?.natalChart?.analysis?.pattern) enrichAnalysis(profile.natalChart);
  const now = getVietnamNowParts();
  const yearPillar = calcYearPillar(now.year, now.month, now.day, now.hour);
  const monthPillar = calcMonthPillar(now.year, now.month, now.day, now.hour, yearPillar.stem.name).pillar;
  const dailyPillar = calcDayPillar(now.year, now.month, now.day);

  const monthScore = { pillar: monthPillar, analysis: analyzeTransitAgainstNatal(profile, monthPillar, 'month') };
  const scored = analyzeTransitAgainstNatal(profile, dailyPillar, 'day');
  const hex = buildDailyHex(profile, dailyPillar, scored, monthScore);
  const guide = buildDailyGuide(scored, dailyPillar, hex);

  const hexName = hexFullName(hex);
  const hexLine = compactJudgment(hex?.judgment);
  const actionLine = oneLineAction(guide, scored.tier);

  return new EmbedBuilder()
    .setColor(scored.color)
.setTitle('☯️ Khí Vận Hôm Nay')
    .addFields(
      {
        name: 'Bản quẻ hôm nay',
        value: `${hexInlineSymbol(hex)} **${hexName}**\n**${scored.tier}**\n${hexLine}`,
        inline: false,
      },
      {
        name: 'Hôm nay',
        value: actionLine,
        inline: false,
      },
    )
.setFooter({ text: `Ngày ${String(now.day).padStart(2, '0')}/${String(now.month).padStart(2, '0')}/${now.year} • tính theo giờ Việt Nam` });
}

module.exports = { createKhivanEmbed };
