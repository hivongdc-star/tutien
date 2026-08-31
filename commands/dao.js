const path = require("path");
const { randomInt } = require("crypto");
const { EmbedBuilder } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { TIERS, tierMeta, tierText } = require("../utils/tiers");
const { recordQuestEvent, recordAchievementEvent } = require("./progress");

// ==================================================
// MINING ENGINE
// ==================================================
let ORE_DB = null;
const BASE_TIER_WEIGHTS = { pham:420, linh:240, hoang:140, huyen:90, dia:55, thien:30, tien:18, than:7 };
const GLOBAL_RARE_BONUS = 35;
const RARE_TIERS = new Set(["huyen","dia","thien","tien","than"]);

function loadOreDB() {
  if (ORE_DB) return ORE_DB;
  try {
    ORE_DB = require(path.join(__dirname, "../data/ores_db.json"));
    if (!Array.isArray(ORE_DB) || ORE_DB.length < 10) throw new Error("ores_db invalid");
  } catch (e) {
    console.error("❌ Không thể tải data/ores_db.json:", e?.message || e);
    ORE_DB = [];
  }
  return ORE_DB;
}
function pickWeighted(entries) {
  const total = entries.reduce((s,[,w]) => s + Math.max(0,Number(w)||0), 0);
  if (!Number.isFinite(total) || total <= 0) return entries[0]?.[0];
  let r = randomInt(1,total+1);
  for (const [k,w] of entries) { r -= Math.max(0,Number(w)||0); if (r <= 0) return k; }
  return entries.at(-1)?.[0];
}
function rollTier({ bonusRare = 0 } = {}) {
  const br = Math.max(0,Number(bonusRare)||0) + GLOBAL_RARE_BONUS;
  return pickWeighted(TIERS.map((t) => {
    const base = BASE_TIER_WEIGHTS[t] || 0;
    return [t, RARE_TIERS.has(t) ? base + Math.round(base * br / 100) : base];
  }));
}
function rollOre({ bonusRare = 0 } = {}) {
  const db = loadOreDB(); if (!db.length) return null;
  const tier = rollTier({ bonusRare }); const pool = db.filter((o) => o.tier === tier); const use = pool.length ? pool : db;
  const entries = use.map((o) => [o, Math.max(1,Number(o.weight)||1)]);
  const total = entries.reduce((s,[,w])=>s+w,0); let r=randomInt(1,total+1);
  for (const [o,w] of entries) { r-=w; if(r<=0)return o; }
  return entries.at(-1)?.[0] || null;
}
function getOreById(id) { return loadOreDB().find((o) => o.id === id) || null; }

// ==================================================
// MINING COMMAND
// ==================================================
const COOLDOWN_MS = 5_000;
function ensureMining(user) {
  user.mining = user.mining || {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

const daoCommand = {
  name: "dao", aliases: ["daokhoang","mine"], description: "Đào khoáng (5 giây/lần).",
  run: async (_client,msg) => {
    const users=loadUsers(), user=users[msg.author.id];
    if(!user)return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    ensureMining(user);
    const now=Date.now(), remain=user.mining.lastMineAt+COOLDOWN_MS-now;
    if(remain>0){const sec=Math.ceil(remain/1000);return msg.reply(`⏳ Nội tức chưa ổn. Hãy chờ **${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}** rồi hãy đào tiếp.`);}
    if(!user.mining.tools.length)return msg.reply("❌ Đạo hữu chưa có khoáng cụ. Ghé `-shop` để chuẩn bị trước khi xuống mỏ.");
    let tool=user.mining.tools.find((t)=>t.iid===user.mining.activeToolId)||null;
    if(!tool){tool=user.mining.tools[0];user.mining.activeToolId=tool.iid;}
    const ore=rollOre({bonusRare:tool.bonusRare||0});
    if(!ore)return msg.reply("❌ Linh mỏ tạm thời chưa khai thông. Hãy báo quản sự kiểm tra.");
    user.mining.ores[ore.id]=(Number(user.mining.ores[ore.id])||0)+1;
    recordQuestEvent(user,"mine",1); const titles=recordAchievementEvent(user,"mine",1)||[];
    tool.durability=Math.max(0,(Number(tool.durability)||0)-1);user.mining.lastMineAt=now;
    let broke="";
    if(tool.durability<=0){user.mining.tools=user.mining.tools.filter((t)=>t.iid!==tool.iid);if(user.mining.activeToolId===tool.iid)user.mining.activeToolId=user.mining.tools[0]?.iid||null;broke="\n\n⚠️ **Khoáng cụ** đã vỡ nát, linh vận tiêu tán.";}
    const m=tierMeta(ore.tier),dur=`${Math.max(0,tool.durability)}/${Math.max(0,tool.durabilityMax||tool.durability||0)}`;
    const embed=new EmbedBuilder().setColor(m.color).setTitle("⛏️ Khai Khoáng").setDescription(`${m.icon} **${ore.name}** • **${tierText(ore.tier)}**\nKhoáng cụ: **${tool.name||"Khoáng cụ"}** • Độ bền **${dur}**${broke}`);
    if(titles.length)embed.addFields({name:"Danh hiệu vừa ngộ",value:titles.map((t)=>`• **${t}**`).join("\n")});
    users[msg.author.id]=user;saveUsers(users);return msg.reply({embeds:[embed]});
  }
};

module.exports={commands:[daoCommand],loadOreDB,getOreById,rollOre,rollTier,BASE_TIER_WEIGHTS};
