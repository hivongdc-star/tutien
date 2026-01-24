// shop/shopUtils.js
const fs=require("fs"); const path=require("path");
const { loadUsers, saveUsers } = require("../utils/storage");
const itemsPath = path.join(__dirname,"items.json");
function loadItems(){ return JSON.parse(fs.readFileSync(itemsPath,"utf8")); }
function listItems(){ return loadItems(); }

function ensureUserShape(user){
  user.inventory=user.inventory||{};
  user.equipments=user.equipments||{};
  user.titles=user.titles||[];
  user.relationships=user.relationships||{ partners:{} };
  return user;
}

function buyItem(buyerId,itemId){
  const users=loadUsers(); const catalog=loadItems();
  const buyer=ensureUserShape(users[buyerId]||null);
  if (!buyer) return { ok:false, message:"❌ Bạn chưa có nhân vật." };
  const it=catalog[itemId]; if (!it) return { ok:false, message:"❌ Mặt hàng không tồn tại." };
  const price = Number(it.price||0); if (!Number.isFinite(price) || price<0) return { ok:false, message:"❌ Giá không hợp lệ." };
  if ((buyer.lt||0) < price) return { ok:false, message:"❌ Không đủ LT." };
  buyer.lt -= price;
  buyer.inventory[itemId] = (buyer.inventory[itemId]||0)+1;
  users[buyerId]=buyer; saveUsers(users);
  return { ok:true, message:`✅ Đã mua **${it.emoji||""} ${it.name}** với giá **${price} LT**.` };
}

module.exports={ listItems, buyItem };
