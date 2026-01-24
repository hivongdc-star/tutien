const { loadUsers } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const FISH_DB = require(path.join(__dirname, "../data/fish_db.json"));
const idMap = {};
for (const f of FISH_DB) idMap[f.id] = f;

module.exports = {
  name: "fishbag",
  aliases: ["tuca", "kho", "cakho"],
  description: "Xem bộ sưu tập cá bạn đang có",
  run: async (client, msg) => {
    const users = loadUsers();
    const me = users[msg.author.id];
    if (!me) return msg.reply("❌ Bạn chưa có nhân vật!");

    if (!me.fishInventory || Object.keys(me.fishInventory).length === 0)
      return msg.reply("🐟 Bạn chưa có con cá nào cả.");

    const lines = [];
    for (const id in me.fishInventory) {
      const count = me.fishInventory[id];
      const info = idMap[id] || { name: id, emoji: "🐟" };
      lines.push(`${info.emoji || "🐟"} **${info.name}** x${count}`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎣 Kho cá của ${msg.author.username}`)
      .setDescription(lines.join("\n"))
      .setColor("#00bfff");

    msg.reply({ embeds: [embed] });
  },
};
