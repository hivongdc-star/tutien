const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { randomUUID } = require("node:crypto");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { loadUsers, saveUsers } = require("../utils/storage");
const { recordQuestEvent, recordAchievementEvent } = require("./progress");
const elements = require("../utils/element");
const { rollOre } = require("../utils/mining");
const { tierMeta, tierText } = require("../utils/tiers");
const { sumMainPercents, sumAffixes, applyPct } = require("../utils/statsView");
const { getRealm } = require("../utils/xp");
const { ensureUserSkills, addShard, getSkill, computePassiveTotals } = require("../utils/skills");

// ==================================================
// DUNGEON COMBAT ENGINE
// ==================================================
function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = rand(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function diffMeta(diff) {
  if (diff === "easy") return { name: "Thường", mult: 1.15, color: 0x2ECC71 };
  if (diff === "hard") return { name: "Hung", mult: 1.45, color: 0xE67E22 };
  return { name: "Tuyệt", mult: 1.85, color: 0xE74C3C };
}
function computeEffective(user) {
  const equipped = user?.gear?.equipped || {};
  const mainPct = sumMainPercents(equipped);
  const aff = sumAffixes(equipped);
  ensureUserSkills(user);
  const passive = computePassiveTotals(user);
  const eff = {
    atk: applyPct(Number(user.atk) || 0, mainPct.atk),
    def: applyPct(Number(user.def) || 0, mainPct.def),
    spd: applyPct(Number(user.spd) || 0, mainPct.spd),
    maxHp: applyPct(Number(user.maxHp) || 0, mainPct.hp),
    maxMp: applyPct(Number(user.maxMp) || 0, mainPct.mp),
    crit: clamp((Number(aff.crit) || 0) + (Number(passive.crit) || 0), 0, 60),
    crit_resist: clamp((Number(aff.crit_resist) || 0) + (Number(passive.crit_resist) || 0), 0, 60),
    armor_pen: clamp((Number(aff.armor_pen) || 0) + (Number(passive.armor_pen) || 0), 0, 60),
    crit_dmg: clamp((Number(aff.crit_dmg) || 0) + (Number(passive.crit_dmg) || 0), 0, 200),
    dmg_reduce: clamp((Number(aff.dmg_reduce) || 0) + (Number(passive.dmg_reduce) || 0), 0, 50),
    lifesteal: clamp((Number(aff.lifesteal) || 0) + (Number(passive.lifesteal) || 0), 0, 35),
    dodge: clamp((Number(aff.dodge) || 0) + (Number(passive.dodge) || 0), 0, 40),
    accuracy: clamp((Number(aff.accuracy) || 0) + (Number(passive.accuracy) || 0), 0, 40),
  };
  return { eff, mainPct, aff, passive };
}
function makePlayerEntity(id, user) {
  const { eff } = computeEffective(user);
  ensureUserSkills(user);
  return {
    id, kind: "player", name: user.name || "Vô danh", element: user.element || "kim",
    level: Number(user.level) || 1, realm: String(user.realm || getRealm(user.level || 1) || ""), stats: eff,
    hp: clamp(Number(user.hp) || eff.maxHp, 0, eff.maxHp), mp: clamp(Number(user.mp) || eff.maxMp, 0, eff.maxMp),
    shield: 0, buffs: {}, debuffs: {}, cooldowns: {}, alive: true,
    skills: { actives: (user.skills?.equipped?.actives || []).slice(0, 4), passive: user.skills?.equipped?.passive || null },
  };
}
function avgParty(party) {
  const n = Math.max(1, party.length);
  return party.reduce((a, p) => ({ atk: a.atk + p.stats.atk / n, def: a.def + p.stats.def / n, spd: a.spd + p.stats.spd / n, hp: a.hp + p.stats.maxHp / n }), { atk: 0, def: 0, spd: 0, hp: 0 });
}
function enemyNames(key) {
  return ({
    forest: ["U Linh Thụ Yêu", "Huyết Ảnh Lang Vương", "Thanh Mộc Tà Linh", "Phong Ấn Cổ Thú"],
    lava: ["Liệt Diễm Ma Tướng", "Hỏa Ngục Huyết Linh", "Nham Tinh Cự Thú", "Viêm Vương Tàn Hồn"],
    ocean: ["Hàn Hải Xà Linh", "Thủy Ảnh Ma Ngư", "Băng Linh Cổ Thú", "Huyền Thủy Sát Tướng"],
    black: ["Hắc Vực Quỷ Tướng", "Ma Ảnh Hồn Thể", "Tà Linh Vô Diện", "U Minh Cổ Thú"],
    default: ["Tàn Điện Khôi Lỗi", "Cổ Ấn U Linh", "Thiên Cơ Tàn Hồn", "Hư Không Dị Thú"],
  })[key] || ["Tàn Điện Khôi Lỗi", "Cổ Ấn U Linh", "Thiên Cơ Tàn Hồn", "Hư Không Dị Thú"];
}
function generateEnemies({ party, mapKey, diff, floor, isBoss }) {
  const avg = avgParty(party); const dm = diffMeta(diff); const pool = enemyNames(mapKey);
  const avgLv = Math.max(1, Math.round(party.reduce((a,p)=>a+(p.level||1),0) / party.length));
  const baseLv = avgLv + (diff === "easy" ? -2 : diff === "hard" ? 0 : 2) + Math.max(0, floor - 1) + (isBoss ? 2 : 0);
  let count = isBoss || party.length === 1 ? 1 : floor <= 2 ? (Math.random() < .35 ? 2 : 1) : Math.min(party.length, Math.random() < .45 && party.length >= 3 ? 3 : 2);
  const enemies = [];
  for (let i = 0; i < count; i++) {
    let atk = avg.atk * (0.92 + 0.06 * (floor - 1)) * dm.mult;
    let def = avg.def * (0.62 + 0.05 * (floor - 1)) * dm.mult;
    let maxHp = avg.hp * (0.62 + 0.08 * (floor - 1)) * dm.mult;
    let spd = avg.spd * (0.90 + 0.04 * (floor - 1));
    if (isBoss) { atk *= 1.74; def *= 1.46; maxHp *= 1.75; spd *= 1.1; }
    if (count === 2 && !isBoss) { atk *= .82; def *= .92; maxHp *= .8; }
    if (count === 3 && !isBoss) { atk *= .72; def *= .88; maxHp *= .65; }
    if (floor === 1 && !isBoss) { atk *= diff === "easy" ? .9 : .94; maxHp *= .95; }
    const level = Math.max(1, baseLv + rand(-1, 1));
    const gap = level - avgLv;
    atk *= clamp(1 + gap * .02, .85, 1.35); def *= clamp(1 + gap * .02, .85, 1.35); maxHp *= clamp(1 + gap * .03, .8, 1.55); spd *= clamp(1 + gap * .01, .9, 1.2);
    atk = Math.max(1, Math.round(atk)); def = Math.max(0, Math.round(def)); maxHp = Math.max(1, Math.round(maxHp)); spd = Math.max(1, Math.round(spd));
    enemies.push({
      id: `e_${floor}_${i}_${Date.now()}`, kind: isBoss ? "boss" : "mob", name: isBoss ? `Boss • ${pool[rand(0,pool.length-1)]}` : pool[rand(0,pool.length-1)],
      level, realm: String(getRealm(level) || ""), element: null,
      stats: { atk, def, spd, maxHp, maxMp: 0, crit: isBoss ? 10 : 6, crit_resist: isBoss ? 6 : 0, armor_pen: isBoss ? 8 : 0, crit_dmg: isBoss ? 15 : 0, dmg_reduce: isBoss ? 6 : 0, lifesteal: 0, dodge: isBoss ? 4 : 0, accuracy: isBoss ? 4 : 0 },
      hp: maxHp, mp: 0, shield: 0, buffs: {}, debuffs: {}, cooldowns: {}, alive: true,
    });
  }
  return enemies;
}
function alive(x) { return x && x.alive && x.hp > 0; }
function lowest(list) { return list.filter(alive).sort((a,b)=>a.hp/a.stats.maxHp-b.hp/b.stats.maxHp)[0] || null; }
function effStat(e, k) {
  const base = Number(e.stats[k]) || 0; const b = e.buffs?.[k]?.pct || 0; const d = e.debuffs?.[k]?.pct || 0;
  return Math.max(0, Math.round(base * (1 + b / 100) * (1 - d / 100)));
}
function tick(e) {
  for (const group of [e.buffs, e.debuffs]) for (const k of ["atk","def","spd"]) if (group?.[k]?.turns > 0) { group[k].turns--; if (group[k].turns <= 0) group[k].pct = 0; }
  for (const k of Object.keys(e.cooldowns || {})) if (e.cooldowns[k] > 0) e.cooldowns[k]--;
  if (e.kind === "player" && e.stats.maxMp > 0) e.mp = clamp(e.mp + Math.max(1, Math.round(e.stats.maxMp * .04)), 0, e.stats.maxMp);
}
function hit(a, t) { return Math.random() * 100 < clamp(100 - Math.max(0, (t.stats.dodge||0) - (a.stats.accuracy||0)) * 2, 70, 100); }
function damage(a, t, raw, turn) {
  const pen = clamp(a.stats.armor_pen || 0, 0, 60); const reduce = clamp(t.stats.dmg_reduce || 0, 0, 50);
  const armor = Math.max(0, effStat(t, "def") * (1 - pen / 100)) * (t.kind === "player" ? 2.8 : 1.75) * (1 - (turn > 12 ? clamp((turn-12)*.02,0,.42) : 0));
  let out = Math.max(1, Math.round(raw * (100 / (100 + armor)) * (1 - reduce/100)));
  if (t.kind !== "player") out = Math.max(out, Math.round(raw * (.1 + (turn > 12 ? clamp((turn-12)*.01,0,.12) : 0))));
  return out;
}
function applyDamage(t, n) {
  let left = Math.max(0, Math.round(n)); if (t.shield > 0) { const s = Math.min(t.shield,left); t.shield -= s; left -= s; }
  t.hp = Math.max(0, t.hp - left); t.alive = t.hp > 0; return left;
}
function heal(t, n) { const before = t.hp; t.hp = clamp(t.hp + Math.max(0,Math.round(n)), 0, t.stats.maxHp); t.alive = t.hp > 0; return t.hp-before; }
function basicAttack(a, t, turn) {
  if (!t || !hit(a,t)) return;
  let raw = effStat(a,"atk") * (a.kind === "player" ? 1.24 : 1.10) * (1 + Math.max(0,turn-10) * (a.kind === "player" ? .07 : .05));
  let dmg = damage(a,t,raw,turn);
  const crit = Math.random()*100 < clamp((a.stats.crit||0)-(t.stats.crit_resist||0),0,50);
  if (crit) dmg *= 1 + (50 + (a.stats.crit_dmg||0))/100;
  const dealt = applyDamage(t,dmg);
  if ((a.stats.lifesteal||0)>0) heal(a,dealt*clamp(a.stats.lifesteal,0,35)/100);
}
function skillCooldown(s) { const b = ({BURST:3,AOE:4,DEBUFF:4,SHIELD:4,HEAL:4,BUFF:4})[s?.template] || 4; return b + (s?.rarity === "epic" ? 2 : s?.rarity === "rare" ? 1 : 0); }
function skillMpPct(s) { return s?.rarity === "epic" ? 26 : s?.rarity === "rare" ? 18 : 12; }
function chooseSkill(actor, allies, enemies) {
  const usable = (actor.skills?.actives || []).map((id)=>({id,s:getSkill(id)})).filter((x)=>x.s && x.s.kind==="active" && !(actor.cooldowns[x.id]>0) && actor.mp >= actor.stats.maxMp*skillMpPct(x.s)/100);
  const low = lowest(allies); const focus = lowest(enemies);
  if (low && low.hp/low.stats.maxHp < .5) { const x=usable.find(x=>x.s.template==="HEAL"); if(x) return {...x,target:low}; }
  const shield = usable.find(x=>x.s.template==="SHIELD"); if (shield && actor.hp/actor.stats.maxHp<.7 && actor.shield<=0) return {...shield,target:actor};
  const aoe = usable.find(x=>x.s.template==="AOE"); if (aoe && enemies.filter(alive).length>=2) return {...aoe,target:null};
  const offensive = usable.find(x=>["BURST","DEBUFF"].includes(x.s.template)); if (offensive) return {...offensive,target:focus};
  const buff = usable.find(x=>x.s.template==="BUFF"); if (buff) return {...buff,target:actor};
  return null;
}
function useSkill(actor, action, allies, enemies, turn) {
  const {id,s} = action; const cost = Math.round(actor.stats.maxMp * skillMpPct(s)/100); if (actor.mp<cost) return basicAttack(actor,action.target||lowest(enemies),turn);
  actor.mp -= cost; actor.cooldowns[id] = skillCooldown(s);
  const rarity = s.rarity; const mult = rarity === "epic" ? 2.3 : rarity === "rare" ? 1.75 : 1.35;
  if (s.template === "HEAL") return heal(action.target||actor, actor.stats.maxHp*(s.heal?.pctMaxHp || (rarity==="epic"?36:rarity==="rare"?28:16))/100);
  if (s.template === "SHIELD") { actor.shield += Math.round(actor.stats.maxHp*(s.shield?.pctMaxHp || (rarity==="epic"?36:rarity==="rare"?28:18))/100); return; }
  if (s.template === "BUFF") { const k=s.buff?.stat||"atk"; actor.buffs[k]={pct:s.buff?.pct||(rarity==="epic"?26:rarity==="rare"?18:14),turns:s.buff?.turns||2}; return; }
  if (s.template === "AOE") { for (const t of enemies.filter(alive).slice(0,3)) if(hit(actor,t)) applyDamage(t,damage(actor,t,effStat(actor,"atk")*(rarity==="epic"?1.35:rarity==="rare"?1.15:.9),turn)); return; }
  const t = action.target || lowest(enemies); if (!t || !hit(actor,t)) return;
  const coef = s.template === "DEBUFF" ? (rarity==="epic"?1.45:rarity==="rare"?1.2:.95) : mult;
  applyDamage(t,damage(actor,t,effStat(actor,"atk")*coef,turn));
  if (s.template === "DEBUFF") { const k=s.debuff?.stat||"atk"; t.debuffs[k]={pct:s.debuff?.pct||(rarity==="epic"?26:rarity==="rare"?18:12),turns:s.debuff?.turns||2}; }
}
function simulateBattle({party,enemies,maxTurns=60}) {
  let turn=0;
  while(turn<maxTurns && party.some(alive) && enemies.some(alive)) {
    turn++; for(const e of [...party,...enemies]) tick(e);
    const order=[...party.filter(alive),...enemies.filter(alive)].sort((a,b)=>effStat(b,"spd")-effStat(a,"spd")+Math.random()*3-1.5);
    for(const actor of order) {
      if(!alive(actor) || !party.some(alive) || !enemies.some(alive)) continue;
      if(actor.kind==="player") { const a=chooseSkill(actor,party,enemies); if(a) useSkill(actor,a,party,enemies,turn); else basicAttack(actor,lowest(enemies),turn); }
      else basicAttack(actor,lowest(party),turn);
    }
  }
  return { outcome: party.some(alive)&&!enemies.some(alive)?"win":!party.some(alive)?"lose":"timeout", turn };
}

// ==================================================
// CANVAS RENDERER
// ==================================================
const ASSETS = path.join(__dirname, "../assets");
try { GlobalFonts.registerFromPath(path.join(ASSETS, "fonts/DejaVuSans.ttf"), "DejaVu"); } catch {}
const imageCache = new Map();
async function image(fp) { if (!imageCache.has(fp)) imageCache.set(fp, await loadImage(fp)); return imageCache.get(fp); }
function roundRect(ctx,x,y,w,h,r,fill) { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=fill; ctx.fill(); }
function bar(ctx,x,y,w,h,value,max,fill) { roundRect(ctx,x,y,w,h,h/2,"rgba(0,0,0,.45)"); const ww=Math.max(0,w*clamp(value/Math.max(1,max),0,1)); if(ww>0) roundRect(ctx,x,y,ww,h,h/2,fill); }
async function drawDungeonCard({map,diffName,floor,totalFloors,party,enemies,turn}) {
  const W=1000,H=520, canvas=createCanvas(W,H), ctx=canvas.getContext("2d");
  try { const bg=await image(path.join(ASSETS,"backgrounds",map.file)); const scale=Math.max(W/bg.width,H/bg.height); ctx.drawImage(bg,(W-bg.width*scale)/2,(H-bg.height*scale)/2,bg.width*scale,bg.height*scale); }
  catch { ctx.fillStyle="#111"; ctx.fillRect(0,0,W,H); }
  ctx.fillStyle="rgba(0,0,0,.38)"; ctx.fillRect(0,0,W,H);
  roundRect(ctx,20,18,960,68,16,"rgba(0,0,0,.58)");
  ctx.font="bold 26px DejaVu"; ctx.fillStyle="#fff"; ctx.fillText(`${map.name} • ${diffName}`,40,50);
  ctx.font="16px DejaVu"; ctx.fillStyle="rgba(255,255,255,.82)"; ctx.fillText(`Tầng ${floor}/${totalFloors}${turn?` • Lượt ${turn}`:""}`,40,74);
  const drawSide=async(list,x,title,color)=>{
    roundRect(ctx,x,105,460,385,18,"rgba(0,0,0,.5)"); ctx.font="bold 20px DejaVu"; ctx.fillStyle=color; ctx.fillText(title,x+18,136);
    const rows=(list||[]).slice(0,3); let y=158;
    for(const e of rows) {
      roundRect(ctx,x+14,y,432,94,14,"rgba(255,255,255,.07)");
      ctx.font="bold 17px DejaVu"; ctx.fillStyle=e.alive===false?"rgba(255,255,255,.5)":"#fff"; ctx.fillText(String(e.name||"?").slice(0,30),x+28,y+27);
      ctx.font="13px DejaVu"; ctx.fillStyle="rgba(255,255,255,.7)"; ctx.fillText(`Lv ${e.level||0} • ${String(e.realm||"").replace(" - Tầng "," • Tầng ")}`,x+28,y+48);
      bar(ctx,x+28,y+60,275,12,e.hp,e.stats?.maxHp||1,e.kind==="player"?"#2ecc71":"#e74c3c");
      ctx.font="12px DejaVu"; ctx.fillStyle="#fff"; ctx.fillText(`${Math.max(0,Math.round(e.hp||0))}/${Math.max(1,Math.round(e.stats?.maxHp||1))}`,x+315,y+70);
      if(e.kind==="player") { bar(ctx,x+28,y+77,275,9,e.mp,e.stats?.maxMp||1,"#3498db"); }
      y+=108;
    }
    if(!rows.length){ctx.font="16px DejaVu";ctx.fillStyle="rgba(255,255,255,.55)";ctx.fillText("(trống)",x+28,180);}
  };
  await drawSide(party,20,"ĐỘI HÌNH","#a5d6ff"); await drawSide(enemies,520,"MA VẬT","#ffb3b3");
  return canvas.toBuffer("image/png");
}

// ==================================================
// DUNGEON FLOW
// ==================================================
const LOBBY_TTL_MS=10*60*1000;
const activeTeamOfUser=new Map(); const lobbies=new Map();
const MAPS=[
  {key:"forest",name:"Thanh Lâm Cổ Động",file:"forest.png"},{key:"lava",name:"Hỏa Ngục Nham Uyên",file:"lava.png"},{key:"ocean",name:"Hàn Hải Long Cung",file:"ocean.png"},{key:"default",name:"Vô Danh Tàn Điện",file:"default.png"},{key:"black",name:"Hắc Vực Ma Quật",file:"black.png"},{key:"sakura",name:"Bích Anh Hoa Lộ",file:"sakura.png"},{key:"skytemple",name:"Vân Thiên Tiên Các",file:"skytemple.png"},{key:"ruins",name:"Cổ Tự Tàn Tích",file:"ruins.png"},{key:"ice",name:"Hàn Băng U Cốc",file:"ice.png"},{key:"desert",name:"Hoàng Sa Di Tích",file:"desert.png"},
];
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function ensureMining(user){user.mining=user.mining||{};user.mining.ores=user.mining.ores&&typeof user.mining.ores==="object"?user.mining.ores:{};}
function pickDifficulty(){const r=Math.random();return r<.55?"easy":r<.85?"hard":"extreme";}
function pickFloors(d){return d==="easy"?rand(3,6):d==="hard"?rand(5,8):rand(7,10);}
function moneyPerFloor(d){return d==="easy"?220:d==="hard"?360:520;}
function penaltyOnWipe(d){return d==="easy"?800:d==="hard"?1400:2200;}
function oreDropBonus(d){return d==="easy"?0:d==="hard"?4:8;}
function shardRates(d,b){const r=d==="easy"?8:d==="hard"?11:15,e=d==="easy"?1:d==="hard"?1.6:2.2;return{rare:b?r*1.6:r,epic:b?e*2.8:e};}
function oreRates(d,b){const x=d==="easy"?8:d==="hard"?10:12;return b?x*2.4:x;}
function buildLobbyEmbed(lobby,users){const list=[...lobby.members].map(uid=>`• <@${uid}> — **${users[uid]?.realm||"?"}** • ${elements.display?.[users[uid]?.element]||"?"}`).join("\n");return new EmbedBuilder().setTitle("🏯 Dungeon • Tạo đội").setColor(0x9b59b6).setDescription(`Host: <@${lobby.hostId}>\nĐội tối đa **3** đạo hữu.\n\n**Danh sách:**\n${list||"(Trống)"}`).setFooter({text:`Lobby: ${lobby.id}`});}
function lobbyButtons(disabled=false){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dg_join").setLabel("Gia nhập").setStyle(ButtonStyle.Success).setDisabled(disabled),new ButtonBuilder().setCustomId("dg_leave").setLabel("Rời đội").setStyle(ButtonStyle.Secondary).setDisabled(disabled),new ButtonBuilder().setCustomId("dg_start").setLabel("Bắt đầu").setStyle(ButtonStyle.Primary).setDisabled(disabled),new ButtonBuilder().setCustomId("dg_cancel").setLabel("Hủy").setStyle(ButtonStyle.Danger).setDisabled(disabled));}
async function edit(msg,payload){try{return await msg.edit(payload);}catch{return null;}}

async function startRun({lobbyMessage,lobby,users}){
  const memberIds=[...lobby.members]; const party=memberIds.map(uid=>users[uid]?makePlayerEntity(uid,users[uid]):null).filter(Boolean); if(!party.length)return;
  const map=MAPS[rand(0,MAPS.length-1)],diff=pickDifficulty(),dm=diffMeta(diff),floors=pickFloors(diff); let totalLt=0; const drops=[];
  for(let floor=1;floor<=floors;floor++){
    const isBoss=floor===floors,enemies=generateEnemies({party,mapKey:map.key,diff,floor,isBoss}); const {outcome,turn}=simulateBattle({party,enemies,maxTurns:60});
    if(outcome!=="win"){
      const penalty=penaltyOnWipe(diff); for(const uid of memberIds)users[uid].lt=Math.max(0,(users[uid].lt||0)-penalty);
      const cleared=Math.max(0,floor-1),titleLines=[]; if(cleared)for(const uid of memberIds){recordQuestEvent(users[uid],"dungeon_floor",cleared);const ts=recordAchievementEvent(users[uid],"dungeon_floor",cleared)||[];if(ts.length)titleLines.push(`• <@${uid}>: ${ts.join(", ")}`);}
      saveUsers(users); const png=await drawDungeonCard({map,diffName:dm.name,floor,totalFloors:floors,party,enemies,turn});
      const emb=new EmbedBuilder().setTitle("💀 Đội hình tan tác").setColor(0x992d22).setDescription(`**${map.name}** • **${dm.name}**\nThất bại tầng **${floor}/${floors}** • mỗi người -**${penalty} LT**${titleLines.length?`\n\n🎖 ${titleLines.join("\n")}`:""}`).setImage("attachment://dungeon.png");
      await edit(lobbyMessage,{embeds:[emb],files:[new AttachmentBuilder(png,{name:"dungeon.png"})],components:[]});return;
    }
    totalLt+=moneyPerFloor(diff);
    if(Math.random()*100<oreRates(diff,isBoss)){const ore=rollOre({bonusRare:oreDropBonus(diff)});if(ore)drops.push({type:"ore",oreId:ore.id,oreName:ore.name,tier:ore.tier});}
    const sr=shardRates(diff,isBoss);if(Math.random()*100<sr.rare){const p=party[rand(0,party.length-1)];drops.push({type:"shard",element:p.element||"kim",rarity:"rare"});}if(Math.random()*100<sr.epic){const p=party[rand(0,party.length-1)];drops.push({type:"shard",element:p.element||"kim",rarity:"epic"});}
    if(floor<floors){const png=await drawDungeonCard({map,diffName:dm.name,floor,totalFloors:floors,party,enemies:[],turn});const emb=new EmbedBuilder().setTitle(`✅ Thông quan • Tầng ${floor}/${floors}`).setColor(dm.color).setDescription(`**${map.name}** • **${dm.name}**\nTạm tích lũy: **${totalLt} LT**`).setImage("attachment://dungeon.png");await edit(lobbyMessage,{embeds:[emb],files:[new AttachmentBuilder(png,{name:"dungeon.png"})],components:[]});await sleep(rand(550,850));}
  }
  const per=Math.floor(totalLt/party.length),rem=totalLt-per*party.length,order=shuffle([...memberIds]);for(let i=0;i<order.length;i++)users[order[i]].lt=(users[order[i]].lt||0)+per+(i<rem?1:0);
  const dropLog=[];for(const [i,d] of shuffle([...drops]).entries()){const uid=order[i%order.length];if(d.type==="ore"){ensureMining(users[uid]);users[uid].mining.ores[d.oreId]=(users[uid].mining.ores[d.oreId]||0)+1;dropLog.push(`• <@${uid}> nhận ${tierMeta(d.tier).icon} **${d.oreName}** _(${tierText(d.tier)})_`);}else{ensureUserSkills(users[uid]);addShard(users[uid],d.element,d.rarity,1);dropLog.push(`• <@${uid}> nhận **Mảnh bí kíp** (${elements.display[d.element]||d.element} • ${d.rarity==="epic"?"Cực hiếm":"Hiếm"})`);}}
  const unlock=[];for(const uid of memberIds){recordQuestEvent(users[uid],"dungeon_floor",floors);const ts=recordAchievementEvent(users[uid],"dungeon_floor",floors)||[];if(ts.length)unlock.push(`• <@${uid}>: ${ts.join(", ")}`);}saveUsers(users);
  const png=await drawDungeonCard({map,diffName:dm.name,floor:floors,totalFloors:floors,party,enemies:[],turn:0});const emb=new EmbedBuilder().setTitle("🏆 Xuất Quan").setColor(dm.color).setDescription(`Tổng thưởng: **${totalLt} LT** (chia đều).\n${dropLog.length?`\n**Chiến lợi phẩm:**\n${dropLog.join("\n")}`:"\n**Chiến lợi phẩm:** _không có_"}${unlock.length?`\n\n🎖 **Danh hiệu:**\n${unlock.join("\n")}`:""}`).setImage("attachment://dungeon.png");await edit(lobbyMessage,{embeds:[emb],files:[new AttachmentBuilder(png,{name:"dungeon.png"})],components:[]});
}

const dungeonCommand={
  name:"dungeon",aliases:["dg"],description:"Dungeon cinematic (tạo đội 1-3).",
  run:async(_client,msg)=>{
    const users=loadUsers();if(!users[msg.author.id])return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");if(activeTeamOfUser.has(msg.author.id))return msg.reply("⚠️ Đạo hữu đang ở trong một đội khác.");
    const id=randomUUID().replace(/-/g,"").slice(0,6),lobby={id,hostId:msg.author.id,channelId:msg.channel.id,members:new Set([msg.author.id]),started:false};activeTeamOfUser.set(msg.author.id,id);lobbies.set(id,lobby);
    const reply=await msg.reply({embeds:[buildLobbyEmbed(lobby,users)],components:[lobbyButtons()]});const col=reply.createMessageComponentCollector({time:LOBBY_TTL_MS});
    col.on("collect",async i=>{if(i.message.id!==reply.id)return;const all=loadUsers();if(!all[i.user.id])return i.reply({content:"❌ Đạo hữu chưa nhập đạo.",ephemeral:true});await i.deferUpdate();const l=lobbies.get(id);if(!l||l.started)return;
      if(i.customId==="dg_join"){if(l.members.has(i.user.id))return;if(l.members.size>=3)return i.followUp({content:"⚠️ Đội đã đủ 3 người.",ephemeral:true});if(activeTeamOfUser.has(i.user.id))return i.followUp({content:"⚠️ Đạo hữu đang ở đội khác.",ephemeral:true});l.members.add(i.user.id);activeTeamOfUser.set(i.user.id,id);}
      if(i.customId==="dg_leave"){if(!l.members.has(i.user.id))return;if(i.user.id===l.hostId){col.stop("cancel");return;}l.members.delete(i.user.id);activeTeamOfUser.delete(i.user.id);}
      if(i.customId==="dg_cancel"){if(i.user.id===l.hostId)col.stop("cancel");return;}if(i.customId==="dg_start"){if(i.user.id===l.hostId)col.stop("start");return;}
      await edit(reply,{embeds:[buildLobbyEmbed(l,loadUsers())],components:[lobbyButtons()]});
    });
    col.on("end",async(_,reason)=>{const all=loadUsers(),l=lobbies.get(id),members=l?[...l.members]:[];for(const uid of members)activeTeamOfUser.delete(uid);lobbies.delete(id);if(!l)return;if(reason==="start"){l.started=true;await edit(reply,{embeds:[buildLobbyEmbed(l,all)],components:[lobbyButtons(true)]});return startRun({lobbyMessage:reply,lobby:l,users:all});}await edit(reply,{embeds:[new EmbedBuilder().setTitle("🏯 Dungeon").setColor(0x7f8c8d).setDescription(reason==="cancel"?"Lobby đã bị hủy.":"Lobby đã hết hạn.")],components:[]});});
  }
};

module.exports={commands:[dungeonCommand],computeEffective};
