function flavorByTier(tier) {
  const map = {
    'Đại Cát': 'Linh cơ hanh thông, khí mạch tụ mà không tán, hợp phát động đại sự.',
    'Cát': 'Khí vận đang thuận, đẩy việc chính sẽ dễ thấy hồi âm.',
    'Bình': 'Khí mạch ổn định, hôm nay hợp giữ tiết tấu hơn là cưỡng cầu đột phá.',
    'Hung': 'Sát khí lẫn tạp niệm nổi lên, nên thu lời, chậm bước, kiểm tra kỹ.',
    'Đại Hung': 'Khí cục nghịch hành, đại sự nên hoãn, giữ thân và giữ tâm là thượng sách.',
  };
  return map[tier] || 'Khí vận trong ngày đang vận động.';
}

module.exports = { flavorByTier };
