// commands/cau.js
const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers } = require("../utils/storage");
const { addLT } = require("../utils/currency");
const { addXp } = require("../utils/xp");

// --- Tải CSDL cá ---
let FISH_DB = [];
try {
  FISH_DB = require(path.join(__dirname, "../data/fish_db.json"));
  if (!Array.isArray(FISH_DB) || FISH_DB.length < 100) throw new Error("fish_db invalid");
} catch (e) {
  console.error("❌ Không thể tải data/fish_db.json:", e?.message || e);
}

/** Pick weighted item */
function pickWeighted(list, weightField = "weight") {
  const total = list.reduce((s, it) => s + (it[weightField] || 1), 0);
  let r = Math.random() * total;
  for (const it of list) {
    r -= (it[weightField] || 1);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

const COOLDOWN_MS = 30_000;
const REACTION_WINDOW_MS = 1600;
const cooldown = new Map();

const RARITY_MUL = {
  "thường": 1.0,
  "khá": 1.25,
  "hiếm": 1.6,
  "cực hiếm": 2.25,
  "truyền thuyết": 3.0,
};

function calcReward(baseLT, size, fish) {
  const rarityMul = RARITY_MUL[fish.rarity] || 1.0;
  // sizeMul: chuẩn hóa về [0,1] theo khoảng size, scale nhẹ ±15%
  const minS = fish.minSizeCm || 1, maxS = Math.max(fish.maxSizeCm || 1, minS + 1);
  const norm = Math.min(1, Math.max(0, (size - minS) / (maxS - minS)));
  const sizeMul = 0.85 + norm * 0.3; // 0.85 → 1.15

  return Math.max(1, Math.round(baseLT * rarityMul * sizeMul));
}

module.exports = {
  name: "cau",
  aliases: ["cauca", "fish"],
  description: "Câu cá kiếm LT + EXP. Dùng: -cau [song|ho|bien]",
  run: async (client, msg, args) => {
    if (!FISH_DB.length) return msg.reply("❌ Thiếu dữ liệu cá (data/fish_db.json). Hãy thêm file vào thư mục `data/`.");

    // kiểm tra user đã tạo nhân vật chưa
    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` để bắt đầu!");

    // cooldown
    const last = cooldown.get(msg.author.id) || 0;
    const now = Date.now();
    const remain = last + COOLDOWN_MS - now;
    if (remain > 0) {
      return msg.reply(`⏳ Hãy nghỉ tay **${Math.ceil(remain / 1000)}s** rồi câu tiếp nhé.`);
    }

    const arg = (args[0] || "").toLowerCase();
    const validSpots = ["song", "ho", "bien"];
    const spotKey = validSpots.includes(arg) ? arg : validSpots[Math.floor(Math.random() * validSpots.length)];

    const pool = FISH_DB.filter(f => (f.habitats || []).includes(spotKey));
    if (!pool.length) return msg.reply("❌ Data cá không có loài phù hợp bãi câu.");

    const hookId = `hook_${msg.author.id}_${now}`;
    const waitMs = 1500 + Math.floor(Math.random() * 2000); // 1.5–3.5s

    const baseEmbed = new EmbedBuilder()
      .setTitle("🎣 Câu cá")
      .setDescription(`Bạn thả cần ở **${spotKey === "song" ? "bờ sông" : spotKey === "ho" ? "mặt hồ" : "bờ biển"}**...\nĐợi cá cắn đã nha...`)
      .setFooter({ text: "Mẹo: Nhấn 'Giật cần!' thật nhanh khi nút sáng để bắt cá lớn." });

    const rowDisabled = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(hookId).setLabel("🎣 Giật cần!").setStyle(ButtonStyle.Primary).setDisabled(true)
    );

    const sent = await msg.reply({ embeds: [baseEmbed], components: [rowDisabled] });

    // bật nút khi cá cắn
    setTimeout(async () => {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(hookId).setLabel("🎣 Giật cần!").setStyle(ButtonStyle.Success)
      );
      try { await sent.edit({ components: [row] }); } catch {}

      let clicked = false;
      const collector = sent.createMessageComponentCollector({ time: REACTION_WINDOW_MS });

      collector.on("collect", async (i) => {
        if (i.customId !== hookId) return;
        if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải cần câu của bạn!", ephemeral: true });
        clicked = true;
        await i.deferUpdate();
      });

      collector.on("end", async () => {
        try { await sent.edit({ components: [] }); } catch {}

        // chọn loài cá theo trọng số
        const fish = pickWeighted(pool, "weight");
        const size = fish.minSizeCm && fish.maxSizeCm
          ? Math.floor(fish.minSizeCm + Math.random() * (fish.maxSizeCm - fish.minSizeCm + 1))
          : 0;

        // thưởng
        const lt = calcReward(fish.baseLT || 8, size, fish) * (clicked ? 1.25 : 1.0);
        const ltFinal = Math.max(1, Math.round(lt));
        const xp = Math.max(5, Math.round(ltFinal / 3));

        addLT(msg.author.id, ltFinal);
        addXp(msg.author.id, xp);
        // --- Lưu cá vào bộ sưu tập (Fish Inventory + Fishdex) ---
if (!me.fishInventory) me.fishInventory = {};
if (!me.fishdex) me.fishdex = {};

const fishId = fish.id;

// tăng số lượng cá trong kho
me.fishInventory[fishId] = (me.fishInventory[fishId] || 0) + 1;

// cập nhật fishdex
if (!me.fishdex[fishId]) me.fishdex[fishId] = { count: 0, maxSize: 0 };
me.fishdex[fishId].count += 1;
if (size > (me.fishdex[fishId].maxSize || 0)) {
    me.fishdex[fishId].maxSize = size;
}

// lưu lại
const all = loadUsers();
all[msg.author.id] = me;
require("../utils/storage").saveUsers(all);


        const lines = [];
        if (!clicked) lines.push("⚠️ Bạn **giật hơi trễ** — cá ít giá trị hơn.");
        lines.push(`${fish.emoji || "🐟"} **${fish.name}** ${size ? `(${size} cm)` : ""} • hạng *${fish.rarity}*`);
        lines.push(`💎 Thưởng **${ltFinal} LT**  •  ✨ **+${xp} EXP**`);

        const resEmbed = new EmbedBuilder()
          .setTitle(clicked ? "🟢 Trúng lớn!" : "🟡 Dính cá!")
          .setDescription(lines.join("\n"))
          .setFooter({ text: `Bãi câu: ${spotKey} • Cooldown 30s` });

        await msg.channel.send({ embeds: [resEmbed] }).catch(()=>{});
        cooldown.set(msg.author.id, Date.now());
      });
    }, waitMs);
  },
};
