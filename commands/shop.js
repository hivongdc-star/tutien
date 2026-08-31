const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { tierText } = require("../utils/tiers");
const elements = require("../utils/element");
const { listSkills, getSkill, ensureUserSkills, addOwnedSkill, describeSkillShort } = require("../utils/skills");

// ==================================================
// SHOP ENGINE
// ==================================================
const ITEMS_PATH = path.join(__dirname, "../shop/items.json");
function loadItems() {
  try { return JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")); }
  catch (e) { console.error("❌ Không thể tải shop/items.json:", e?.message || e); return {}; }
}
function listItems() { return loadItems(); }
function getItem(itemId) { return loadItems()[itemId] || null; }
function fmtLT(n) { return Number(n || 0).toLocaleString("vi-VN"); }
function clampQty(n) { const x=Math.floor(Number(n)); return Number.isFinite(x)&&x>=1&&x<=99 ? x : null; }
function ensureUserShape(user) {
  if(!user)return null; user.inventory=user.inventory||{};user.equipments=user.equipments||{};user.titles=user.titles||[];
  user.mining=user.mining||{};if(!Array.isArray(user.mining.tools))user.mining.tools=[];if(typeof user.mining.activeToolId==="undefined")user.mining.activeToolId=null;if(!Number.isFinite(user.mining.lastMineAt))user.mining.lastMineAt=0;if(!user.mining.ores||typeof user.mining.ores!=="object")user.mining.ores={};
  user.gear=user.gear||{};if(!user.gear.equipped||typeof user.gear.equipped!=="object")user.gear.equipped={weapon:null,armor:null,boots:null,bracelet:null};if(!Array.isArray(user.gear.bag))user.gear.bag=[];
  return user;
}
function buyItem(buyerId,itemId,qty=1) {
  const users=loadUsers(), catalog=loadItems(), buyer=ensureUserShape(users[buyerId]);
  if(!buyer)return{ok:false,message:"❌ Bạn chưa có nhân vật."}; const it=catalog[itemId];if(!it)return{ok:false,message:"❌ Mặt hàng không tồn tại."};
  const q=clampQty(qty),price=Number(it.price||0);if(!q)return{ok:false,message:"❌ Số lượng không hợp lệ (1–99)."};if(!Number.isFinite(price)||price<0)return{ok:false,message:"❌ Giá không hợp lệ."};
  const total=price*q;if((Number(buyer.lt)||0)<total)return{ok:false,message:"❌ Không đủ LT."};buyer.lt-=total;
  if(it.type==="mining_tool"){
    const maxDur=Math.max(1,Number(it.durability||1));
    for(let k=0;k<q;k++){
      const iid=`mt_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
      buyer.mining.tools.push({iid,itemId,name:it.name,tier:it.tier||"pham",durability:maxDur,durabilityMax:maxDur,bonusRare:Number(it.bonusRare??it.bonus??0),boughtAt:Date.now()});
      if(!buyer.mining.activeToolId)buyer.mining.activeToolId=iid;
    }
  } else buyer.inventory[itemId]=(buyer.inventory[itemId]||0)+q;
  users[buyerId]=buyer;saveUsers(users);
  const tierLine=it.tier?` • ${tierText(it.tier)}`:"",name=`${it.emoji||""} ${it.name}`.trim();
  return{ok:true,message:`✅ Đã đưa vào hành trang: ${q>1?`x${q} `:""}**${name}**${tierLine} • Tổng giá **${fmtLT(total)} LT**.`};
}

// ==================================================
// SHOP UI
// ==================================================
function menuRow(id,placeholder,options){return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder).addOptions(options));}
function qtyRow(userId,itemId,maxQty){
  const vals=[1,5,10,25,maxQty].filter((v,i,a)=>v<=maxQty&&a.indexOf(v)===i).slice(0,5);
  return new ActionRowBuilder().addComponents(vals.map((q)=>new ButtonBuilder().setCustomId(`shopbuy_${userId}:${itemId}:${q}`).setLabel(q===maxQty?`Max ${q}`:`x${q}`).setStyle(q===maxQty?ButtonStyle.Success:ButtonStyle.Primary)));
}
function short100(s){const x=String(s||"").replace(/\s+/g," ").trim();return x.length<=100?x:`${x.slice(0,97)}…`;}
function categoryEntries(mode) {
  const catalog=listItems();
  if(mode==="tools")return Object.entries(catalog).filter(([,it])=>it.type==="mining_tool");
  if(mode==="pets")return Object.entries(catalog).filter(([,it])=>it.type==="pet_egg");
  return Object.entries(catalog).filter(([,it])=>it.type!=="mining_tool"&&it.type!=="pet_egg");
}

const shopCommand={
  name:"shop",aliases:["s"],
  run:async(_client,msg)=>{
    let users=loadUsers(),u=users[msg.author.id];if(!u)return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");ensureUserSkills(u);users[msg.author.id]=u;saveUsers(users);
    const nonce=Date.now(),catId=`shopcat_${msg.author.id}_${nonce}`,pickId=`shoppick_${msg.author.id}_${nonce}`;
    const header=new EmbedBuilder().setTitle("🛒 Linh Bảo Các").setColor(0x3498DB).setDescription(`Linh thạch hiện có: **${fmtLT(u.lt)}** 💎\n\nChọn quầy muốn ghé:`);
    const catRow=menuRow(catId,"Chọn quầy...",[
      {label:"Khoáng cụ",value:"tools",description:"Khoáng cụ khai mạch"},{label:"Vật phẩm",value:"items",description:"Linh tài và vật phẩm"},{label:"Bí kíp",value:"skills",description:"Kỹ năng theo ngũ hành"},{label:"Trứng Linh Thú",value:"pets",description:"Trứng để ấp linh thú"}
    ]);
    const sent=await msg.reply({embeds:[header],components:[catRow]});const col=sent.createMessageComponentCollector({time:120_000});let mode=null;
    const showCategory=async()=>{
      users=loadUsers();u=users[msg.author.id];if(!u)return;
      if(mode==="skills"){
        ensureUserSkills(u);const el=u.element||"kim",pool=listSkills({element:el,rarity:"common"});
        const emb=new EmbedBuilder().setTitle("🛒 Linh Bảo Các • Bí kíp").setColor(0x9B59B6).setDescription(`Hệ: ${elements.display[el]||el}\nLT: **${fmtLT(u.lt)}** 💎`);
        if(!pool.length)return sent.edit({embeds:[emb.setDescription("Hiện chưa có bí kíp phù hợp.")],components:[catRow]}).catch(()=>{});
        return sent.edit({embeds:[emb],components:[catRow,menuRow(pickId,"Chọn bí kíp...",pool.slice(0,25).map((s)=>({label:s.name.slice(0,100),value:`skill:${s.id}`,description:short100(`${fmtLT(s.price)} LT • ${describeSkillShort(s)}`)})))]}).catch(()=>{});
      }
      const entries=categoryEntries(mode);const title=mode==="tools"?"Khoáng cụ":mode==="pets"?"Trứng Linh Thú":"Vật phẩm";
      const emb=new EmbedBuilder().setTitle(`🛒 Linh Bảo Các • ${title}`).setColor(mode==="pets"?0xF1C40F:mode==="tools"?0x2ECC71:0x1ABC9C).setDescription(`Linh thạch hiện có: **${fmtLT(u.lt)}** 💎`);
      if(!entries.length)return sent.edit({embeds:[emb.setDescription("Quầy này hiện đang trống.")],components:[catRow]}).catch(()=>{});
      return sent.edit({embeds:[emb],components:[catRow,menuRow(pickId,`Chọn ${title.toLowerCase()}...`,entries.slice(0,25).map(([id,it])=>({label:`${it.emoji||""} ${it.name}`.trim().slice(0,100),value:`item:${id}`,description:`${fmtLT(it.price||0)} LT${it.tier?` • ${tierText(it.tier)}`:""}`.slice(0,100)})))]}).catch(()=>{});
    };
    col.on("collect",async(i)=>{
      if(i.user.id!==msg.author.id)return i.reply({content:"❌ Đây không phải quầy của đạo hữu.",ephemeral:true});await i.deferUpdate();
      if(i.isStringSelectMenu()&&i.customId===catId){mode=i.values[0];return showCategory();}
      if(i.isStringSelectMenu()&&i.customId===pickId){
        const val=i.values[0];users=loadUsers();u=users[msg.author.id];if(!u)return;
        if(val.startsWith("skill:")){
          const sid=val.slice(6),sk=getSkill(sid);ensureUserSkills(u);
          if(!sk||sk.rarity!=="common")return i.followUp({content:"❌ Bí kíp không hợp lệ.",ephemeral:true});
          if(u.skills.owned.includes(sid))return i.followUp({content:"⚠️ Đạo hữu đã lĩnh ngộ bí kíp này.",ephemeral:true});
          if((Number(u.lt)||0)<(Number(sk.price)||0))return i.followUp({content:"❌ Không đủ linh thạch.",ephemeral:true});
          u.lt-=Number(sk.price)||0;const add=addOwnedSkill(u,sid);if(!add.ok)return i.followUp({content:`❌ ${add.reason||"Không thể lĩnh ngộ."}`,ephemeral:true});users[msg.author.id]=u;saveUsers(users);
          col.stop("done");return sent.edit({content:`✅ Đã lĩnh **${sk.name}** với giá **${fmtLT(sk.price)} LT**.`,embeds:[],components:[]}).catch(()=>{});
        }
        const itemId=val.startsWith("item:")?val.slice(5):null,it=itemId?getItem(itemId):null;if(!it)return;
        const price=Number(it.price)||0,lt=Number(u.lt)||0,maxAff=price>0?Math.floor(lt/price):99;
        if(maxAff<1)return i.followUp({content:"❌ Không đủ linh thạch.",ephemeral:true});const maxQty=Math.max(1,Math.min(99,maxAff));
        const emb=new EmbedBuilder().setTitle(`🛒 Xác nhận mua • ${it.name}`).setColor(0x3498DB).setDescription(`Giá: **${fmtLT(price)} LT** / món\nLT hiện có: **${fmtLT(lt)}** 💎\nCó thể mua tối đa: **${maxQty}**`);
        return sent.edit({embeds:[emb],components:[qtyRow(msg.author.id,itemId,maxQty)]}).catch(()=>{});
      }
      if(i.isButton()&&String(i.customId).startsWith(`shopbuy_${msg.author.id}:`)){
        const rest=String(i.customId).slice(`shopbuy_${msg.author.id}:`.length),[itemId,q]=rest.split(":");const res=buyItem(msg.author.id,itemId,Number(q));
        col.stop("done");return sent.edit({content:res.message,embeds:[],components:[]}).catch(()=>{});
      }
    });
    col.on("end",()=>sent.edit({components:[]}).catch(()=>{}));
  }
};

module.exports={commands:[shopCommand],loadItems,listItems,getItem,buyItem};
