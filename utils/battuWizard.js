const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { buildNatalChart } = require('./battuCore');
const { createBattuEmbeds } = require('./battuInterpret');
const { renderWizardIntro, renderWizardSummary } = require('./battuText');
const { setBattuProfile } = require('./battuProfile');

const sessions = new Map();
const TZ = 'Asia/Ho_Chi_Minh';
const HOUR_OPTIONS = [
  ['Tý thời', 23], ['Sửu thời', 1], ['Dần thời', 3], ['Mão thời', 5], ['Thìn thời', 7], ['Tỵ thời', 9],
  ['Ngọ thời', 11], ['Mùi thời', 13], ['Thân thời', 15], ['Dậu thời', 17], ['Tuất thời', 19], ['Hợi thời', 21],
];

function customId(type, userId) {
  return `battu:${type}:${userId}`;
}

function yearRow(userId) {
  const currentYear = new Date().getFullYear();
  const allYears = [];
  for (let y = currentYear; y >= 1940; y--) allYears.push(y);
  const chunks = [];
  for (let i = 0; i < allYears.length; i += 25) chunks.push(allYears.slice(i, i + 25));
  return chunks.map((chunk, idx) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId(`year${idx + 1}`, userId))
      .setPlaceholder(`Chọn năm sinh (${chunk.at(-1)} - ${chunk[0]})`)
      .addOptions(chunk.map((y) => ({ label: String(y), value: String(y) })));
    return new ActionRowBuilder().addComponents(menu);
  });
}

function monthRow(userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('month', userId))
    .setPlaceholder('Chọn tháng sinh')
    .addOptions(Array.from({ length: 12 }, (_, i) => ({ label: `Tháng ${i + 1}`, value: String(i + 1) })));
  return [new ActionRowBuilder().addComponents(menu)];
}

function dayRow(userId, year, month) {
  const days = new Date(year, month, 0).getDate();
  const menu1 = new StringSelectMenuBuilder()
    .setCustomId(customId('dayA', userId))
    .setPlaceholder('Chọn ngày sinh 1-25')
    .addOptions(Array.from({ length: Math.min(days, 25) }, (_, i) => ({ label: `Ngày ${i + 1}`, value: String(i + 1) })));
  const rows = [new ActionRowBuilder().addComponents(menu1)];
  if (days > 25) {
    const menu2 = new StringSelectMenuBuilder()
      .setCustomId(customId('dayB', userId))
      .setPlaceholder('Chọn ngày sinh 26-31')
      .addOptions(Array.from({ length: days - 25 }, (_, i) => ({ label: `Ngày ${i + 26}`, value: String(i + 26) })));
    rows.push(new ActionRowBuilder().addComponents(menu2));
  }
  return rows;
}

function hourRow(userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('hour', userId))
    .setPlaceholder('Chọn giờ sinh')
    .addOptions(HOUR_OPTIONS.map(([label, hour]) => ({ label: `${label} (${String(hour).padStart(2, '0')}:00)`, value: String(hour) })));
  return [new ActionRowBuilder().addComponents(menu)];
}

function confirmRows(userId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(customId('confirm', userId)).setLabel('Xác nhận').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(customId('restart', userId)).setLabel('Làm lại').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(customId('cancel', userId)).setLabel('Hủy').setStyle(ButtonStyle.Danger)
    )
  ];
}

async function startBattuWizard(user) {
  sessions.set(user.id, { step: 'year' });
  const dm = await user.createDM();
  await dm.send({ content: renderWizardIntro(), components: yearRow(user.id) });
  return dm;
}

function parseOwner(customIdValue) {
  const parts = String(customIdValue || '').split(':');
  return { type: parts[1], ownerId: parts[2] };
}

async function handleBattuInteraction(interaction) {
  const { type, ownerId } = parseOwner(interaction.customId);
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: '❌ Đây không phải mệnh bàn của ngươi.', ephemeral: true });
  }
  const state = sessions.get(ownerId) || { step: 'year' };

  if (interaction.isStringSelectMenu()) {
    const selected = interaction.values[0];
    if (type.startsWith('year')) {
      state.year = Number(selected);
      state.step = 'month';
      sessions.set(ownerId, state);
      return interaction.update({ content: `📅 Đã định năm sinh **${state.year}**. Hãy chọn tháng sinh.`, components: monthRow(ownerId) });
    }
    if (type === 'month') {
      state.month = Number(selected);
      state.step = 'day';
      sessions.set(ownerId, state);
      return interaction.update({ content: `📅 Năm **${state.year}**, tháng **${state.month}**. Hãy chọn ngày sinh.`, components: dayRow(ownerId, state.year, state.month) });
    }
    if (type === 'dayA' || type === 'dayB') {
      state.day = Number(selected);
      state.step = 'hour';
      sessions.set(ownerId, state);
      return interaction.update({ content: `📅 ${state.day}/${state.month}/${state.year} đã được định. Hãy chọn giờ sinh.`, components: hourRow(ownerId) });
    }
    if (type === 'hour') {
      state.hour = Number(selected);
      const matched = HOUR_OPTIONS.find((x) => x[1] === state.hour);
      state.hourLabel = matched ? `${matched[0]} (${String(state.hour).padStart(2, '0')}:00)` : `${state.hour}:00`;
      state.step = 'confirm';
      sessions.set(ownerId, state);
      return interaction.update({ content: renderWizardSummary(state), components: confirmRows(ownerId) });
    }
  }

  if (interaction.isButton()) {
    if (type === 'restart') {
      sessions.set(ownerId, { step: 'year' });
      return interaction.update({ content: renderWizardIntro(), components: yearRow(ownerId) });
    }
    if (type === 'cancel') {
      sessions.delete(ownerId);
      return interaction.update({ content: '❎ Đã hủy khai mệnh bàn.', components: [] });
    }
    if (type === 'confirm') {
      try {
        const chart = buildNatalChart({
          year: state.year,
          month: state.month,
          day: state.day,
          hour: state.hour,
          timezone: TZ,
        });
        const profile = {
          userId: ownerId,
          birth: chart.birth,
          solarBoundary: chart.solarBoundary,
          natalChart: chart,
          analysis: chart.analysis,
          meta: {
            timezone: TZ,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: 1,
          },
        };
        setBattuProfile(ownerId, profile);
        sessions.delete(ownerId);
        await interaction.update({ content: '✅ Đã lập mệnh bàn thành công. Ta gửi bản chi tiết ngay sau đây.', components: [] });
        const embeds = createBattuEmbeds(interaction.user, chart);
        for (const emb of embeds) {
          await interaction.followUp({ embeds: [emb] });
        }
      } catch (e) {
        return interaction.update({ content: `⚠️ Không thể lập mệnh bàn: ${e.message}`, components: [] });
      }
    }
  }
}

module.exports = {
  startBattuWizard,
  handleBattuInteraction,
  parseOwner,
};
