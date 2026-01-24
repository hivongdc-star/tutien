// utils/titleUtils.js
// Mốc mặc định. Bạn chỉnh theo ý.
const DAO_DUYEN_THRESHOLDS = [
  { value: 5_000,  id: "Tinh_Huu_Nghi" },
  { value:10_000,  id: "Tam_Dau_Hop" },
  { value:50_000,  id: "Song_Tam_Dong_Menh" },
  { value:100_000, id: "Dao_Lu_Song_Tu" }
];
const RING_TITLES = {
  ring_huyet_nguyet: "Song_Tam_Dong_Menh",
  ring_tien_dao: "Dao_Lu_Song_Tu",
  ring_chi_ton: "Thien_Dia_Chung_Giam"
};

const { loadUsers, saveUsers } = require("./storage");
const { getDaoDuyen } = require("./relaUtils");

function grant(user, titleId){
  user.titles = user.titles||[];
  if (!user.titles.includes(titleId)) user.titles.push(titleId);
}

function checkAndGrantTitles(a,b,{ ringId, daoDuyenAdded }={}){
  const users = loadUsers();
  const ua = users[a]; const ub = users[b];
  if (!ua || !ub) return [];

  // Ring
  if (ringId && RING_TITLES[ringId]) { grant(ua, RING_TITLES[ringId]); grant(ub, RING_TITLES[ringId]); }

  // Đạo duyên
  const dd = getDaoDuyen(a,b);
  for (const t of DAO_DUYEN_THRESHOLDS) {
    if (dd>=t.value){ grant(ua,t.id); grant(ub,t.id); }
  }

  saveUsers(users);
  return ua.titles;
}

module.exports = { checkAndGrantTitles };
