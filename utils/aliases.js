module.exports = {
  // Lệnh dành cho người chơi
  create: ["c", "crate"], // tạo nhân vật
  profile: ["p", "prof"], // xem hồ sơ
  reset: ["rs"], // reset lại nhân vật
  bio: ["b"], // đặt giới thiệu
  doiten: ["rename", "name"], // đổi tên
  danhhieu: ["title"], // đổi danh hiệu
  daily: ["dly"], // nhận thưởng hàng ngày
  shop: ["s"], // cửa hàng
  tieunhu: ["tn"], // gọi Tiểu Nhu
  thachdau: ["td"], // thách đấu
  acp: ["accept"], // chấp nhận thách đấu
  deny: ["d"], // từ chối thách đấu
  cancel: ["cxl"], // hủy thách đấu hoặc hành động
  help: ["h"], // hướng dẫn

  // Lệnh cờ bạc
  taixiu: ["tx"], // tài xỉu
  flip: ["coin"], // tung xu
  slot: ["quay"], // slot machine
  lottery: ["loto", "xs"], // xổ số

  // Lệnh quản trị (Admin/Owner)
  xoa: ["delete", "del"], // xóa nhân vật
  addxp: ["axp"], // cộng EXP
  addlt: ["alt"], // cộng Linh Thạch
  fixdata: ["fix"], // sửa dữ liệu
  reload: ["rl"], // reload command
  update: ["up"], // update bot
};
