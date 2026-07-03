const { getTrueSolarTimeParts } = require('./battuCalendar');

function renderWizardIntro(minYear = 1995, maxYear = 2015) {
  return [
    '🧭 **Khai Mệnh Bàn Bát Tự**',
    '',
    'Bot sẽ lập mệnh bàn theo **4 trụ: năm, tháng, ngày, giờ**.',
    'Múi giờ nhập liệu: **giờ Việt Nam — Asia/Ho_Chi_Minh**.',
    'Trụ ngày/giờ sẽ được hiệu chỉnh theo **giờ mặt trời tại nơi sinh**.',
    `Hệ hiện hỗ trợ ngày sinh dương lịch từ **${minYear}** đến **${maxYear}**.`,
    '',
    'Hãy chọn lần lượt: **năm → tháng → ngày → giờ → phút → nơi sinh → giới tính**.',
  ].join('\n');
}

function formatSolarPreview(state) {
  if (!state?.longitude) return 'Chưa có';
  try {
    const solar = getTrueSolarTimeParts({
      year: state.year,
      month: state.month,
      day: state.day,
      hour: state.hour,
      minute: state.minute,
    }, state.longitude);
    const sign = solar.offsetMinutes >= 0 ? '+' : '';
    return `${String(solar.day).padStart(2, '0')}/${String(solar.month).padStart(2, '0')}/${solar.year} ${String(solar.hour).padStart(2, '0')}:${String(solar.minute).padStart(2, '0')} (${sign}${solar.offsetMinutes.toFixed(1)} phút)`;
  } catch (_) {
    return 'Không tính được';
  }
}

function renderWizardSummary(state) {
  const timeLabel = state.timeLabel || `${String(state.hour).padStart(2, '0')}:${String(state.minute || 0).padStart(2, '0')}`;
  const place = state.birthPlace ? `${state.birthPlace.name} (${Number(state.longitude).toFixed(4)}°E)` : 'Chưa có';
  return [
    '📜 **Xác nhận thông tin sinh thần**',
    `• Ngày sinh dương lịch: **${String(state.day).padStart(2, '0')}/${String(state.month).padStart(2, '0')}/${state.year}**`,
    `• Giờ đồng hồ Việt Nam: **${timeLabel}**`,
    `• Nơi sinh: **${place}**`,
    `• Giới tính tính Đại vận: **${state.genderLabel || 'Chưa có'}**`,
    `• Giờ mặt trời dự kiến: **${formatSolarPreview(state)}**`,
    `• Múi giờ gốc: **Asia/Ho_Chi_Minh**`,
    '',
    'Nếu đúng, bấm **Xác nhận** để lập mệnh bàn.',
  ].join('\n');
}

module.exports = {
  renderWizardIntro,
  renderWizardSummary,
};
