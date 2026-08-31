const path = require("path");
const { randomInt } = require("crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const REALMS = require("../utils/realms");

// ==================================================
// PET ENGINE
// ==================================================
let ORES_DB = [];
try {
  ORES_DB = require(path.join(__dirname, "../data/ores_db.json"));
  if (!Array.isArray(ORES_DB) || ORES_DB.length < 5) throw new Error("ores_db invalid");
} catch (e) {
  console.error("❌ Không thể tải data/ores_db.json:", e?.message || e);
  ORES_DB = [];
}

const PET_TICK_INTERVAL_MS = 10 * 60 * 1000;
const PET_MAX_OFFLINE_MS = 12 * 60 * 60 * 1000;
const PET_EGG_ITEM_ID = "pet_egg_basic";
const HATCH_RATE_PET = 0.10;
const HATCH_RATE_SHARD = 0.55;
const SHARDS_PER_PET = 10;
const LEVELS_PER_REALM = 10;
const MAX_HUNGER = 100;
const MAX_STAMINA = 100;
const WORK_DRAIN_HUNGER = 1;
const WORK_DRAIN_STAMINA = 1;
const REST_GAIN_STAMINA = 2;
const REST_DRAIN_HUNGER = 1;
const FEED_XP_MULT = 3;
const JOBS = ["mine", "explore", "rest"];

const PETS = [
  { id: "han_bang_ky_lan", name: "Hàn Băng Kỳ Lân", element: "thuy", image: "assets/pets/han_bang_ky_lan.png", mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 0 } },
  { id: "huyet_nguyet_linh_ho", name: "Huyết Nguyệt Linh Hồ", element: "hoa", image: "assets/pets/huyet_nguyet_linh_ho.png", mods: { shardBonusPct: 20, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 0 } },
  { id: "loi_minh_ung_vuong", name: "Lôi Minh Ưng Vương", element: "kim", image: "assets/pets/loi_minh_ung_vuong.png", mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 0, exploreLtBonusPct: 15 } },
  { id: "thanh_moc_tieu_long", name: "Thanh Mộc Tiểu Long", element: "moc", image: "assets/pets/thanh_moc_tieu_long.png", mods: { shardBonusPct: 0, mineTierBonus: 1, restStaminaBonus: 0, exploreLtBonusPct: 0 } },
  { id: "kim_diem_phuong_hoang", name: "Kim Diễm Phượng Hoàng", element: "hoa", image: "assets/pets/kim_diem_phuong_hoang.png", mods: { shardBonusPct: 0, mineTierBonus: 0, restStaminaBonus: 1, exploreLtBonusPct: 0 } },
];
const PET_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p]));

function clampInt(n, lo, hi) {
  n = Math.floor(Number(n) || 0);
  return Math.max(lo, Math.min(hi, n));
}
function getPetLevelCap(realm) {
  return Math.max(1, Math.floor(Number(realm) || 1)) * LEVELS_PER_REALM;
}
function listPets() { return PETS.slice(); }
function getPetMeta(id) { return PET_BY_ID[id] || null; }
function getPetImagePath(id) {
  const meta = getPetMeta(id);
  return meta?.image ? path.join(__dirname, "..", meta.image) : null;
}
function ensurePetShape(user) {
  if (!user) return null;
  user.pet = user.pet && typeof user.pet === "object" ? user.pet : {};
  if (typeof user.pet.activePetId === "undefined") user.pet.activePetId = null;
  user.pet.pets = user.pet.pets && typeof user.pet.pets === "object" ? user.pet.pets : {};
  user.pet.shards = user.pet.shards && typeof user.pet.shards === "object" ? user.pet.shards : {};
  if (!Number.isFinite(user.pet.feedBufferXp)) user.pet.feedBufferXp = 0;
  user.mining = user.mining && typeof user.mining === "object" ? user.mining : {};
  user.mining.ores = user.mining.ores && typeof user.mining.ores === "object" ? user.mining.ores : {};

  for (const id of Object.keys(user.pet.pets)) {
    const st = user.pet.pets[id];
    if (!st || typeof st !== "object") { delete user.pet.pets[id]; continue; }
    st.count = Math.max(0, Math.floor(Number(st.count) || 0));
    st.realm = Math.max(1, Math.floor(Number(st.realm) || 1));
    st.level = Math.max(1, Math.floor(Number(st.level) || 1));
    st.xp = Math.max(0, Math.floor(Number(st.xp) || 0));
    st.hunger = clampInt(Number.isFinite(st.hunger) ? st.hunger : 80, 0, MAX_HUNGER);
    st.stamina = clampInt(Number.isFinite(st.stamina) ? st.stamina : 80, 0, MAX_STAMINA);
    if (!JOBS.includes(st.job)) st.job = "rest";
    if (!Number.isFinite(st.lastTickAt)) st.lastTickAt = Date.now();
  }
  for (const id of Object.keys(user.pet.shards)) {
    const n = Math.floor(Number(user.pet.shards[id]) || 0);
    if (n <= 0) delete user.pet.shards[id]; else user.pet.shards[id] = n;
  }
  if (user.pet.activePetId) {
    const st = user.pet.pets[user.pet.activePetId];
    if (!st || st.count <= 0) user.pet.activePetId = null;
  }
  return user;
}
function xpToNextLevel(level, realm) {
  return 60 + Math.max(1, Math.floor(level || 1)) * 25 + (Math.max(1, Math.floor(realm || 1)) - 1) * 20;
}
function applyPetLevelUp(st) {
  let leveled = 0;
  const cap = Math.min(getPetLevelCap(st.realm), 999);
  while (st.level < cap && st.xp >= xpToNextLevel(st.level, st.realm)) {
    st.xp -= xpToNextLevel(st.level, st.realm);
    st.level++;
    leveled++;
  }
  return leveled;
}
function addPetCount(user, id, amount) {
  ensurePetShape(user);
  if (!PET_BY_ID[id]) return;
  if (!user.pet.pets[id]) user.pet.pets[id] = { count: 0, realm: 1, level: 1, xp: 0, hunger: 80, stamina: 80, job: "rest", lastTickAt: Date.now() };
  user.pet.pets[id].count = Math.max(0, user.pet.pets[id].count + amount);
  if (!user.pet.activePetId && user.pet.pets[id].count > 0) user.pet.activePetId = id;
}
function convertShardsIfPossible(user, id) {
  ensurePetShape(user);
  const cur = user.pet.shards[id] || 0;
  if (cur < SHARDS_PER_PET) return 0;
  const made = Math.floor(cur / SHARDS_PER_PET);
  user.pet.shards[id] = cur - made * SHARDS_PER_PET;
  if (user.pet.shards[id] <= 0) delete user.pet.shards[id];
  addPetCount(user, id, made);
  return made;
}
function addShards(user, id, amount) {
  ensurePetShape(user);
  if (!PET_BY_ID[id]) return;
  user.pet.shards[id] = (user.pet.shards[id] || 0) + Math.max(0, Math.floor(amount || 0));
  convertShardsIfPossible(user, id);
}
function applyFeedBufferToActive(user) {
  ensurePetShape(user);
  const id = user.pet.activePetId;
  if (!id || !user.pet.pets[id]) return 0;
  const buf = Math.floor(user.pet.feedBufferXp || 0);
  if (buf <= 0) return 0;
  user.pet.pets[id].xp += buf;
  applyPetLevelUp(user.pet.pets[id]);
  user.pet.feedBufferXp = 0;
  return buf;
}
function equipPet(user, id) {
  ensurePetShape(user);
  const st = user.pet.pets[id];
  if (!st || st.count <= 0) return { ok: false, message: "❌ Đạo hữu không sở hữu linh thú này." };
  user.pet.activePetId = id;
  const applied = applyFeedBufferToActive(user);
  return { ok: true, message: `✅ Đã trang bị **${getPetMeta(id)?.name || id}**.${applied ? ` (+${applied} XP từ cá tồn đọng)` : ""}` };
}
function setPetJob(user, job) {
  ensurePetShape(user);
  if (!JOBS.includes(job)) return { ok: false, message: "❌ Job không hợp lệ." };
  const id = user.pet.activePetId;
  if (!id) return { ok: false, message: "❌ Đạo hữu chưa cho linh thú xuất chiến." };
  user.pet.pets[id].job = job;
  return { ok: true, message: `✅ Linh thú chuyển sang **${job}**.` };
}
function breakthroughPet(user, petId) {
  ensurePetShape(user);
  const id = petId || user.pet.activePetId;
  const st = id ? user.pet.pets[id] : null;
  if (!st || st.count <= 0) return { ok: false, message: "❌ Đạo hữu chưa có linh thú hợp lệ để đột phá." };
  const cap = getPetLevelCap(st.realm);
  if (st.level < cap) return { ok: false, message: `❌ Linh thú chưa đủ cấp để đột phá. (Lv ${st.level}/${cap})` };
  const needTotal = st.realm + 1;
  const consume = st.realm;
  if (st.count < needTotal) return { ok: false, message: `❌ Cần tổng **${needTotal}** bản (hiện có ${st.count}).` };
  st.count -= consume;
  st.realm++;
  applyPetLevelUp(st);
  return { ok: true, message: `✅ **${getPetMeta(id)?.name || id}** đột phá thành công! (tiêu hao ${consume} bản)` };
}
function feedPetFromFish(user, fish, sizeCm, xpOverride) {
  ensurePetShape(user);
  const rarity = String(fish?.rarity || "thường").toLowerCase();
  const xpMap = { "thường": 6, "khá": 10, "hiếm": 15, "cực hiếm": 22, "phàm": 6, "linh": 10, "hoàng": 13, "huyền": 15, "địa": 22 };
  const hungerMap = { "thường": 1, "khá": 2, "hiếm": 3, "cực hiếm": 4, "phàm": 1, "linh": 2, "hoàng": 2, "huyền": 3, "địa": 4 };
  const computed = Math.max(1, (xpMap[rarity] ?? 6) + (Number(sizeCm) > 0 ? Math.min(8, Math.floor(sizeCm / 10)) : 0));
  const rawXp = Number(xpOverride) > 0 ? Math.floor(xpOverride) : computed;
  const xpGain = Math.max(1, Math.floor(rawXp * FEED_XP_MULT));
  const hungerGain = hungerMap[rarity] ?? 1;
  const id = user.pet.activePetId;
  if (!id || !user.pet.pets[id] || user.pet.pets[id].count <= 0) {
    user.pet.activePetId = null;
    user.pet.feedBufferXp = Math.min(50_000, (user.pet.feedBufferXp || 0) + xpGain);
    return { ok: true, buffered: true, xpGain, hungerGain: 0, petId: null, leveled: 0 };
  }
  const st = user.pet.pets[id];
  st.xp += xpGain;
  st.hunger = clampInt(st.hunger + hungerGain, 0, MAX_HUNGER);
  return { ok: true, buffered: false, xpGain, hungerGain, petId: id, leveled: applyPetLevelUp(st) };
}
function pickRandomPetId() { return PETS[randomInt(0, PETS.length)].id; }
function rollShardHit(bonusPct) {
  const base = 2;
  return randomInt(0, 100) < Math.max(0, base + Math.floor(base * (Number(bonusPct || 0) / 100)));
}
function calcExploreLt(realm, level, bonusPct) {
  const base = randomInt(3, 9);
  const mul = 1 + 0.08 * (Math.max(1, realm) - 1) + 0.02 * (Math.max(1, level) - 1);
  return Math.max(0, Math.floor(base * mul * (1 + Number(bonusPct || 0) / 100)));
}
function pickTierPool(realm) {
  const r = Math.max(1, realm);
  if (r <= 1) return ["pham", "linh"];
  if (r === 2) return ["pham", "linh", "hoang"];
  if (r === 3) return ["linh", "hoang", "huyen"];
  if (r === 4) return ["hoang", "huyen", "dia", "thien"];
  if (r === 5) return ["huyen", "dia", "thien", "tien"];
  return ["dia", "thien", "tien", "than"];
}
function pickOreForPet(realm, level, petId) {
  if (!ORES_DB.length) return null;
  const tierBonus = Number(getPetMeta(petId)?.mods?.mineTierBonus || 0);
  const candidates = ORES_DB.filter((o) => pickTierPool(Math.max(1, realm) + tierBonus).includes(o.tier));
  if (!candidates.length) return ORES_DB[0]?.id || null;
  let total = candidates.reduce((n, x) => n + Number(x.weight || 1), 0);
  let r = randomInt(1, Math.max(1, total) + 1);
  for (const it of candidates) { r -= Number(it.weight || 1); if (r <= 0) return it.id; }
  return candidates.at(-1).id;
}
function applyPetIdle(user, now = Date.now()) {
  ensurePetShape(user);
  const id = user.pet.activePetId;
  const st = id ? user.pet.pets[id] : null;
  if (!st || st.count <= 0) { if (id) user.pet.activePetId = null; return { ok: true, ticks: 0, summary: null }; }
  const last = Number.isFinite(st.lastTickAt) ? st.lastTickAt : now;
  const ticks = Math.floor(Math.min(Math.max(0, now - last), PET_MAX_OFFLINE_MS) / PET_TICK_INTERVAL_MS);
  if (ticks <= 0) return { ok: true, ticks: 0, summary: null };
  const mods = getPetMeta(id)?.mods || {};
  const summary = { job: st.job, ticksApplied: 0, ltGained: 0, ores: {}, shards: {}, stoppedBy: null };
  for (let i = 0; i < ticks; i++) {
    if (st.job === "rest") {
      st.stamina = clampInt(st.stamina + REST_GAIN_STAMINA + Number(mods.restStaminaBonus || 0), 0, MAX_STAMINA);
      st.hunger = clampInt(st.hunger - REST_DRAIN_HUNGER, 0, MAX_HUNGER);
      summary.ticksApplied++;
      continue;
    }
    if (st.stamina <= 0) { summary.stoppedBy = "stamina"; break; }
    if (st.hunger <= 0) { summary.stoppedBy = "hunger"; break; }
    st.stamina = clampInt(st.stamina - WORK_DRAIN_STAMINA, 0, MAX_STAMINA);
    st.hunger = clampInt(st.hunger - WORK_DRAIN_HUNGER, 0, MAX_HUNGER);
    if (st.job === "mine") {
      const oreId = pickOreForPet(st.realm, st.level, id);
      if (oreId) { user.mining.ores[oreId] = (user.mining.ores[oreId] || 0) + 1; summary.ores[oreId] = (summary.ores[oreId] || 0) + 1; }
    } else if (st.job === "explore") {
      const lt = calcExploreLt(st.realm, st.level, mods.exploreLtBonusPct || 0);
      user.lt = (Number(user.lt) || 0) + lt; summary.ltGained += lt;
      if (rollShardHit(mods.shardBonusPct || 0)) {
        const got = pickRandomPetId(); addShards(user, got, 1); summary.shards[got] = (summary.shards[got] || 0) + 1;
      }
    }
    summary.ticksApplied++;
  }
  st.lastTickAt = Math.min(now, last + summary.ticksApplied * PET_TICK_INTERVAL_MS);
  return summary.ticksApplied ? { ok: true, ticks: summary.ticksApplied, summary } : { ok: true, ticks: 0, summary: null };
}
function hatchEggs(user, count) {
  ensurePetShape(user);
  count = Math.max(1, Math.min(50, Math.floor(Number(count) || 1)));
  user.inventory = user.inventory || {};
  const have = user.inventory[PET_EGG_ITEM_ID] || 0;
  if (have < count) return { ok: false, message: "❌ Không đủ trứng." };
  user.inventory[PET_EGG_ITEM_ID] = have - count;
  if (user.inventory[PET_EGG_ITEM_ID] <= 0) delete user.inventory[PET_EGG_ITEM_ID];
  const result = { eggs: count, nothing: 0, pets: {}, shards: {}, crafted: {} };
  for (let i = 0; i < count; i++) {
    const roll = randomInt(0, 10000);
    const petCut = Math.floor(HATCH_RATE_PET * 10000);
    const shardCut = petCut + Math.floor(HATCH_RATE_SHARD * 10000);
    if (roll < petCut) {
      const id = pickRandomPetId(); addPetCount(user, id, 1); result.pets[id] = (result.pets[id] || 0) + 1;
    } else if (roll < shardCut) {
      const id = pickRandomPetId(); const amount = randomInt(1, 4); const before = user.pet.pets[id]?.count || 0;
      addShards(user, id, amount); result.shards[id] = (result.shards[id] || 0) + amount;
      const made = (user.pet.pets[id]?.count || 0) - before; if (made > 0) result.crafted[id] = (result.crafted[id] || 0) + made;
    } else result.nothing++;
  }
  return { ok: true, result };
}

// ==================================================
// PET UI
// ==================================================
function fmtLT(n) { return Number(n || 0).toLocaleString("vi-VN"); }
function petRealmLabel(realm) {
  const r = Math.max(1, Math.floor(Number(realm) || 1));
  return Array.isArray(REALMS) && REALMS[r - 1] ? `${REALMS[r - 1]} (C${r})` : `C${r}`;
}
function ownedPetsLines(user) {
  const ids = Object.keys(user.pet?.pets || {}).filter((id) => user.pet.pets[id]?.count > 0);
  return ids.length ? ids.map((id) => { const st = user.pet.pets[id]; return `• **${getPetMeta(id)?.name || id}** ×${st.count} (${petRealmLabel(st.realm)}, Lv${st.level}/${getPetLevelCap(st.realm)})`; }).join("\n") : "—";
}
function shardsLines(user) {
  const ids = Object.keys(user.pet?.shards || {}).filter((id) => user.pet.shards[id] > 0);
  return ids.length ? ids.map((id) => `• **${getPetMeta(id)?.name || id}**: ${user.pet.shards[id]}/${SHARDS_PER_PET}`).join("\n") : "—";
}
function actionMenuRow(id) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(id).setPlaceholder("Chọn một khu vực...").addOptions([
    { label: "Thông tin", value: "info" }, { label: "Ấp trứng", value: "hatch" }, { label: "Xuất chiến", value: "equip" }, { label: "Công việc", value: "job" }, { label: "Đột phá", value: "break" },
  ]));
}
function backRow(id) { return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel("⬅️ Quay lại").setStyle(ButtonStyle.Secondary)); }
function buildInfoEmbed(user, tick, attachName) {
  const id = user.pet.activePetId; const st = id ? user.pet.pets[id] : null; const meta = getPetMeta(id);
  const emb = new EmbedBuilder().setTitle("🐾 Linh Thú Đồng Hành").setColor(0xF1C40F)
    .setDescription(`Linh thạch: **${fmtLT(user.lt)}**\nTrứng linh thú: **${user.inventory?.[PET_EGG_ITEM_ID] || 0}**${user.pet.feedBufferXp ? `\nXP cá đang chờ: **${Math.floor(user.pet.feedBufferXp)}**` : ""}`)
    .addFields(
      { name: "⭐ Đang xuất chiến", value: st && meta ? `**${meta.name}**\n${petRealmLabel(st.realm)} • Lv${st.level}/${getPetLevelCap(st.realm)}\nĐói ${st.hunger}/100 • Thể lực ${st.stamina}/100 • ${st.job}` : "—", inline: false },
      { name: "📦 Linh thú", value: ownedPetsLines(user), inline: false },
      { name: "🧩 Mảnh", value: shardsLines(user), inline: false }
    );
  if (attachName) emb.setThumbnail(`attachment://${attachName}`);
  if (tick?.summary) {
    const s = tick.summary;
    emb.addFields({ name: "⏱️ Offline", value: `${s.ticksApplied} lượt • ${s.ltGained ? `+${fmtLT(s.ltGained)} LT • ` : ""}${Object.values(s.ores || {}).reduce((a,b)=>a+b,0)} khoáng • ${Object.values(s.shards || {}).reduce((a,b)=>a+b,0)} mảnh${s.stoppedBy ? ` • dừng: ${s.stoppedBy}` : ""}` });
  }
  return emb;
}

const petCommand = {
  name: "pet",
  aliases: ["linhthu", "thu"],
  description: "Linh thú: ấp trứng, xuất chiến, công việc, đột phá.",
  run: async (_client, msg) => {
    let all = loadUsers();
    if (!all[msg.author.id]) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    const baseId = `petui_${msg.author.id}_${Date.now()}`;
    let view = "info", lastNote = "", lastTick = null;

    const render = () => {
      all = loadUsers(); const u = all[msg.author.id]; ensurePetShape(u);
      lastTick = applyPetIdle(u, Date.now());
      if (lastTick.ticks > 0) { all[msg.author.id] = u; saveUsers(all); }
      let files = [], attachName = null;
      if (u.pet.activePetId) {
        const p = getPetImagePath(u.pet.activePetId);
        if (p) { attachName = path.basename(p); try { files = [new AttachmentBuilder(p)]; } catch {} }
      }
      let embed = buildInfoEmbed(u, lastTick, attachName);
      const rows = [actionMenuRow(`${baseId}:action`)];
      if (view === "hatch") {
        embed = new EmbedBuilder().setTitle("🥚 Ấp Trứng Linh Thú").setColor(0x9B59B6).setDescription(`Đang có **${u.inventory?.[PET_EGG_ITEM_ID] || 0}** trứng.`);
        rows.push(new ActionRowBuilder().addComponents(...[1,5,10,25].map((n) => new ButtonBuilder().setCustomId(`${baseId}:hatch:${n}`).setLabel(`🥚 ×${n}`).setStyle(ButtonStyle.Primary).setDisabled((u.inventory?.[PET_EGG_ITEM_ID] || 0) < n))));
      } else if (view === "equip") {
        const ids = Object.keys(u.pet.pets).filter((id) => u.pet.pets[id].count > 0);
        embed = new EmbedBuilder().setTitle("⭐ Linh Thú Xuất Chiến").setColor(0x2ECC71).setDescription(`Đang dùng: **${getPetMeta(u.pet.activePetId)?.name || "—"}**`);
        if (ids.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${baseId}:equip`).setPlaceholder("Chọn linh thú...").addOptions(ids.slice(0,25).map((id) => ({ label: `${getPetMeta(id)?.name || id} ×${u.pet.pets[id].count}`.slice(0,100), value: id })))));
      } else if (view === "job") {
        const st = u.pet.activePetId ? u.pet.pets[u.pet.activePetId] : null;
        embed = new EmbedBuilder().setTitle("🧭 Công Việc").setColor(0x3498DB).setDescription(`Hiện tại: **${st?.job || "—"}**`);
        rows.push(new ActionRowBuilder().addComponents(...[["mine","⛏️ Khai khoáng"],["explore","🧭 Thăm dò"],["rest","😴 Nghỉ ngơi"]].map(([job,label]) => new ButtonBuilder().setCustomId(`${baseId}:job:${job}`).setLabel(label).setStyle(st?.job === job ? ButtonStyle.Success : ButtonStyle.Primary))));
      } else if (view === "break") {
        const st = u.pet.activePetId ? u.pet.pets[u.pet.activePetId] : null;
        const cap = st ? getPetLevelCap(st.realm) : 0; const need = st ? st.realm + 1 : 0;
        embed = new EmbedBuilder().setTitle("⬆️ Đột phá").setColor(0xE67E22).setDescription(st ? `**${getPetMeta(u.pet.activePetId)?.name}**\nLv ${st.level}/${cap} • cần ${need} bản • hiện ${st.count}` : "Chưa có linh thú xuất chiến.");
        rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${baseId}:break`).setLabel("⬆️ Đột phá").setStyle(ButtonStyle.Danger).setDisabled(!st || st.level < cap || st.count < need)));
      }
      if (view !== "info") rows.push(backRow(`${baseId}:back`));
      if (lastNote) embed.setFooter({ text: lastNote });
      return { embeds: [embed], components: rows, files };
    };

    const sent = await msg.reply(render());
    const col = sent.createMessageComponentCollector({ time: 180_000 });
    col.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải linh thú giới của đạo hữu.", ephemeral: true });
      if (!String(i.customId).startsWith(baseId)) return;
      await i.deferUpdate();
      all = loadUsers(); const u = all[msg.author.id]; ensurePetShape(u);
      if (i.customId === `${baseId}:action` && i.isStringSelectMenu()) { view = i.values[0] || "info"; lastNote = ""; return sent.edit(render()); }
      if (i.customId === `${baseId}:back`) { view = "info"; lastNote = ""; return sent.edit(render()); }
      if (i.customId.startsWith(`${baseId}:hatch:`)) {
        const res = hatchEggs(u, Number(i.customId.split(":").at(-1))); lastNote = res.ok ? `Ấp ${res.result.eggs} trứng • trắng tay ${res.result.nothing}` : res.message;
      } else if (i.customId === `${baseId}:equip` && i.isStringSelectMenu()) {
        const res = equipPet(u, i.values[0]); lastNote = res.message; view = "info";
      } else if (i.customId.startsWith(`${baseId}:job:`)) {
        const res = setPetJob(u, i.customId.split(":").at(-1)); lastNote = res.message; view = "info";
      } else if (i.customId === `${baseId}:break`) {
        const res = breakthroughPet(u); lastNote = res.message; view = "info";
      }
      all[msg.author.id] = u; saveUsers(all);
      return sent.edit(render()).catch(() => {});
    });
    col.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};

module.exports = {
  commands: [petCommand],
  PET_EGG_ITEM_ID,
  PET_TICK_INTERVAL_MS,
  PET_MAX_OFFLINE_MS,
  SHARDS_PER_PET,
  getPetLevelCap,
  listPets,
  getPetMeta,
  getPetImagePath,
  ensurePetShape,
  applyPetIdle,
  feedPetFromFish,
  hatchEggs,
  equipPet,
  setPetJob,
  breakthroughPet,
};
