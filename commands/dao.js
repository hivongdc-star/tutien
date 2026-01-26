// commands/dao.js
// Đào khoáng: 5 phút / lần, bắt buộc có Khoáng cụ (mua từ -shop).

const { EmbedBuilder } = require("discord.js");
const { loadUsers, saveUsers } = require("../utils/storage");
const { rollOre } = require("../utils/mining");
const { tierMeta, tierText } = require("../utils/tiers");

const COOLDOWN_MS = 30 * 1000;

function ensureMining(user) {
  if (!user.mining) user.mining = {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

module.exports = {
  name: "dao",
  aliases: ["daokhoang", "mine"],
  description: "Đào khoáng (5 phút/lần).",
  run: async (client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    ensureMining(user);

    const now = Date.now();
    const remain = user.mining.lastMineAt + COOLDOWN_MS - now;
    if (remain > 0) {
      const sec = Math.ceil(remain / 1000);
      const mm = Math.floor(sec / 60);
      const ss = String(sec % 60).padStart(2, "0");
      return msg.reply(`⏳ Nội tức chưa ổn. Hãy chờ **${mm}:${ss}** rồi hãy đào tiếp.`);
    }

    if (!user.mining.tools.length) {
      return msg.reply("❌ Bạn chưa có **Khoáng cụ**. Hãy vào `-shop` để mua.");
    }

    // Active tool
    let tool = user.mining.tools.find((t) => t.iid === user.mining.activeToolId) || null;
    if (!tool) {
      user.mining.activeToolId = user.mining.tools[0].iid;
      tool = user.mining.tools[0];
    }

    const ore = rollOre({ bonusRare: tool.bonusRare || 0 });
    if (!ore) {
      return msg.reply("❌ Thiếu dữ liệu khoáng thạch (data/ores_db.json).");
    }

    // Ghi nhận khoáng
    const oreId = ore.id;
    user.mining.ores[oreId] = (Number(user.mining.ores[oreId]) || 0) + 1;

    // Trừ độ bền
    tool.durability = Math.max(0, (Number(tool.durability) || 0) - 1);
    user.mining.lastMineAt = now;

    let brokeText = "";
    if (tool.durability <= 0) {
      // Hỏng: remove tool
      user.mining.tools = user.mining.tools.filter((t) => t.iid !== tool.iid);
      if (user.mining.activeToolId === tool.iid) {
        user.mining.activeToolId = user.mining.tools[0]?.iid || null;
      }
      brokeText = "\n\n⚠️ **Khoáng cụ** đã vỡ nát, linh vận tiêu tán.";
    }

    const m = tierMeta(ore.tier);
    const toolDurText = `${Math.max(0, tool.durability)}/${Math.max(0, tool.durabilityMax || tool.durability || 0)}`;

    const embed = new EmbedBuilder()
      .setColor(m.color)
      .setTitle("⛏️ Khai Khoáng")
      .setDescription(
        `Bạn vận khí nhập thổ, khai mở mạch khoáng...\n\n` +
        `**Thu hoạch:** ${m.icon} **${ore.name}** _(${tierText(ore.tier)})_\n` +
        `**Khoáng cụ:** **${tool.name || "Khoáng cụ"}** • Độ bền **${toolDurText}**` +
        brokeText
      );

    users[msg.author.id] = user;
    saveUsers(users);
    return msg.reply({ embeds: [embed] });
  },
};
