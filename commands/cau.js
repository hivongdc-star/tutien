// commands/cau.js
const path = require("path");
const { randomInt } = require("crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
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

/** Pick weighted item (integer weights) */
function pickWeightedInt(list, weightField = "weight") {
  let total = 0;
  for (const it of list) total += Number(it?.[weightField] ?? 1);
  if (!Number.isFinite(total) || total <= 0) return list[0];

  // randomInt(min, max) => [min, max)
  let r = randomInt(1, total + 1); // 1..total
  for (const it of list) {
    r -= Number(it?.[weightField] ?? 1);
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}


// Tăng nhẹ tỷ lệ gặp cá phẩm chất cao (không ảnh hưởng Tiên Phẩm / Tiên Nhân Ngư)
const RARITY_PICK_MUL = {
  'thường': 1.0,
  'khá': 1.04,
  'hiếm': 1.08,
  'cực hiếm': 1.10,
  'truyền thuyết': 1.12,
  'tiên phẩm': 1.0,
};

function pickWeightedBy(list, weightFn) {
  let total = 0;
  for (const it of list) total += Math.max(1, Math.round(weightFn(it) || 1));
  if (!Number.isFinite(total) || total <= 0) return list[0];

  let r = randomInt(1, total + 1);
  for (const it of list) {
    r -= Math.max(1, Math.round(weightFn(it) || 1));
    if (r <= 0) return it;
  }
  return list[list.length - 1];
}

const COOLDOWN_MS = 5_000;
const REACTION_WINDOW_MS = 1600;
const cooldown = new Map();

// 0,001% = 1 / 100.000
const TIEN_PHAM_DENOM = 100_000;

const RARITY_META = {
  "thường": {
    label: "Phàm Phẩm",
    icon: "⚪",
    color: 0x9AA0A6,
    mul: 1.0,
  },
  "khá": {
    label: "Linh Phẩm",
    icon: "🟢",
    color: 0x2ECC71,
    mul: 1.25,
  },
  "hiếm": {
    label: "Huyền Phẩm",
    icon: "🔵",
    color: 0x3498DB,
    mul: 1.6,
  },
  "cực hiếm": {
    label: "Địa Phẩm",
    icon: "🟣",
    color: 0x9B59B6,
    mul: 2.25,
  },
  "truyền thuyết": {
    label: "Thiên Phẩm",
    icon: "🟨",
    color: 0xF1C40F,
    mul: 3.0,
  },
  "tiên phẩm": {
    label: "Tiên Phẩm",
    icon: "🔴",
    color: 0xE74C3C,
    mul: 4.0,
  },
};

// Chỉ lưu kho cá từ Thiên Phẩm trở lên
const BAG_RARITIES = new Set(["truyền thuyết", "tiên phẩm"]);

// Map id -> fish info để lọc rarity nhanh khi dọn kho
const FISH_BY_ID = Object.create(null);
for (const f of FISH_DB) {
  if (f?.id) FISH_BY_ID[f.id] = f;
}

function spotText(spotKey) {
  if (spotKey === "song") return "bờ sông";
  if (spotKey === "ho") return "mặt hồ";
  return "bờ biển";
}

function spotLabel(spotKey) {
  if (spotKey === "song") return "Sông";
  if (spotKey === "ho") return "Hồ";
  return "Biển";
}

function calcReward(baseLT, size, fish) {
  const meta = RARITY_META[fish.rarity] || RARITY_META["thường"];
  const rarityMul = meta.mul || 1.0;

  // sizeMul: chuẩn hóa về [0,1] theo khoảng size, scale nhẹ ±15%
  const minS = fish.minSizeCm || 1;
  const maxS = Math.max(fish.maxSizeCm || 1, minS + 1);
  const norm = Math.min(1, Math.max(0, (size - minS) / (maxS - minS)));
  const sizeMul = 0.85 + norm * 0.3; // 0.85 → 1.15

  return Math.max(1, Math.round(baseLT * rarityMul * sizeMul));
}

function calcDuyenPhan(fish, totalWeightNormalPool) {
  // Tiên Phẩm: rate cứng theo thiết kế (1/100000)
  if (fish.rarity === "tiên phẩm") {
    return "Thiên cơ khó lường ★☆☆☆☆ (0,001%)";
  }

  const w = Number(fish.weight ?? 1);
  const p = totalWeightNormalPool > 0 ? (w / totalWeightNormalPool) : 0;

  if (p > 0.12) return "Duyên dày ★★★★★";
  if (p > 0.07) return "Có duyên ★★★★☆";
  if (p > 0.03) return "Hơi khó gặp ★★★☆☆";
  if (p > 0.01) return "Hiếm gặp ★★☆☆☆";
  return "Thiên cơ khó lường ★☆☆☆☆";
}

module.exports = {
  name: "cau",
  aliases: ["cauca", "fish"],
  description: "Câu cá kiếm LT + EXP. Dùng: -cau [song|ho|bien]",
  run: async (client, msg, args) => {
    if (!FISH_DB.length) {
      return msg.reply("❌ Thiếu dữ liệu cá (data/fish_db.json). Hãy thêm file vào thư mục `data/`.");
    }

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
    const spotKey = validSpots.includes(arg)
      ? arg
      : validSpots[randomInt(0, validSpots.length)];

    const poolAll = FISH_DB.filter((f) => (f.habitats || []).includes(spotKey));
    if (!poolAll.length) return msg.reply("❌ Data cá không có loài phù hợp bãi câu.");

    const hookId = `hook_${msg.author.id}_${now}`;
    const waitMs = randomInt(1500, 3501); // 1.5–3.5s

    const baseEmbed = new EmbedBuilder()
      .setTitle("🎣 Thả câu")
      .setDescription(
        `Bạn thả cần ở **${spotText(spotKey)}**...\nMặt nước lặng như tờ...`
      )
      .setFooter({
        text: "Mẹo: Nhấn 'Giật cần!' thật nhanh khi nút sáng để bắt cá lớn (+25% thưởng).",
      });

    const rowDisabled = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(hookId)
        .setLabel("🎣 Giật cần!")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    const sent = await msg.reply({ embeds: [baseEmbed], components: [rowDisabled] });

    // bật nút khi cá cắn
    setTimeout(async () => {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(hookId)
          .setLabel("🎣 Giật cần!")
          .setStyle(ButtonStyle.Success)
      );
      try {
        await sent.edit({ components: [row] });
      } catch {}

      let clicked = false;
      const collector = sent.createMessageComponentCollector({ time: REACTION_WINDOW_MS });

      collector.on("collect", async (i) => {
        if (i.customId !== hookId) return;
        if (i.user.id !== msg.author.id) {
          return i.reply({ content: "❌ Đây không phải cần câu của bạn!", ephemeral: true });
        }
        clicked = true;
        await i.deferUpdate();
      });

      collector.on("end", async () => {
        try {
          await sent.edit({ components: [] });
        } catch {}

        // ===== Chọn cá =====
        // 1) Roll Tiên Phẩm (0,001%) trước — ổn định, không phụ thuộc weight pool
        const rollTienPham = randomInt(0, TIEN_PHAM_DENOM) === 0; // 1 / 100000

        const poolTienPham = poolAll.filter((f) => f.rarity === "tiên phẩm");
        const poolNormal = poolAll.filter((f) => f.rarity !== "tiên phẩm");

        let fish = null;
        if (rollTienPham && poolTienPham.length) {
          fish = pickWeightedInt(poolTienPham, "weight");
        } else {
          fish = pickWeightedBy(poolNormal.length ? poolNormal : poolAll, (f) => {
            const base = Number(f?.weight ?? 1);
            const mul = RARITY_PICK_MUL[f?.rarity] ?? 1.0;
            return base * mul;
          });
        }

        // size
        const hasSize = fish.minSizeCm && fish.maxSizeCm && fish.maxSizeCm >= fish.minSizeCm;
        const size = hasSize
          ? randomInt(fish.minSizeCm, fish.maxSizeCm + 1)
          : 0;

        // thưởng
        const baseLT = fish.baseLT || 8;
        let lt = calcReward(baseLT, size, fish);
        if (clicked) lt *= 1.25;

        const ltFinal = Math.max(1, Math.round(lt));
        const xp = Math.max(5, Math.round(ltFinal / 3));

        addLT(msg.author.id, ltFinal);
        addXp(msg.author.id, xp);

        // --- Lưu cá vào bộ sưu tập (Fish Inventory + Fishdex) ---
        // addLT/addXp tự load/save users.json, nên cần reload user mới nhất trước khi ghi fishInventory để tránh rollback.
        const all = loadUsers();
        const u2 = all[msg.author.id];
        if (u2) {
          if (!u2.fishInventory) u2.fishInventory = {};
          if (!u2.fishdex) u2.fishdex = {};

          const fishId = fish.id;

          // Kho cá: chỉ lưu từ Thiên Phẩm trở lên (Thiên Phẩm + Tiên Phẩm)
          if (BAG_RARITIES.has(fish.rarity)) {
            u2.fishInventory[fishId] = (u2.fishInventory[fishId] || 0) + 1;
          }

          // Dọn kho: loại bỏ toàn bộ cá dưới Thiên Phẩm (tránh legacy data còn sót)
          for (const id of Object.keys(u2.fishInventory)) {
            const info = FISH_BY_ID[id];
            if (!info || !BAG_RARITIES.has(info.rarity)) delete u2.fishInventory[id];
          }

          if (!u2.fishdex[fishId]) u2.fishdex[fishId] = { count: 0, maxSize: 0 };
          u2.fishdex[fishId].count += 1;
          if (size > (u2.fishdex[fishId].maxSize || 0)) {
            u2.fishdex[fishId].maxSize = size;
          }

          all[msg.author.id] = u2;
          saveUsers(all);
        }

        // ===== Render (tooltip-style tiên hiệp) =====
        const meta = RARITY_META[fish.rarity] || RARITY_META["thường"];
        const duyenPhan = calcDuyenPhan(fish, poolNormal.reduce((s, it) => s + Number(it.weight ?? 1), 0));

        const resEmbed = new EmbedBuilder()
          .setColor(meta.color)
          .setTitle(`${meta.icon} ${fish.emoji || "🐟"} ${fish.name}`)
          .setDescription(clicked ? "Dây câu rung nhẹ…" : "Sóng nước khẽ động…")
          .addFields(
            { name: "Phẩm giai", value: `${meta.label}`, inline: true },
            { name: "Duyên phận", value: duyenPhan, inline: true },
            { name: "Thủy vực", value: spotLabel(spotKey), inline: true },
            { name: "Kích cỡ", value: size ? `${size} cm` : "—", inline: true },
            { name: "Thu hoạch", value: `+${ltFinal} LT · +${xp} EXP`, inline: true },
            { name: "Thời cơ", value: clicked ? "+25% (kéo chuẩn)" : "Không bonus", inline: true }
          )
          .setFooter({ text: `Cooldown 5s` });

        await msg.channel.send({ embeds: [resEmbed] }).catch(() => {});
        cooldown.set(msg.author.id, Date.now());
      });
    }, waitMs);
  },
};
