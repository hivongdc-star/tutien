const HEXAGRAM_NAMES = {
  1: 'Thuần Càn',
  2: 'Thuần Khôn',
  3: 'Thủy Lôi Truân',
  4: 'Sơn Thủy Mông',
  5: 'Thủy Thiên Nhu',
  6: 'Thiên Thủy Tụng',
  7: 'Địa Thủy Sư',
  8: 'Thủy Địa Tỷ',
  9: 'Phong Thiên Tiểu Súc',
  10: 'Thiên Trạch Lý',
  11: 'Địa Thiên Thái',
  12: 'Thiên Địa Bĩ',
  13: 'Thiên Hỏa Đồng Nhân',
  14: 'Hỏa Thiên Đại Hữu',
  15: 'Địa Sơn Khiêm',
  16: 'Lôi Địa Dự',
  17: 'Trạch Lôi Tùy',
  18: 'Sơn Phong Cổ',
  19: 'Địa Trạch Lâm',
  20: 'Phong Địa Quán',
  21: 'Hỏa Lôi Phệ Hạp',
  22: 'Sơn Hỏa Bí',
  23: 'Sơn Địa Bác',
  24: 'Địa Lôi Phục',
  25: 'Thiên Lôi Vô Vọng',
  26: 'Sơn Thiên Đại Súc',
  27: 'Sơn Lôi Di',
  28: 'Trạch Phong Đại Quá',
  29: 'Thuần Khảm',
  30: 'Thuần Ly',
  31: 'Trạch Sơn Hàm',
  32: 'Lôi Phong Hằng',
  33: 'Thiên Sơn Độn',
  34: 'Lôi Thiên Đại Tráng',
  35: 'Hỏa Địa Tấn',
  36: 'Địa Hỏa Minh Di',
  37: 'Phong Hỏa Gia Nhân',
  38: 'Hỏa Trạch Khuê',
  39: 'Thủy Sơn Kiển',
  40: 'Lôi Thủy Giải',
  41: 'Sơn Trạch Tổn',
  42: 'Phong Lôi Ích',
  43: 'Trạch Thiên Quải',
  44: 'Thiên Phong Cấu',
  45: 'Trạch Địa Tụy',
  46: 'Địa Phong Thăng',
  47: 'Trạch Thủy Khốn',
  48: 'Thủy Phong Tỉnh',
  49: 'Trạch Hỏa Cách',
  50: 'Hỏa Phong Đỉnh',
  51: 'Thuần Chấn',
  52: 'Thuần Cấn',
  53: 'Phong Sơn Tiệm',
  54: 'Lôi Trạch Quy Muội',
  55: 'Lôi Hỏa Phong',
  56: 'Hỏa Sơn Lữ',
  57: 'Thuần Tốn',
  58: 'Thuần Đoài',
  59: 'Phong Thủy Hoán',
  60: 'Thủy Trạch Tiết',
  61: 'Phong Trạch Trung Phu',
  62: 'Lôi Sơn Tiểu Quá',
  63: 'Thủy Hỏa Ký Tế',
  64: 'Hỏa Thủy Vị Tế',
};

const TRIGRAM_SYMBOLS = {
  'Càn': '☰',
  'Đoài': '☱',
  'Ly': '☲',
  'Chấn': '☳',
  'Tốn': '☴',
  'Khảm': '☵',
  'Cấn': '☶',
  'Khôn': '☷',
};

function flavorByTier(tier) {
  const map = {
    'Đại Cát': 'Khí vận hanh thông, hợp tiến việc quan trọng.',
    'Cát': 'Khí vận đang thuận, có thể tiến nhưng vẫn nên giữ nhịp.',
    'Tiểu Cát': 'Có lợi nhẹ, hợp xử lý việc vừa sức.',
    'Bình': 'Khí vận ổn định, nên giữ thế cân bằng.',
    'Tiểu Hung': 'Khí vận hơi lệch, nên chậm lại một nhịp.',
    'Hung': 'Khí vận bất lợi, nên tránh việc lớn.',
    'Đại Hung': 'Khí vận nghịch rõ, nên thủ hơn là công.',
  };
  return map[tier] || 'Khí vận trong ngày đang vận động.';
}

function hexFullName(hex) {
  if (!hex) return 'Quẻ vô danh';
  return HEXAGRAM_NAMES[hex.no] || hex.fullName || hex.vn || 'Quẻ vô danh';
}

function hexInlineSymbol(hex) {
  if (!hex) return '☯';
  const upper = TRIGRAM_SYMBOLS[hex.upper] || '';
  const lower = TRIGRAM_SYMBOLS[hex.lower] || '';
  return `${upper}${lower}`.trim() || hex.symbol || '☯';
}

function compactJudgment(text) {
  if (!text) return 'Khí quẻ thiên về giữ nhịp và xử việc đúng thời.';
  let out = String(text)
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*/g, '; ')
    .replace(/;+\s*;/g, '; ')
    .trim();
  if (out.length > 96) {
    const cut = out.slice(0, 96);
    out = `${cut.replace(/[;,:\-\s]+$/g, '')}.`;
  }
  return out;
}

function normalizePhrase(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function oneLineAction(guide, tier) {
  const good = (guide?.should || []).filter(Boolean).slice(0, 2).map(normalizePhrase).join(' và ');
  const bad = (guide?.avoid || []).filter(Boolean).slice(0, 2).map(normalizePhrase).join(' hoặc ');
  const fallback = {
    'Đại Cát': 'Nên tiến việc chính; không nên chần chừ quá lâu.',
    'Cát': 'Nên giữ nhịp ổn định và xử lý việc quan trọng; không nên nóng vội.',
    'Tiểu Cát': 'Nên làm việc vừa sức; không nên ôm quá nhiều việc một lúc.',
    'Bình': 'Nên giữ thế cân bằng; không nên đổi hướng đột ngột.',
    'Tiểu Hung': 'Nên chậm lại để quan sát; không nên ép tiến độ.',
    'Hung': 'Nên lo việc cần thiết trước; không nên quyết việc lớn.',
    'Đại Hung': 'Nên thủ và giữ sức; không nên mạo hiểm hoặc tranh hơn thua.',
  };
  if (!good && !bad) return fallback[tier] || 'Nên giữ nhịp ổn định; không nên hấp tấp.';
  if (!good) return `Nên giữ nhịp ổn định; không nên ${bad}.`;
  if (!bad) return `Nên ${good}; không nên hấp tấp.`;
  return `Nên ${good}; không nên ${bad}.`;
}

module.exports = {
  flavorByTier,
  hexFullName,
  hexInlineSymbol,
  compactJudgment,
  oneLineAction,
};
