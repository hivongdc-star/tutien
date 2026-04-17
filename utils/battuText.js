function renderWizardIntro() {
  return [
    '🧭 **Khai Mệnh Bàn Bát Tự**',
    '',
    'Ta sẽ dẫn ngươi lập mệnh bàn theo **4 trụ: năm, tháng, ngày, giờ**.',
    'Múi giờ mặc định của hệ thống là **Asia/Ho_Chi_Minh**.',
    '',
    'Hãy chọn lần lượt: **năm sinh → tháng sinh → ngày sinh → giờ sinh**.',
  ].join('\n');
}

function renderWizardSummary(state) {
  return [
    '📜 **Xác nhận thông tin sinh thần**',
    `• Năm sinh: **${state.year}**`,
    `• Tháng sinh: **${state.month}**`,
    `• Ngày sinh: **${state.day}**`,
    `• Giờ sinh: **${state.hourLabel}**`,
    `• Múi giờ: **Asia/Ho_Chi_Minh**`,
    '',
    'Nếu đúng, bấm **Xác nhận** để lập mệnh bàn.',
  ].join('\n');
}

module.exports = {
  renderWizardIntro,
  renderWizardSummary,
};
