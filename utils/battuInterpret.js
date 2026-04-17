const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const {
  detectRelations,
  getTenGod,
  getHiddenStemDetails,
  summarizeStagePattern,
  analyzeTransitAgainstNatal,
} = require('./battuRules');
const { calcYearPillar, calcMonthPillar, enrichAnalysis } = require('./battuCore');
const { getVietnamNowParts } = require('./battuCalendar');

function clamp(text, max = 1024) {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatElementCounts(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `• ${k}: **${v.toFixed(2)}**`)
    .join('\n');
}

function summarizeElementBias(counts) {
  const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    dominant: arr[0]?.[0] || '—',
    weakest: arr[arr.length - 1]?.[0] || '—',
    second: arr[1]?.[0] || '—',
  };
}

function buildNarrative(chart) {
  const { content } = loadBattuData();
  const dm = chart.dayMaster.name;
  const dayElement = chart.dayMaster.element;
  const bias = summarizeElementBias(chart.analysis.elementCounts);
  const monthBranch = chart.month.branch.name;
  const dayMasterCfg = content.dayMasters[dm] || {};
  const strongText = chart.analysis.strong ? dayMasterCfg.strong : dayMasterCfg.weak;
  const monthText = content.monthCommand[monthBranch] || `Nguyệt lệnh ${monthBranch} là nền thời khí chính của lá số.`;
  const strengthText = content.strengthPatterns[chart.analysis.strengthBand] || 'Lá số đang ở trạng thái quân bình tương đối.';
  const yinYangText = content.yinYangPatterns[chart.analysis.yinYang.pattern] || 'Âm dương đang ở thế khó phân thiên lệch.';
  return {
    portrait: dayMasterCfg.portrait || '—',
    strongText: strongText || '—',
    monthText,
    strengthText,
    yinYangText,
    favorableText: `Hành nên ưu tiên để cân bằng cục diện: **${chart.analysis.favorableElements.join(', ')}**.`,
    biasText: `Ngũ hành nổi hơn là **${bias.dominant}**, kế đó là **${bias.second}**; yếu hơn là **${bias.weakest}**.`,
    excessText: chart.analysis.excessElements.length ? chart.analysis.excessElements.join(', ') : 'không có hành nào vượt trội quá mạnh',
    weakText: chart.analysis.weakElements.length ? chart.analysis.weakElements.join(', ') : 'không có hành nào bị rỗng rõ',
    strongModeText: chart.analysis.strong ? dayMasterCfg.favorableWhenStrong : dayMasterCfg.favorableWhenWeak,
    pillarMeanings: content.pillarMeanings,
    dayElementText: content.elements[dayElement]?.traits || '—',
    dayElementExcess: content.elements[dayElement]?.excess || '—',
    dayElementWeak: content.elements[dayElement]?.weak || '—',
  };
}

function buildPillarBlock(chart) {
  const { content } = loadBattuData();
  return [
    `• **Niên trụ:** ${chart.year.label} — ${content.pillarMeanings.year}`,
    `• **Nguyệt trụ:** ${chart.month.label} — ${content.pillarMeanings.month}`,
    `• **Nhật trụ:** ${chart.day.label} — ${content.pillarMeanings.day}`,
    `• **Thời trụ:** ${chart.hour.label} — ${content.pillarMeanings.hour}`,
  ].join('\n');
}

function buildTenGodSummary(chart) {
  const { tenGods } = loadBattuData();
  const pairs = [
    ['Niên can', chart.year.stem.name],
    ['Nguyệt can', chart.month.stem.name],
    ['Thời can', chart.hour.stem.name],
  ];
  const gods = pairs.map(([label, stem]) => {
    const god = getTenGod(chart.day.stem.name, stem);
    const profile = tenGods.profiles[god] || {};
    return { label, stem, god, profile };
  });
  const lines = gods.map((x) => `• ${x.label} **${x.stem}** → **${x.god}**: ${x.profile.core || '—'}`);
  const focus = chart.analysis.tenGodInfluence?.top || gods[1] || gods[0];
  return {
    lines: lines.join('\n'),
    focusTitle: focus?.name || focus?.god || '—',
    focusText: [focus?.profile?.bright, focus?.profile?.shadow, focus?.profile?.career].filter(Boolean).join(' ') || '—',
    rankedText: (chart.analysis.tenGodInfluence?.ranked || []).slice(0, 5).map((x) => `• **${x.name}**: ${x.score}`).join('\n') || '—',
  };
}

function buildHiddenStemSummary(chart) {
  const details = getHiddenStemDetails(chart);
  return details.map((pillar) => {
    const line = pillar.hidden
      .map((x) => `${x.han}${x.name} (${x.element}) → ${x.tenGod}`)
      .join(' • ');
    return `• **${pillar.position} chi ${pillar.branch}**: ${line || '—'}`;
  }).join('\n');
}

function buildRelationSummary(chart) {
  const rel = detectRelations(chart);
  const lines = [];
  for (const item of rel.canCombos) lines.push(`• Can hợp ${item.pair.join('-')} → thiên hướng hóa ${item.transform}. ${item.note}`);
  for (const item of rel.chiLucHop) lines.push(`• Lục hợp ${item.pair.join('-')}: ${item.note}`);
  for (const item of rel.tamHop) lines.push(`• Tam hợp ${item.group.join('-')} → cục ${item.element}. ${item.note}`);
  for (const item of rel.tamHoi) lines.push(`• Tam hội ${item.group.join('-')} → khí ${item.element} liền mạch. ${item.note}`);
  for (const item of rel.banHop || []) lines.push(`• Bán hợp ${item.pair.join('-')} → mầm ${item.element}. ${item.note}`);
  for (const item of rel.chiXung) lines.push(`• Xung ${item.pair.join('-')}: ${item.note}`);
  for (const item of rel.chiHai) lines.push(`• Hại ${item.pair.join('-')}: ${item.note}`);
  for (const item of rel.chiPha) lines.push(`• Phá ${item.pair.join('-')}: ${item.note}`);
  for (const item of rel.chiHinh) lines.push(`• ${item.type} ${item.group.join('-')}: ${item.note}`);
  return lines.length ? lines.slice(0, 12).join('\n') : '• Nội cục không lộ cặp hợp/xung lớn ở tầng cơ bản.';
}

function buildUsefulGodSummary(chart) {
  const ug = chart.analysis.usefulGods;
  const lines = [
    `• **Dụng thần:** ${ug.dungThan.join(' / ')}`,
    `• **Hỷ thần:** ${ug.hyThan.join(' / ') || 'chưa nổi rõ'}`,
    `• **Kỵ thần:** ${ug.kyThan.join(' / ')}`,
    `• **Nhàn thần:** ${ug.nhanThan.join(' / ') || 'không đáng kể'}`,
  ];
  return { lines: lines.join('\n'), explanation: ug.explanation };
}

function buildPatternSummary(chart) {
  const p = chart.analysis.pattern;
  return {
    title: p.label,
    text: [p.supportText, p.description, p.synergy].filter(Boolean).join(' '),
  };
}

function buildGrowthSummary(chart) {
  const { content } = loadBattuData();
  const stages = chart.analysis.growthStages;
  const lines = [
    `• Niên chi **${chart.year.branch.name}** → **${stages.year}**`,
    `• Nguyệt chi **${chart.month.branch.name}** → **${stages.month}**`,
    `• Nhật chi **${chart.day.branch.name}** → **${stages.day}**`,
    `• Thời chi **${chart.hour.branch.name}** → **${stages.hour}**`,
  ];
  const stageNotes = [stages.year, stages.month, stages.day, stages.hour]
    .map((s) => `• **${s}**: ${content.stageDescriptions?.[s] || '—'}`)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 4)
    .join('\n');
  return {
    lines: lines.join('\n'),
    note: summarizeStagePattern(stages),
    stageNotes,
  };
}

function buildShenShaSummary(chart) {
  const active = chart.analysis.shenSha || [];
  if (!active.length) return '• Lá số không lộ thần sát mạnh ở bộ cơ bản đang xét.';
  return active.map((x) => `• **${x.name}** (${x.target}) — ${x.desc}`).join('\n');
}

function buildTransitSummary(chart) {
  const { content } = loadBattuData();
  const now = getVietnamNowParts();
  const yearPillar = calcYearPillar(now.year, now.month, now.day, now.hour);
  const monthPillar = calcMonthPillar(now.year, now.month, now.day, now.hour, yearPillar.stem.name).pillar;
  const yearHit = analyzeTransitAgainstNatal(chart, yearPillar, 'year');
  const monthHit = analyzeTransitAgainstNatal(chart, monthPillar, 'month');
  return {
    year: {
      pillar: yearPillar,
      analysis: yearHit,
      note: content.transitNarratives?.year || '',
    },
    month: {
      pillar: monthPillar,
      analysis: monthHit,
      note: content.transitNarratives?.month || '',
    },
    now,
  };
}

function createBattuEmbeds(user, chart) {
  if (!chart.analysis?.usefulGods || !chart.analysis?.pattern || !chart.analysis?.growthStages) enrichAnalysis(chart);
  const { sources, content } = loadBattuData();
  const n = buildNarrative(chart);
  const counts = chart.analysis.elementCounts;
  const tenGod = buildTenGodSummary(chart);
  const useful = buildUsefulGodSummary(chart);
  const pattern = buildPatternSummary(chart);
  const growth = buildGrowthSummary(chart);
  const transit = buildTransitSummary(chart);
  const embeds = [];

  embeds.push(
    new EmbedBuilder()
      .setColor(0x6C5CE7)
      .setTitle('Mệnh Bàn Bát Tự')
      .setDescription(
        `**${user.username}** — mệnh bàn lấy theo múi giờ **${chart.birth.timezone}**\n` +
        `Sinh thời: **${String(chart.birth.day).padStart(2, '0')}/${String(chart.birth.month).padStart(2, '0')}/${chart.birth.year} ${chart.birth.hourRange}**\n\n` +
        buildPillarBlock(chart)
      )
      .addFields(
        { name: 'Nhật chủ', value: `**${chart.dayMaster.han} ${chart.dayMaster.name}** — ${chart.dayMaster.element} ${chart.dayMaster.polarity}`, inline: true },
        { name: 'Điểm lực nhật chủ', value: `**${chart.analysis.strengthScore}/100**`, inline: true },
        { name: 'Cân bằng ngũ hành', value: `**${chart.analysis.balanceScore}/100**`, inline: true },
        { name: 'Tiết khí quy chiếu', value: `${chart.solarBoundary.name} (**${String(chart.solarBoundary.day).padStart(2, '0')}/${String(chart.solarBoundary.month).padStart(2, '0')} ${String(chart.solarBoundary.hour).padStart(2, '0')}:${String(chart.solarBoundary.minute).padStart(2, '0')}**) → tháng **${chart.month.branch.name}**`, inline: false },
        { name: 'Chân dung nhật chủ', value: clamp(n.portrait), inline: false },
      )
      .setFooter({ text: 'Trụ tháng lấy theo tiết khí. Mốc Lập Xuân dùng để phân niên trụ.' })
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0x00A86B)
      .setTitle('Thời Khí Và Sức Mệnh')
      .setDescription(`${n.monthText}\n${n.strengthText}`)
      .addFields(
        { name: 'Diễn giải mạnh/yếu', value: clamp(n.strongText), inline: false },
        { name: 'Ngũ hành nhật chủ', value: `${n.dayElementText}\n${chart.analysis.strong ? n.dayElementExcess : n.dayElementWeak}`.slice(0, 1024), inline: false },
        { name: 'Thiên lệch', value: `${n.biasText}\n${n.favorableText}`.slice(0, 1024), inline: false },
        { name: 'Hành dư / hành thiếu', value: `• Dư khí: **${n.excessText}**\n• Khuyết lực: **${n.weakText}**`, inline: false },
        { name: 'Gợi ý cân bằng', value: clamp(n.strongModeText), inline: false },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle('Kết Cấu Nội Mệnh')
      .addFields(
        { name: 'Phân bố ngũ hành', value: formatElementCounts(counts), inline: true },
        { name: 'Âm dương', value: `• Âm: **${chart.analysis.yinYang.yin}**\n• Dương: **${chart.analysis.yinYang.yang}**\n• Nhận xét: ${n.yinYangText}`.slice(0, 1024), inline: true },
        { name: 'Thập thần quanh nhật chủ', value: clamp(tenGod.lines), inline: false },
        { name: 'Tàng can & thập thần ẩn', value: clamp(buildHiddenStemSummary(chart), 1024), inline: false },
        { name: 'Độ nổi của thập thần', value: clamp(tenGod.rankedText), inline: false },
        { name: `Điểm nhấn ${tenGod.focusTitle}`, value: clamp(tenGod.focusText), inline: false },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('Dụng Thần, Cách Cục Và Cửa Mở')
      .addFields(
        { name: 'Cách cục', value: `**${pattern.title}**\n${clamp(pattern.text)}`, inline: false },
        { name: 'Dụng / Hỷ / Kỵ', value: clamp(useful.lines), inline: false },
        { name: 'Luận dụng thần', value: clamp(useful.explanation), inline: false },
        { name: 'Định hướng nghề khí', value: clamp(`Hành chủ đạo nên mượn để mở đường là **${chart.analysis.usefulGods.dungThan[0]}**; ở tầng thực tế, khí này ${content.careerChannels?.[chart.analysis.usefulGods.dungThan[0]] || 'hợp đường cần đúng nhịp và đúng vai.'}`), inline: false },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('Trường Sinh 12 Vận Và Thần Sát')
      .addFields(
        { name: '12 vận của nhật chủ trên 4 chi', value: clamp(growth.lines), inline: false },
        { name: 'Nhận xét khí trưởng thành', value: clamp(growth.note), inline: false },
        { name: 'Giải nghĩa các vận nổi bật', value: clamp(growth.stageNotes), inline: false },
        { name: 'Thần sát đang lộ', value: clamp(buildShenShaSummary(chart), 1024), inline: false },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('Lưu Niên, Lưu Nguyệt Và Quan Hệ Nội Cục')
      .addFields(
        { name: `Lưu niên hiện hành — ${transit.year.pillar.label}`, value: clamp(`${content.transitNarratives?.year || ''}\n• ${transit.year.analysis.emoji} **${transit.year.analysis.tier}** (${transit.year.analysis.score}/100)\n${transit.year.analysis.reasons.map((x) => `• ${x}`).join('\n')}`), inline: false },
        { name: `Lưu nguyệt hiện hành — ${transit.month.pillar.label}`, value: clamp(`${content.transitNarratives?.month || ''}\n• ${transit.month.analysis.emoji} **${transit.month.analysis.tier}** (${transit.month.analysis.score}/100)\n${transit.month.analysis.reasons.map((x) => `• ${x}`).join('\n')}`), inline: false },
        { name: 'Quan hệ nội cục', value: clamp(buildRelationSummary(chart), 1024), inline: false },
        { name: 'Nguồn quy chiếu dữ liệu', value: clamp(`• ${sources.files['battu_month_stem_rules.json']}\n• ${sources.files['battu_hour_stem_rules.json']}\n• ${sources.files['battu_solar_terms.json']}\n• ${sources.files['battu_growth_stages.json']}\n• ${sources.files['battu_shensha.json']}\n• ${sources.files['battu_patterns.json']}`, 1024), inline: false },
      )
      .setFooter({ text: 'Đây là bản nền mệnh + lưu niên/lưu nguyệt hiện hành. Lưu nhật cụ thể xem tại -khivan theo giờ Việt Nam.' })
  );

  return embeds;
}

module.exports = { createBattuEmbeds };
