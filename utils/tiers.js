// utils/tiers.js
// Chuẩn hoá phẩm giai dùng chung cho Khoáng thạch / Trang bị.

const TIERS = ["pham", "linh", "hoang", "huyen", "dia", "thien", "tien", "than"];

const TIER_META = {
  pham:  { label: "Phàm",  icon: "⚪", color: 0x9AA0A6 },
  linh:  { label: "Linh",  icon: "🟢", color: 0x2ECC71 },
  hoang: { label: "Hoàng", icon: "🟠", color: 0xE67E22 },
  huyen: { label: "Huyền", icon: "🔵", color: 0x3498DB },
  dia:   { label: "Địa",   icon: "🟣", color: 0x9B59B6 },
  thien: { label: "Thiên", icon: "🟨", color: 0xF1C40F },
  tien:  { label: "Tiên",  icon: "🔴", color: 0xE74C3C },
  than:  { label: "Thần",  icon: "⚫", color: 0x2C3E50 },
};

function tierMeta(tier) {
  return TIER_META[tier] || TIER_META.pham;
}

function tierText(tier) {
  const m = tierMeta(tier);
  return `${m.icon} ${m.label} Phẩm`;
}

module.exports = {
  TIERS,
  TIER_META,
  tierMeta,
  tierText,
};
