const { EmbedBuilder } = require('discord.js');
const { loadBattuData } = require('./battuData');
const {
  detectRelations,
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


function pillarDisplay(pillar) {
  return `${pillar.stem.han}${pillar.branch.han} ${pillar.stem.name} ${pillar.branch.name}`;
}

function summarizeElementBias(counts) {
  const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    dominant: arr[0]?.[0] || '—',
    second: arr[1]?.[0] || '—',
    weakest: arr[arr.length - 1]?.[0] || '—',
  };
}

function strengthTier(score) {
  if (score >= 85) return 'rất vượng';
  if (score >= 70) return 'khá vượng';
  if (score >= 55) return 'quân bình thiên vượng';
  if (score >= 45) return 'quân bình';
  if (score >= 30) return 'hơi nhược';
  return 'khá nhược';
}

function balanceTier(score) {
  if (score >= 85) return 'rất cân';
  if (score >= 70) return 'khá cân';
  if (score >= 55) return 'có lệch nhẹ';
  if (score >= 40) return 'lệch vừa';
  return 'lệch rõ';
}

function yinYangText(yinYang) {
  const diff = Math.abs((yinYang?.yang || 0) - (yinYang?.yin || 0));
  if (diff <= 1) return 'Âm dương khá cân, nên khí trong mệnh dễ giữ nhịp ổn định.';
  if ((yinYang?.yang || 0) > (yinYang?.yin || 0)) {
    return 'Dương khí nổi hơn, nên mệnh này dễ chủ động, quyết nhanh và thích tự mở đường. Điểm cần giữ là đừng nóng tay quá sớm.';
  }
  return 'Âm khí nổi hơn, nên mệnh này thiên về cảm nhận, suy nghĩ sâu và chọn thời mà đi. Điểm cần giữ là đừng chần chừ quá lâu.';
}

function buildBirthSummary(chart) {
  return [
    `• **Niên trụ:** ${pillarDisplay(chart.year)}`,
    `• **Nguyệt trụ:** ${pillarDisplay(chart.month)}`,
    `• **Nhật trụ:** ${pillarDisplay(chart.day)}`,
    `• **Thời trụ:** ${pillarDisplay(chart.hour)}`,
  ].join('\n');
}

function buildDayMasterStory(chart) {
  const { content } = loadBattuData();
  const dmCfg = content.dayMasters?.[chart.dayMaster.name] || {};
  const strength = chart.analysis.strong ? dmCfg.strong : dmCfg.weak;
  const portrait = dmCfg.portrait || `Nhật chủ ${chart.dayMaster.name} thiên về cách sống hợp với khí ${chart.dayMaster.element}.`;
  return `${portrait}\n\n${strength || 'Nhật chủ này phát huy tốt khi đi đúng nhịp của mình, không nên ép mình vào khuôn quá cứng.'}`;
}

function buildElementStory(chart) {
  const bias = summarizeElementBias(chart.analysis.elementCounts);
  const useful = chart.analysis.usefulGods || { dungThan: [], hyThan: [], kyThan: [], nhanThan: [] };
  const strongness = strengthTier(chart.analysis.strengthScore);
  const balance = balanceTier(chart.analysis.balanceScore);
  const weakText = chart.analysis.weakElements.length ? chart.analysis.weakElements.join(', ') : 'chưa có hành nào hụt quá rõ';
  const excessText = chart.analysis.excessElements.length ? chart.analysis.excessElements.join(', ') : 'chưa có hành nào dư quá mạnh';

  return [
    `Ngũ hành trong mệnh nghiêng rõ về **${bias.dominant}** và **${bias.second}**, còn phần yếu hơn nằm ở **${bias.weakest}**. Điều này cho thấy cách bạn vận hành tự nhiên có trọng tâm rõ: mạnh ở chỗ nào thì đi rất nhanh, nhưng phần yếu lại cần được bồi dần chứ không thể ép ngay.`,
    `Sức mệnh hiện ở mức **${strongness}** (${chart.analysis.strengthScore}/100), còn độ cân bằng tổng thể ở mức **${balance}** (${chart.analysis.balanceScore}/100). Nói dễ hiểu hơn: đây không phải lá số mỏng lực, nhưng nếu đi sai nhịp thì vẫn dễ bị lệch về một phía.`,
    `Phần đang dư trong mệnh là **${excessText}**; phần đang thiếu là **${weakText}**. Vì vậy, khi chọn môi trường sống, cách học hay cách làm việc, bạn hợp nhất với những yếu tố giúp mệnh bớt gắt và trở nên có nhịp hơn.`,
    `**Dụng thần** nên ưu tiên là **${useful.dungThan.join(' / ') || 'chưa nổi rõ'}**. **Hỷ thần** là **${useful.hyThan.join(' / ') || 'chưa nổi rõ'}**. **Kỵ thần** là **${useful.kyThan.join(' / ') || 'chưa nổi rõ'}**. **Nhàn thần** là **${useful.nhanThan.join(' / ') || 'không đáng kể'}**.`,
  ].join('\n\n');
}

function buildUsefulGodStory(chart) {
  const useful = chart.analysis.usefulGods || {};
  const dung = useful.dungThan?.join(' / ') || 'chưa nổi rõ';
  const hy = useful.hyThan?.join(' / ') || 'chưa nổi rõ';
  const ky = useful.kyThan?.join(' / ') || 'chưa nổi rõ';
  const nhan = useful.nhanThan?.join(' / ') || 'không đáng kể';
  return [
    `Yếu tố nên mượn để mở vận trước tiên là **${dung}**. Đây là phần khí giúp mệnh của bạn vào nhịp, bớt lệch và dễ phát huy đúng chỗ.`,
    `Yếu tố đi cùng để tăng độ thuận là **${hy}**. Khi môi trường sống, công việc hoặc cách hành động chạm được vào nhóm khí này, bạn thường thấy mình đỡ hao lực hơn.`,
    `Yếu tố nên tiết chế là **${ky}**. Gặp quá nhiều khí này, bạn dễ rơi vào trạng thái gắng quá tay hoặc tự kéo mình lệch nhịp.`,
    `**Nhàn thần** là **${nhan}**. Đây là phần khí không quyết định thắng thua ngay, nhưng cũng cho biết nơi nào trong đời có thể để tự nhiên hơn mà không cần cưỡng ép.`,
  ].join(' ');
}

function buildTenGodStory(chart) {
  const top = chart.analysis.tenGodInfluence?.top;
  const second = chart.analysis.tenGodInfluence?.second;
  if (!top) return 'Thập thần trong lá số không lộ thiên lệch quá mạnh, nên mệnh này đi theo kiểu cân bằng dần qua trải nghiệm.';

  const pieces = [
    `**${top.name}** là khí nổi nhất trong lá số. Điều này cho thấy nét vận hành rõ nhất của bạn là: ${top.profile?.core || 'có một trục hành động rất rõ trong nội tâm.'}`,
    top.profile?.bright ? `Điểm mạnh của khí này là ${top.profile.bright.toLowerCase()}` : null,
    top.profile?.shadow ? `Điểm cần giữ là ${top.profile.shadow.toLowerCase()}` : null,
    second?.name && second?.profile?.core ? `Khí đi cùng đáng chú ý là **${second.name}**. Nó bổ sung cho lá số theo hướng: ${second.profile.core.toLowerCase()}` : null,
  ].filter(Boolean);

  return pieces.join('. ') + '.';
}

function buildHiddenStemStory(chart) {
  const details = getHiddenStemDetails(chart);
  const lines = details.map((pillar) => {
    const names = pillar.hidden.map((x) => `${x.name} (${x.tenGod})`);
    return `• **${pillar.position} chi ${pillar.branch}** ẩn ${names.join(', ') || 'không lộ rõ'}`;
  });

  return [
    'Tàng can là phần khí ẩn nằm trong địa chi. Đây là phần không lộ ngay ra ngoài, nhưng lại ảnh hưởng rất mạnh đến cách mệnh vận hành khi gặp thời.',
    lines.join('\n'),
  ].join('\n\n');
}

function buildPatternStory(chart) {
  const p = chart.analysis.pattern || {};
  return [
    `Lá số hiện thiên về **${p.label || 'một cục hỗn hợp'}**.`,
    p.description || 'Nói đơn giản, đây là kiểu mệnh có một trục phát huy khá rõ chứ không tản đều mọi phía.',
    p.synergy || 'Muốn đi xa, lá số này cần chọn đúng cửa phát lực thay vì làm mọi thứ cùng lúc.',
  ].filter(Boolean).join(' ');
}

function buildGrowthStory(chart) {
  const stages = chart.analysis.growthStages || {};
  const lines = [
    `• **Niên chi ${chart.year.branch.name}** ở thế **${stages.year}**`,
    `• **Nguyệt chi ${chart.month.branch.name}** ở thế **${stages.month}**`,
    `• **Nhật chi ${chart.day.branch.name}** ở thế **${stages.day}**`,
    `• **Thời chi ${chart.hour.branch.name}** ở thế **${stages.hour}**`,
  ].join('\n');

  return `${summarizeStagePattern(stages)}\n\n${lines}`;
}

function buildShenShaStory(chart) {
  const active = (chart.analysis.shenSha || []).slice(0, 4);
  if (!active.length) return 'Phần thần sát trong lá số không lộ dấu hiệu quá mạnh ở bộ cơ bản, nên mệnh này vẫn nên đọc theo trục chính của tứ trụ hơn là bám vào tín hiệu phụ.';
  return active.map((x) => `• **${x.name}**: ${x.desc}`).join('\n');
}

function buildRelationStory(chart) {
  const rel = detectRelations(chart);
  const chunks = [];
  if (rel.canCombos.length || rel.chiLucHop.length || rel.tamHop.length || rel.tamHoi.length || (rel.banHop || []).length) {
    chunks.push('Trong nội cục có lực hòa và lực nâng đỡ nhất định, nghĩa là khi giữ đúng nhịp thì lá số này tự gom lại khá nhanh, không dễ tan lực hoàn toàn.');
  }
  if (rel.chiXung.length || rel.chiHai.length || rel.chiPha.length || rel.chiHinh.length) {
    chunks.push('Đồng thời cũng có những thế va chạm nội tại, nên có lúc suy nghĩ và hành động của bạn không đi cùng một hướng. Khi áp lực tăng, bạn càng cần môi trường ổn định để tránh tự kéo mình lệch nhịp.');
  }
  if (!chunks.length) {
    chunks.push('Nội cục không lộ hợp xung quá gắt ở tầng cơ bản, nên lá số này thắng ở chỗ đi bền và chỉnh nhịp đều hơn là đánh đổi bằng những cú bứt quá mạnh.');
  }

  const notable = [];
  if (rel.tamHop[0]) notable.push(`• Có **tam hợp ${rel.tamHop[0].group.join('-')}**, cho thấy một phần khí trong mệnh có khả năng tự nối thành dòng khi gặp đúng thời.`);
  if (rel.tamHoi[0]) notable.push(`• Có **tam hội ${rel.tamHoi[0].group.join('-')}**, nghĩa là khí cùng nhóm rất dễ nổi lên thành xu hướng rõ.`);
  if (rel.chiLucHop[0]) notable.push(`• Có **lục hợp ${rel.chiLucHop[0].pair.join('-')}**, nên vài mặt trong đời dễ được người hoặc hoàn cảnh hỗ trợ đúng lúc.`);
  if (rel.chiXung[0]) notable.push(`• Có **xung ${rel.chiXung[0].pair.join('-')}**, báo hiệu những giai đoạn phải đổi hướng, dịch chuyển hoặc tự chỉnh lại trật tự cũ.`);
  if (rel.chiHai[0]) notable.push(`• Có **hại ${rel.chiHai[0].pair.join('-')}**, nên khi cảm xúc rối hoặc môi trường nhiễu, bạn dễ thấy việc đang ổn bỗng thành khó thông.`);

  return [chunks.join(' '), notable.join('\n')].filter(Boolean).join('\n\n');
}

function transitBaseSentence(type, tier, relStem) {
  const period = type === 'year' ? 'Lưu niên' : 'Lưu nguyệt';
  const tierLead = {
    'Đại Cát': `${period} hiện tại đang mở vận rất rõ, hợp tiến việc quan trọng nếu đã có nền sẵn.`,
    'Cát': `${period} hiện tại khá thuận, hợp đẩy việc chính nhưng vẫn cần giữ tiết tấu.`,
    'Tiểu Cát': `${period} hiện tại có lợi nhẹ, hợp chỉnh việc và tiến từng bước.`,
    'Bình': `${period} hiện tại thiên về giữ nhịp và làm chắc hơn là bứt mạnh.`,
    'Tiểu Hung': `${period} hiện tại hơi lệch, nên cẩn thận với quyết định nóng.`,
    'Hung': `${period} hiện tại có lực cản rõ, hợp thủ hơn công.`,
    'Đại Hung': `${period} hiện tại nghịch khí khá mạnh, đại sự nên lùi một nhịp.`,
  };
  const relationLead = {
    same: 'Khí đang đồng hành với bản mệnh, nên sức tự thân mạnh lên nhưng cũng dễ quá tay.',
    generatedBy: 'Khí đang nâng đỡ bản mệnh, nên nhiều việc sẽ vào tay hơn nếu đi đúng nhịp.',
    generates: 'Khí buộc bản mệnh phải xuất lực ra ngoài, hợp làm việc nhưng không hợp ôm quá nhiều.',
    controlledBy: 'Khí đang ép bản mệnh vào khuôn, hợp việc cần kỷ luật và chuẩn hóa.',
    controls: 'Khí đang nằm dưới tay bản mệnh, hợp chủ động xử lý nhưng không hợp cứng quá mức.',
  };
  return `${tierLead[tier] || `${period} hiện tại đang vận động theo nhịp riêng.`} ${relationLead[relStem] || ''}`.trim();
}

function buildTransitSummary(chart) {
  const now = getVietnamNowParts();
  const yearPillar = calcYearPillar(now.year, now.month, now.day, now.hour);
  const monthPillar = calcMonthPillar(now.year, now.month, now.day, now.hour, yearPillar.stem.name).pillar;
  const yearHit = analyzeTransitAgainstNatal(chart, yearPillar, 'year');
  const monthHit = analyzeTransitAgainstNatal(chart, monthPillar, 'month');
  return {
    year: { pillar: yearPillar, analysis: yearHit },
    month: { pillar: monthPillar, analysis: monthHit },
  };
}

function buildTransitStory(type, hit) {
  const periodTitle = type === 'year' ? 'Lưu niên' : 'Lưu nguyệt';
  const movement = type === 'year'
    ? 'Đây là lớp khí của cả năm, thường định hình bối cảnh lớn và áp lực chung.'
    : 'Đây là lớp khí gần hơn, thường cho biết giai đoạn hiện tại nên phát hay nên thu.';
  const line = transitBaseSentence(type, hit.analysis.tier, hit.analysis.relStem);
  return [
    `${periodTitle} hiện hành là **${pillarDisplay(hit.pillar)}**. ${movement}`,
    `${line} Mức vận hiện tại ở ngưỡng **${hit.analysis.tier}** (${hit.analysis.score}/100).`,
  ].join(' ');
}

function createBattuEmbeds(user, chart) {
  if (!chart.analysis?.usefulGods || !chart.analysis?.pattern || !chart.analysis?.growthStages) enrichAnalysis(chart);
  const embeds = [];
  const transit = buildTransitSummary(chart);

  embeds.push(
    new EmbedBuilder()
      .setColor(0x6C5CE7)
      .setTitle('Mệnh Bàn Bát Tự')
      .setDescription(
        `**${user.username}** — mệnh bàn lấy theo múi giờ **${chart.birth.timezone}**\n` +
        `Sinh thời: **${String(chart.birth.day).padStart(2, '0')}/${String(chart.birth.month).padStart(2, '0')}/${chart.birth.year} ${chart.birth.hourRange}**\n\n` +
        buildBirthSummary(chart)
      )
      .addFields(
        {
          name: 'Nhật chủ',
          value: clamp(`**${chart.dayMaster.han} ${chart.dayMaster.name}** — ${chart.dayMaster.element} ${chart.dayMaster.polarity}\n\n${buildDayMasterStory(chart)}`),
          inline: false,
        },
        {
          name: 'Tiết khí quy chiếu',
          value: clamp(`Tháng trong mệnh được tính từ **${chart.solarBoundary.name}** (${String(chart.solarBoundary.day).padStart(2, '0')}/${String(chart.solarBoundary.month).padStart(2, '0')} ${String(chart.solarBoundary.hour).padStart(2, '0')}:${String(chart.solarBoundary.minute).padStart(2, '0')}). Vì vậy, **nguyệt trụ** của lá số là **${pillarDisplay(chart.month)}**.`),
          inline: false,
        },
      )
      .setFooter({ text: 'Trụ tháng lấy theo tiết khí. Mốc Lập Xuân dùng để phân niên trụ.' })
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0x00A86B)
      .setTitle('Ngũ Hành Và Sức Mệnh')
      .addFields(
        {
          name: 'Ngũ hành trong mệnh',
          value: clamp(buildElementStory(chart)),
          inline: false,
        },
        {
          name: 'Âm dương trong mệnh',
          value: clamp(`Âm: **${chart.analysis.yinYang.yin}** • Dương: **${chart.analysis.yinYang.yang}**\n\n${yinYangText(chart.analysis.yinYang)}`),
          inline: false,
        },
        {
          name: 'Dụng thần, hỷ thần, kỵ thần và nhàn thần',
          value: clamp(buildUsefulGodStory(chart)),
          inline: false,
        },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle('Thập Thần, Tàng Can Và Cách Cục')
      .addFields(
        {
          name: 'Thập thần nổi bật',
          value: clamp(buildTenGodStory(chart)),
          inline: false,
        },
        {
          name: 'Tàng can trong bốn trụ',
          value: clamp(buildHiddenStemStory(chart)),
          inline: false,
        },
        {
          name: 'Cách cục của lá số',
          value: clamp(buildPatternStory(chart)),
          inline: false,
        },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('Trường Sinh Và Thần Sát')
      .addFields(
        {
          name: 'Trường sinh của bốn chi',
          value: clamp(buildGrowthStory(chart)),
          inline: false,
        },
        {
          name: 'Thần sát đang lộ',
          value: clamp(buildShenShaStory(chart)),
          inline: false,
        },
      )
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('Lưu Niên, Lưu Nguyệt Và Quan Hệ Nội Cục')
      .addFields(
        {
          name: 'Lưu niên hiện tại',
          value: clamp(buildTransitStory('year', transit.year)),
          inline: false,
        },
        {
          name: 'Lưu nguyệt hiện tại',
          value: clamp(buildTransitStory('month', transit.month)),
          inline: false,
        },
        {
          name: 'Quan hệ nội cục',
          value: clamp(buildRelationStory(chart)),
          inline: false,
        },
      )
      .setFooter({ text: 'Đây là bản nền mệnh. Khí vận từng ngày xem tại -khivan theo giờ Việt Nam.' })
  );

  return embeds;
}

module.exports = { createBattuEmbeds };
