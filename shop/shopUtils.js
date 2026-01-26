// shop/shopUtils.js
const fs=require("fs"); const path=require("path");
const { loadUsers, saveUsers } = require("../utils/storage");
const itemsPath = path.join(__dirname,"items.json");
function loadItems(){ return JSON.parse(fs.readFileSync(itemsPath,"utf8")); }
function listItems(){ return loadItems(); }

function ensureUserShape(user){
  if (!user) return null;
  user.inventory = user.inventory || {};
  user.equipments = user.equipments || {};
  user.titles = user.titles || [];
  user.relationships = user.relationships || { partners: {} };

  // Mining + Gear (mở rộng an toàn)
  if (!user.mining) user.mining = {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};

  if (!user.gear) user.gear = {};
  if (!user.gear.equipped || typeof user.gear.equipped !== "object") {
    user.gear.equipped = { weapon: null, armor: null, boots: null, bracelet: null };
  }
  if (!Array.isArray(user.gear.bag)) user.gear.bag = [];

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

  // Mining tool: lưu theo instance (có độ bền)
  if (it.type === "mining_tool") {
    const iid = `mt_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
    const maxDur = Number(it.durability || 0);
    buyer.mining.tools.push({
      iid,
      itemId,
      name: it.name,
      tier: it.tier || "pham",
      durability: maxDur,
      durabilityMax: maxDur,
      bonusRare: Number(it.bonusRare || 0),
      boughtAt: Date.now(),
    });
    if (!buyer.mining.activeToolId) buyer.mining.activeToolId = iid;
  } else {
    // Legacy stack inventory
    buyer.inventory[itemId] = (buyer.inventory[itemId]||0)+1;
  }
  users[buyerId]=buyer; saveUsers(users);
  return { ok:true, message:`✅ Đã mua **${it.emoji||""} ${it.name}** với giá **${price} LT**.` };
}

module.exports={ listItems, buyItem };
