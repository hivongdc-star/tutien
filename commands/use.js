const { loadUsers, saveUsers } = require("../utils/storage");
const { listItems } = require("../shop/shopUtils");
const { hatchEggs, getPetMeta } = require("../utils/petSystem");

function ensureMining(user) {
  if (!user.mining) user.mining = {};
  if (!Array.isArray(user.mining.tools)) user.mining.tools = [];
  if (typeof user.mining.activeToolId === "undefined") user.mining.activeToolId = null;
  if (!Number.isFinite(user.mining.lastMineAt)) user.mining.lastMineAt = 0;
  if (!user.mining.ores || typeof user.mining.ores !== "object") user.mining.ores = {};
}

function fmtMap(obj, render) {
  return Object.entries(obj || {})
    .filter(([, count]) => (Number(count) || 0) > 0)
    .map(([id, count]) => render(id, count));
}

function buildHatchMessage(result) {
  const lines = [`🥚 Đã ấp **${result.eggs}** trứng.`];

  const petLines = fmtMap(result.pets, (id, count) => {
    const meta = getPetMeta(id);
    return `• Linh thú: **${meta?.name || id}** x${count}`;
  });
  if (petLines.length) lines.push(...petLines);

  const shardLines = fmtMap(result.shards, (id, count) => {
    const meta = getPetMeta(id);
    return `• Mảnh: **${meta?.name || id}** x${count}`;
  });
  if (shardLines.length) lines.push(...shardLines);

  const craftLines = fmtMap(result.crafted, (id, count) => {
    const meta = getPetMeta(id);
    return `• Ghép thành công: **${meta?.name || id}** x${count}`;
  });
  if (craftLines.length) lines.push(...craftLines);

  if (result.nothing > 0) {
    lines.push(`• Trắng tay: **${result.nothing}**`);
  }

  return lines.join("\n");
}

module.exports = {
  name: "use",
  aliases: ["sd", "useitem"],
  description: "Dùng vật phẩm trong inventory hiện tại",
  run: async (client, msg, args) => {
    const userId = msg.author.id;
    const itemId = String(args[0] || "").trim();
    const count = args[1] ? Number.parseInt(args[1], 10) : 1;

    if (!itemId) {
      return msg.reply("❌ Cú pháp: `-use <itemId> [số lượng]`.");
    }
    if (!Number.isFinite(count) || count <= 0) {
      return msg.reply("❌ Số lượng sử dụng phải là số nguyên dương.");
    }

    const users = loadUsers();
    const user = users[userId];
    if (!user) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");

    user.inventory = user.inventory || {};
    ensureMining(user);

    const catalog = listItems();
    const item = catalog[itemId];
    if (!item) return msg.reply("❌ Vật phẩm không tồn tại.");

    if (item.type === "pet_egg") {
      const outcome = hatchEggs(user, count);
      if (!outcome.ok) {
        return msg.reply(outcome.message || "❌ Không thể sử dụng vật phẩm này.");
      }

      users[userId] = user;
      saveUsers(users);
      return msg.reply(buildHatchMessage(outcome.result));
    }

    if (item.type === "mining_tool") {
      const activeTool = (user.mining.tools || []).find((t) => t && t.iid === user.mining.activeToolId) || null;
      if (activeTool) {
        return msg.reply(
          `⛏️ Khoáng cụ đang vận dụng: **${activeTool.name || activeTool.itemId || "Khoáng cụ"}**. Dùng \`-bag\` để đổi khoáng cụ.`
        );
      }

      return msg.reply("⛏️ Khoáng cụ không cần kích hoạt bằng `-use`. Hãy vào `-bag` để đổi khoáng cụ, rồi dùng `-dao` để khai khoáng.");
    }

    return msg.reply("❌ Vật phẩm này hiện chưa có pháp môn sử dụng trực tiếp. Hãy mở `-bag` để xem cách xử lý khác.");
  },
};
