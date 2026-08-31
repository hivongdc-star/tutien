const { randomInt } = require("crypto");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { loadOreDB, getOreById } = require("../utils/mining");
const { TIERS, tierMeta, tierText } = require("../utils/tiers");
const { AFFIX_LABELS } = require("../utils/statsView");

// ==================================================
// FORGE ENGINE
// ==================================================
const TIER_INDEX = new Map(TIERS.map((t, i) => [t, i]));
const QUALITY_RANGE = {
  pham:[0.25,0.60], linh:[0.35,0.70], hoang:[0.45,0.78], huyen:[0.55,0.85],
  dia:[0.65,0.90], thien:[0.72,0.94], tien:[0.80,0.97], than:[0.90,1.00],
};
const MAIN_RANGES = {
  weapon:{ pham:[1,5],linh:[3,8],hoang:[6,12],huyen:[10,18],dia:[14,24],thien:[20,32],tien:[28,44],than:[40,60] },
  armor:{ pham:[1,5],linh:[3,8],hoang:[6,12],huyen:[10,18],dia:[14,24],thien:[20,32],tien:[28,44],than:[40,60] },
  boots:{ pham:[1,3],linh:[2,5],hoang:[4,8],huyen:[6,12],dia:[9,16],thien:[12,22],tien:[16,30],than:[24,40] },
  bracelet:{
    hp:{ pham:[2,5],linh:[4,8],hoang:[7,12],huyen:[12,20],dia:[18,28],thien:[26,40],tien:[36,56],than:[50,80] },
    mp:{ pham:[2,5],linh:[4,8],hoang:[7,12],huyen:[12,20],dia:[18,28],thien:[26,40],tien:[36,56],than:[50,80] },
  },
};
const AFFIX_POOL = [["crit",22],["crit_dmg",16],["crit_resist",18],["armor_pen",18],["dmg_reduce",12],["lifesteal",14]];
const AFFIX_COUNT_RANGE = { pham:[1,2],linh:[1,3],hoang:[2,3],huyen:[2,4],dia:[3,4],thien:[3,5],tien:[4,5],than:[5,5] };
const AFFIX_RANGES = {
  crit:{ pham:[1,3],linh:[2,4],hoang:[3,6],huyen:[4,8],dia:[6,10],thien:[8,12],tien:[10,16],than:[14,20] },
  crit_dmg:{ pham:[4,10],linh:[8,16],hoang:[12,22],huyen:[16,28],dia:[22,36],thien:[28,44],tien:[36,60],than:[50,80] },
  crit_resist:{ pham:[1,3],linh:[2,4],hoang:[3,6],huyen:[4,8],dia:[6,10],thien:[8,12],tien:[10,16],than:[14,20] },
  armor_pen:{ pham:[1,3],linh:[2,4],hoang:[3,6],huyen:[4,8],dia:[6,10],thien:[8,12],tien:[10,16],than:[14,20] },
  dmg_reduce:{ pham:[1,2],linh:[1,3],hoang:[2,4],huyen:[3,6],dia:[4,7],thien:[5,9],tien:[7,12],than:[10,16] },
  lifesteal:{ pham:[1,2],linh:[1,3],hoang:[2,4],huyen:[3,5],dia:[4,6],thien:[5,8],tien:[6,10],than:[8,14] },
};

function clamp(n, a, b) { const x = Number(n); return Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : a; }
function tierIdx(t) { return TIER_INDEX.has(t) ? TIER_INDEX.get(t) : 0; }
function tierByIdx(i) { return TIERS[Math.max(0, Math.min(TIERS.length - 1, Number(i) || 0))] || "pham"; }
function rand01() { return randomInt(0, 1_000_000) / 1_000_000; }
function randBetween(a, b) { a = Math.ceil(Number(a)||0); b = Math.floor(Number(b)||0); return b <= a ? a : randomInt(a, b + 1); }
function rollQuality(tier) { const [a,b] = QUALITY_RANGE[tier] || QUALITY_RANGE.pham; return a + (b-a)*rand01(); }
function rollPctWithQuality(min, max, q) {
  const a = Number(min)||0, b = Number(max)||0; if (b <= a) return Math.round(a);
  const v = a + (b-a) * Math.pow(clamp(q,0,1),1.6);
  const jitter = (rand01()-0.5)*0.10;
  return Math.round(clamp(a + (v-a)*(1+jitter), a, b));
}
function pickWeightedKey(pool) {
  const total = pool.reduce((s,[,w]) => s + Math.max(0,Number(w)||0), 0); if (total <= 0) return pool[0]?.[0] || null;
  let r = randomInt(1,total+1); for (const [k,w] of pool) { r -= Math.max(0,Number(w)||0); if (r <= 0) return k; }
  return pool.at(-1)?.[0] || null;
}
function pickAffixStats(n) {
  const out=[], used=new Set(); let guard=0;
  while (out.length<n && guard++<50) { const k=pickWeightedKey(AFFIX_POOL); if(k&&!used.has(k)){used.add(k);out.push(k);} }
  for (const [k] of AFFIX_POOL) { if(out.length>=n)break; if(!used.has(k)){used.add(k);out.push(k);} }
  return out.slice(0,n);
}
function computeTierFromOres(oreIds) {
  loadOreDB(); const ids = Array.isArray(oreIds) ? oreIds : []; if (ids.length !== 5) throw new Error("Cần đúng 5 khoáng thạch");
  const levels = ids.map((id) => { const o=getOreById(id); if(!o)throw new Error(`Khoáng thạch không hợp lệ: ${id}`); return tierIdx(o.tier); });
  const avg = levels.reduce((a,b)=>a+b,0)/5, low=Math.floor(avg), high=Math.ceil(avg); if(low===high)return tierByIdx(low);
  const chance = clamp((avg-low)+0.15*(levels.filter((x)=>x>=high).length/5),0,0.95);
  return rand01()<chance ? tierByIdx(high) : tierByIdx(low);
}
function slotLabel(slot) { return ({weapon:"Vũ khí",armor:"Giáp",boots:"Giày",bracelet:"Vòng tay"})[slot] || slot; }
function slotName(slot) { return ({weapon:"Bảo Binh",armor:"Hộ Giáp",boots:"Hành Ngoa",bracelet:"Linh Uyển"})[slot] || "Trang Bị"; }
function rollMain(slot,tier,q) {
  if(slot==="weapon"){const [a,b]=MAIN_RANGES.weapon[tier]||MAIN_RANGES.weapon.pham;return{atkPct:rollPctWithQuality(a,b,q)};}
  if(slot==="armor"){const [a,b]=MAIN_RANGES.armor[tier]||MAIN_RANGES.armor.pham;return{defPct:rollPctWithQuality(a,b,q)};}
  if(slot==="boots"){const [a,b]=MAIN_RANGES.boots[tier]||MAIN_RANGES.boots.pham;return{spdPct:rollPctWithQuality(a,b,q)};}
  if(slot==="bracelet"){
    const [ha,hb]=MAIN_RANGES.bracelet.hp[tier]||MAIN_RANGES.bracelet.hp.pham;
    const [ma,mb]=MAIN_RANGES.bracelet.mp[tier]||MAIN_RANGES.bracelet.mp.pham;
    return{hpPct:rollPctWithQuality(ha,hb,q),mpPct:rollPctWithQuality(ma,mb,q)};
  }
  return{atkPct:1};
}
function rollAffixes(tier,qItem) {
  const [minN,maxN]=AFFIX_COUNT_RANGE[tier]||AFFIX_COUNT_RANGE.pham; const stats=pickAffixStats(randBetween(minN,maxN));
  return stats.map((k)=>{const [a,b]=AFFIX_RANGES[k]?.[tier]||AFFIX_RANGES[k]?.pham||[1,2];const q=clamp(qItem*0.7+rand01()*0.3,0,1);return{stat:k,pct:rollPctWithQuality(a,b,q)};});
}
function createGearFromOres({slot,oreIds}) {
  const tier=computeTierFromOres(oreIds), q=rollQuality(tier);
  return { gid:`g_${Date.now()}_${Math.random().toString(16).slice(2,8)}`, slot, tier, name:`${tierMeta(tier).label} ${slotName(slot)}`, main:rollMain(slot,tier,q), affixes:rollAffixes(tier,q), createdAt:Date.now() };
}
function formatGearLines(it) {
  const m=tierMeta(it.tier); const main=[];
  if(Number.isFinite(it?.main?.atkPct))main.push(`Công +${it.main.atkPct}%`);
  if(Number.isFinite(it?.main?.defPct))main.push(`Thủ +${it.main.defPct}%`);
  if(Number.isFinite(it?.main?.spdPct))main.push(`Tốc +${it.main.spdPct}%`);
  if(Number.isFinite(it?.main?.hpPct))main.push(`Sinh mệnh +${it.main.hpPct}%`);
  if(Number.isFinite(it?.main?.mpPct))main.push(`Linh lực +${it.main.mpPct}%`);
  return { title:`${m.icon} ${it.name} — ${tierText(it.tier)} (${slotLabel(it.slot)})`, mainLine:main.join(" • ")||"(chưa có)", aff:(it.affixes||[]).map((a)=>({k:String(a.stat||""),v:Number(a.pct)||0})) };
}

// ==================================================
// FORGE COMMAND UI
// ==================================================
function ensureMining(user) {
  user.mining=user.mining||{}; if(!Array.isArray(user.mining.tools))user.mining.tools=[];
  if(typeof user.mining.activeToolId==="undefined")user.mining.activeToolId=null;
  if(!Number.isFinite(user.mining.lastMineAt))user.mining.lastMineAt=0;
  if(!user.mining.ores||typeof user.mining.ores!=="object")user.mining.ores={};
}
function ensureGear(user) {
  user.gear=user.gear||{}; user.gear.equipped=user.gear.equipped&&typeof user.gear.equipped==="object"?user.gear.equipped:{weapon:null,armor:null,boots:null,bracelet:null};
  for(const s of ["weapon","armor","boots","bracelet"])if(typeof user.gear.equipped[s]==="undefined")user.gear.equipped[s]=null;
  if(!Array.isArray(user.gear.bag))user.gear.bag=[];
}
function countTotalOres(user){return Object.values(user?.mining?.ores||{}).reduce((s,q)=>s+Math.max(0,Number(q)||0),0);}
function buildOreList(user, selectedCounts, filterTier) {
  loadOreDB(); const entries=Object.entries(user?.mining?.ores||{}).map(([id,q])=>({id,qty:Math.max(0,Number(q)||0),ore:getOreById(id)})).filter((x)=>x.qty>0&&x.ore);
  const list=(filterTier&&filterTier!=="all"?entries.filter((x)=>x.ore.tier===filterTier):entries).sort((a,b)=>tierIdx(b.ore.tier)-tierIdx(a.ore.tier)||String(a.ore.name).localeCompare(String(b.ore.name)));
  return { options:list.slice(0,25).map((x)=>({label:`${tierMeta(x.ore.tier).icon} ${x.ore.name}`.slice(0,100),value:x.id,description:`${tierText(x.ore.tier)} • còn x${Math.max(0,x.qty-(Number(selectedCounts[x.id])||0))}`.slice(0,100)})), needFilter:entries.length>25 };
}
function buildSelectedText(ids){return ids.length?ids.map((id,i)=>{const o=getOreById(id);return o?`• #${i+1}: ${tierMeta(o.tier).icon} ${o.name} (${tierText(o.tier)})`:`• #${i+1}: ${id}`;}).join("\n"):"(Chưa chọn)";}
function sleep(ms){return new Promise((r)=>setTimeout(r,ms));}

const renCommand={
  name:"ren", aliases:["forge","rendu","renduc"], description:"Rèn trang bị bằng 5 khoáng thạch.",
  run:async(_client,msg)=>{
    const users=loadUsers(), user=users[msg.author.id]; if(!user)return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    ensureMining(user);ensureGear(user); if(countTotalOres(user)<5)return msg.reply("🪨 Khoáng thạch chưa đủ để khai lò, cần **5 viên**. Dùng `-dao` để khai khoáng.");
    const nonce=String(Date.now());
    const slotMenu=new StringSelectMenuBuilder().setCustomId(`forge_slot_${msg.author.id}_${nonce}`).setPlaceholder("Chọn slot trang bị...").addOptions(
      {label:"⚔️ Vũ khí",value:"weapon",description:"Dòng chính: Công (%)"},{label:"🛡️ Giáp",value:"armor",description:"Dòng chính: Thủ (%)"},{label:"👢 Giày",value:"boots",description:"Dòng chính: Tốc (%)"},{label:"🧿 Vòng tay",value:"bracelet",description:"Dòng chính: HP/MP (%)"}
    );
    const sent=await msg.reply({embeds:[new EmbedBuilder().setColor(0xF39C12).setTitle("🛠️ Rèn Đúc").setDescription("Chọn **loại trang bị** muốn rèn.")],components:[new ActionRowBuilder().addComponents(slotMenu)]});
    const slotCollector=sent.createMessageComponentCollector({componentType:ComponentType.StringSelect,time:60_000});
    slotCollector.on("collect",async(i)=>{
      if(i.user.id!==msg.author.id)return i.reply({content:"❌ Đây không phải lò rèn của đạo hữu.",ephemeral:true}); await i.deferUpdate();
      const slot=i.values[0];slotCollector.stop("slot-picked");await sent.edit({components:[]}).catch(()=>{});
      const picked=[], selectedCounts={};let filterTier="all";
      const buildRows=()=>{
        const {options,needFilter}=buildOreList(user,selectedCounts,filterTier), rows=[];
        if(needFilter)rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`forge_filter_${msg.author.id}_${nonce}`).setPlaceholder("Lọc theo phẩm giai...").addOptions(
          {label:"Tất cả",value:"all"},{label:"Phàm",value:"pham"},{label:"Linh",value:"linh"},{label:"Hoàng",value:"hoang"},{label:"Huyền",value:"huyen"},{label:"Địa",value:"dia"},{label:"Thiên",value:"thien"},{label:"Tiên",value:"tien"},{label:"Thần",value:"than"}
        )));
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`forge_pick_${msg.author.id}_${nonce}`).setPlaceholder("Chọn khoáng thạch...").addOptions(options.length?options:[{label:"Không có khoáng phù hợp",value:"none"}])));
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`forge_done_${msg.author.id}_${nonce}`).setStyle(ButtonStyle.Success).setLabel("Rèn").setDisabled(picked.length!==5),
          new ButtonBuilder().setCustomId(`forge_undo_${msg.author.id}_${nonce}`).setStyle(ButtonStyle.Secondary).setLabel("Hoàn tác").setDisabled(!picked.length),
          new ButtonBuilder().setCustomId(`forge_cancel_${msg.author.id}_${nonce}`).setStyle(ButtonStyle.Danger).setLabel("Huỷ")
        ));return rows;
      };
      const buildEmbed=()=>new EmbedBuilder().setColor(0xF39C12).setTitle("🛠️ Rèn Đúc — Chọn Khoáng").setDescription(`Slot: **${slotLabel(slot)}**\nĐã chọn: **${picked.length}/5**\n\n${buildSelectedText(picked)}`);
      const forgeMsg=await msg.reply({embeds:[buildEmbed()],components:buildRows()});const collector=forgeMsg.createMessageComponentCollector({time:120_000});
      const refresh=()=>forgeMsg.edit({embeds:[buildEmbed()],components:buildRows()}).catch(()=>{});
      collector.on("collect",async(j)=>{
        if(j.user.id!==msg.author.id)return j.reply({content:"❌ Đây không phải lò rèn của đạo hữu.",ephemeral:true});const cid=String(j.customId||"");
        if(cid.startsWith(`forge_filter_${msg.author.id}_${nonce}`)){await j.deferUpdate();filterTier=j.values[0]||"all";return refresh();}
        if(cid.startsWith(`forge_pick_${msg.author.id}_${nonce}`)){await j.deferUpdate();const id=j.values[0];if(!id||id==="none"||picked.length>=5)return;const owned=Math.max(0,Number(user.mining.ores?.[id])||0),used=Math.max(0,Number(selectedCounts[id])||0);if(used>=owned)return j.followUp({content:"⚠️ Khoáng này không còn đủ.",ephemeral:true});picked.push(id);selectedCounts[id]=used+1;return refresh();}
        if(cid===`forge_undo_${msg.author.id}_${nonce}`){await j.deferUpdate();const last=picked.pop();if(last)selectedCounts[last]=Math.max(0,(Number(selectedCounts[last])||0)-1);return refresh();}
        if(cid===`forge_cancel_${msg.author.id}_${nonce}`){await j.deferUpdate();collector.stop("cancel");return forgeMsg.edit({components:[]}).catch(()=>{});}
        if(cid!==`forge_done_${msg.author.id}_${nonce}`)return;await j.deferUpdate();if(picked.length!==5)return;
        collector.stop("done");await forgeMsg.edit({embeds:[new EmbedBuilder().setColor(0xF39C12).setTitle("🛠️ Đang rèn...").setDescription(buildSelectedText(picked))],components:[]}).catch(()=>{});
        const latest=loadUsers(),u=latest[msg.author.id];if(!u)return;ensureMining(u);ensureGear(u);const need={};for(const id of picked)need[id]=(need[id]||0)+1;
        for(const [id,n] of Object.entries(need))if((Number(u.mining.ores?.[id])||0)<n)return forgeMsg.edit({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle("❌ Rèn thất bại").setDescription("Khoáng thạch đã thay đổi, không còn đủ số lượng.")],components:[]}).catch(()=>{});
        for(const [id,n] of Object.entries(need)){u.mining.ores[id]-=n;if(u.mining.ores[id]<=0)delete u.mining.ores[id];}
        const item=createGearFromOres({slot,oreIds:picked});u.gear.bag.push(item);latest[msg.author.id]=u;saveUsers(latest);await sleep(1200+Math.floor(Math.random()*900));
        const {title,mainLine,aff}=formatGearLines(item);const affLines=aff.length?aff.map((x)=>`${AFFIX_LABELS[x.k]||x.k} +${x.v}%`).join("\n"):"(Không có)";
        return forgeMsg.edit({embeds:[new EmbedBuilder().setColor(tierMeta(item.tier).color).setTitle(title).setDescription(`**Dòng chính**\n${mainLine}\n\n**Phụ tố**\n${affLines}\n\n✅ Đã đưa vào **túi trang bị**.`)],components:[]}).catch(()=>{});
      });
      collector.on("end",()=>forgeMsg.edit({components:[]}).catch(()=>{}));
    });
    slotCollector.on("end",()=>sent.edit({components:[]}).catch(()=>{}));
  }
};

module.exports={commands:[renCommand],computeTierFromOres,createGearFromOres,formatGearLines};
