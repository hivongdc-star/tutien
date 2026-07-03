const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { buildNatalChart, BIRTH_YEAR_MIN, BIRTH_YEAR_MAX, CURRENT_BATTU_PROFILE_VERSION } = require('./battuCore');
const { createBattuEmbeds } = require('./battuInterpret');
const { renderWizardIntro, renderWizardSummary } = require('./battuText');
const { setBattuProfile } = require('./battuProfile');
const { getBirthPlacesByRegion, getBirthPlaceById, makeCustomBirthPlace, normalizeLongitude } = require('./battuBirthplace');

const sessions = new Map();
const TZ = 'Asia/Ho_Chi_Minh';
const REGION_LABELS = {
  north: 'Miền Bắc',
  central: 'Miền Trung/Tây Nguyên',
  south: 'Miền Nam',
};

function customId(type, userId) {
  return `battu:${type}:${userId}`;
}

function yearRow(userId) {
  const years = [];
  for (let y = BIRTH_YEAR_MAX; y >= BIRTH_YEAR_MIN; y--) years.push(y);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('year', userId))
    .setPlaceholder(`Chọn năm sinh (${BIRTH_YEAR_MIN} - ${BIRTH_YEAR_MAX})`)
    .addOptions(years.map((y) => ({ label: String(y), value: String(y) })));
  return [new ActionRowBuilder().addComponents(menu)];
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
    .setPlaceholder('Chọn giờ sinh theo giờ Việt Nam')
    .addOptions(Array.from({ length: 24 }, (_, hour) => {
      const h = String(hour).padStart(2, '0');
      return { label: `${h}:xx`, description: `Giờ đồng hồ Việt Nam từ ${h}:00 đến ${h}:59`, value: String(hour) };
    }));
  return [new ActionRowBuilder().addComponents(menu)];
}

function minuteRows(userId) {
  const ranges = [
    ['minuteA', 0, 24],
    ['minuteB', 25, 49],
    ['minuteC', 50, 59],
  ];
  return ranges.map(([id, start, end]) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId(id, userId))
      .setPlaceholder(`Chọn phút sinh ${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`)
      .addOptions(Array.from({ length: end - start + 1 }, (_, i) => {
        const minute = start + i;
        return { label: String(minute).padStart(2, '0'), value: String(minute) };
      }));
    return new ActionRowBuilder().addComponents(menu);
  });
}

function locationRows(userId) {
  const rows = [];
  for (const region of ['north', 'central', 'south']) {
    const places = getBirthPlacesByRegion(region);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId(`location_${region}`, userId))
      .setPlaceholder(`Chọn nơi sinh — ${REGION_LABELS[region]}`)
      .addOptions(places.map((p) => ({
        label: p.name,
        value: p.id,
        description: `Kinh độ tham chiếu ${p.longitude.toFixed(2)}°E`,
      })));
    if (region === 'south') {
      menu.addOptions({
        label: 'Nhập kinh độ thủ công',
        value: 'custom_longitude',
        description: 'Dùng nếu biết kinh độ nơi sinh chính xác hơn.',
      });
    }
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return rows;
}

function genderRow(userId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId('gender', userId))
    .setPlaceholder('Chọn giới tính để tính Đại vận')
    .addOptions(
      { label: 'Nam', value: 'male', description: 'Dùng cho quy tắc thuận/nghịch Đại vận.' },
      { label: 'Nữ', value: 'female', description: 'Dùng cho quy tắc thuận/nghịch Đại vận.' },
    );
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

async function askCustomLongitude(interaction, ownerId, state) {
  state.step = 'custom_longitude';
  sessions.set(ownerId, state);
  await interaction.update({
    content: [
      '📍 Hãy gửi **kinh độ nơi sinh** trong DM này, ví dụ: `105.8542` cho Hà Nội hoặc `106.6297` cho TP.HCM.',
      'Chỉ nhập số trong khoảng **102–110**. Bot sẽ chờ 2 phút.',
    ].join('\n'),
    components: [],
  });

  const collected = await interaction.channel.awaitMessages({
    filter: (m) => m.author.id === ownerId,
    max: 1,
    time: 120000,
    errors: ['time'],
  }).catch(() => null);

  const msg = collected?.first?.();
  const lon = normalizeLongitude(msg?.content?.trim());
  if (lon === null) {
    sessions.delete(ownerId);
    return interaction.followUp({ content: '❌ Kinh độ không hợp lệ hoặc đã hết thời gian chờ. Dùng `-battu` để lập lại.' });
  }

  const place = makeCustomBirthPlace(lon);
  state.birthPlace = place;
  state.longitude = place.longitude;
  state.step = 'gender';
  sessions.set(ownerId, state);
  return interaction.followUp({
    content: `📍 Đã nhận kinh độ **${place.longitude.toFixed(4)}°E**. Hãy chọn giới tính để tính Đại vận.`,
    components: genderRow(ownerId),
  });
}

async function startBattuWizard(user) {
  sessions.set(user.id, { step: 'year' });
  const dm = await user.createDM();
  await dm.send({ content: renderWizardIntro(BIRTH_YEAR_MIN, BIRTH_YEAR_MAX), components: yearRow(user.id) });
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
    if (type === 'year') {
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
      return interaction.update({ content: `📅 ${state.day}/${state.month}/${state.year} đã được định. Hãy chọn **giờ sinh theo giờ Việt Nam**.`, components: hourRow(ownerId) });
    }
    if (type === 'hour') {
      state.hour = Number(selected);
      state.step = 'minute';
      sessions.set(ownerId, state);
      return interaction.update({ content: `🕒 Đã định giờ **${String(state.hour).padStart(2, '0')}:xx**. Hãy chọn phút sinh.`, components: minuteRows(ownerId) });
    }
    if (type === 'minuteA' || type === 'minuteB' || type === 'minuteC') {
      state.minute = Number(selected);
      state.timeLabel = `${String(state.hour).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;
      state.step = 'location';
      sessions.set(ownerId, state);
      return interaction.update({
        content: '📍 Hãy chọn **nơi sinh tại Việt Nam** để hiệu chỉnh giờ mặt trời. Nếu biết kinh độ chính xác, chọn “Nhập kinh độ thủ công”.',
        components: locationRows(ownerId),
      });
    }
    if (type?.startsWith('location_')) {
      if (selected === 'custom_longitude') return askCustomLongitude(interaction, ownerId, state);
      const place = getBirthPlaceById(selected);
      if (!place) return interaction.reply({ content: '❌ Nơi sinh không hợp lệ.', ephemeral: true });
      state.birthPlace = place;
      state.longitude = place.longitude;
      state.step = 'gender';
      sessions.set(ownerId, state);
      return interaction.update({ content: `📍 Nơi sinh: **${place.name}** (${place.longitude.toFixed(2)}°E). Hãy chọn giới tính để tính Đại vận.`, components: genderRow(ownerId) });
    }
    if (type === 'gender') {
      state.gender = selected;
      state.genderLabel = selected === 'male' ? 'Nam' : 'Nữ';
      state.step = 'confirm';
      sessions.set(ownerId, state);
      return interaction.update({ content: renderWizardSummary(state), components: confirmRows(ownerId) });
    }
  }

  if (interaction.isButton()) {
    if (type === 'restart') {
      sessions.set(ownerId, { step: 'year' });
      return interaction.update({ content: renderWizardIntro(BIRTH_YEAR_MIN, BIRTH_YEAR_MAX), components: yearRow(ownerId) });
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
          minute: state.minute,
          timezone: TZ,
          birthPlace: state.birthPlace,
          longitude: state.longitude,
          gender: state.gender,
        });
        const profile = {
          userId: ownerId,
          birth: chart.birth,
          solarBoundary: chart.solarBoundary,
          natalChart: chart,
          analysis: chart.analysis,
          luck: chart.luck,
          meta: {
            timezone: TZ,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            version: CURRENT_BATTU_PROFILE_VERSION,
            engine: chart.meta.engine,
            birthYearSupport: { min: BIRTH_YEAR_MIN, max: BIRTH_YEAR_MAX },
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
