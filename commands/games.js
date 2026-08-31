const { EmbedBuilder } = require("discord.js");
const { playTaiXiu, playFlip, playSlot, playBaiCao } = require("../utils/gamble");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLL = process.env.DICE_ROLL_EMOJI || "🎲";
const FLIP = process.env.COIN_FLIP_EMOJI || "🪙";
const SPIN = process.env.SLOT_SPIN_EMOJI || "🎰";
const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const taixiu = {
  name: "taixiu",
  aliases: ["tx"],
  run: async (_client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
      const result = playTaiXiu(msg.author.id, bet);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");

      const sent = await msg.reply(`🎲 Đang gieo quẻ xúc xắc... ${ROLL} ${ROLL} ${ROLL}`);
      await sleep(1200 + Math.floor(Math.random() * 601));
      const faces = Array.isArray(result.dice) ? result.dice.map((n) => DICE_FACE[n] || "🎲").join(" ") : null;
      let finalMsg;
      if (faces && Number.isFinite(result.total)) {
        finalMsg = `🎲 Kết quả gieo: ${faces} = ${result.total}\n`;
        if (result.outcome === "win") {
          finalMsg += `✨ Đạo hữu thắng! +${Number(result.win) || 0} LT (trích ${Number(result.tax) || 0} LT vào bảo khố)`;
        } else {
          finalMsg += `💀 Đạo hữu thua ván này. -${bet} LT`;
        }
        if (Number.isFinite(Number(result.jackpot))) finalMsg += `\n💰 Bảo khố: ${Number(result.jackpot)} LT`;
      } else finalMsg = result.msg;
      return sent.edit(finalMsg);
    } catch (e) {
      console.error("[taixiu] error:", e);
      return msg.reply("❌ Trận tài xỉu bị nhiễu. Hãy thử lại sau.").catch(() => {});
    }
  },
};

const flip = {
  name: "flip",
  aliases: ["coin"],
  run: async (_client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      const choice = args[1]?.toLowerCase();
      if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
      if (!["ngửa", "sấp"].includes(choice)) return msg.reply("❌ Hãy chọn `ngửa` hoặc `sấp`.");

      const result = playFlip(msg.author.id, bet, choice);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");
      const sent = await msg.reply(`🪙 Đang tung linh xu... ${FLIP} ${FLIP} ${FLIP}`);
      await sleep(1200 + Math.floor(Math.random() * 601));

      const side = typeof result.side === "string" ? result.side : null;
      let finalMsg;
      if (side) {
        finalMsg = `🪙 Linh xu rơi mặt: **${side.toUpperCase()}**\n`;
        if (result.outcome === "win") {
          finalMsg += `✨ Đoán trúng (**${choice}**)! +${Number(result.win) || 0} LT (trích ${Number(result.tax) || 0} LT vào bảo khố)`;
        } else finalMsg += `💀 Đoán sai (**${choice}**). -${bet} LT`;
        if (Number.isFinite(Number(result.jackpot))) finalMsg += `\n💰 Bảo khố: ${Number(result.jackpot)} LT`;
      } else finalMsg = result.msg;
      return sent.edit(finalMsg);
    } catch (e) {
      console.error("[flip] error:", e);
      return msg.reply("❌ Linh xu bị nhiễu. Hãy thử lại sau.").catch(() => {});
    }
  },
};

const slot = {
  name: "slot",
  aliases: ["quay"],
  run: async (_client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
      const result = playSlot(msg.author.id, bet);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");
      const sent = await msg.reply(`🎰 Trận bàn đang xoay... ${SPIN} ${SPIN} ${SPIN}`);
      await sleep(1200 + Math.floor(Math.random() * 601));

      const spin = Array.isArray(result.spin) ? result.spin : null;
      let finalMsg;
      if (spin && spin.length === 3) {
        finalMsg = `🎰 Kết quả trận bàn: [ ${spin.join(" | ")} ]\n`;
        if (result.outcome === "jackpot") {
          finalMsg += `✨ Đại vận khai mở! +${Number(result.win) || 0} LT (trích ${Number(result.tax) || 0} LT vào bảo khố)`;
        } else if (result.outcome === "smallwin") {
          finalMsg += `✨ Tiểu vận hanh thông! +${Number(result.win) || 0} LT (trích ${Number(result.tax) || 0} LT vào bảo khố)`;
        } else finalMsg += `💀 Đạo hữu thua ván này. -${bet} LT`;
        if (Number.isFinite(Number(result.jackpot))) finalMsg += `\n💰 Bảo khố: ${Number(result.jackpot)} LT`;
      } else finalMsg = result.msg;
      return sent.edit(finalMsg);
    } catch (e) {
      console.error("[slot] error:", e);
      return msg.reply("❌ Trận bàn bị nhiễu. Hãy thử lại sau.").catch(() => {});
    }
  },
};

const db = {
  name: "db",
  aliases: ["daubai", "danhbai"],
  description: "Đấu bài cào với nhà cái",
  run: async (_client, msg, args) => {
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0) return msg.reply("⚠️ Hãy nhập số Linh thạch hợp lệ để đặt cược.");
    const result = playBaiCao(msg.author.id, bet);
    if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");

    const lines = result.msg.split("\n");
    const playerLine = lines.find((l) => l.startsWith("👤")) || "👤 Bài của đạo hữu: ?";
    const botLine = lines.find((l) => l.startsWith("🏯")) || "🏯 Bài nhà cái: ?";
    const outcome = lines.slice(2).join("\n") || result.msg;
    const embed = new EmbedBuilder()
      .setColor(playerLine.includes("✨") ? "Green" : "Blue")
      .setTitle("🎴 Đấu Bài Cào")
      .addFields(
        { name: "👤 Bài của đạo hữu", value: playerLine.replace("👤 Bài của đạo hữu: ", ""), inline: true },
        { name: "🏯 Bài nhà cái", value: botLine.replace("🏯 Bài nhà cái: ", ""), inline: true },
        { name: "📊 Kết quả", value: outcome }
      )
      .setFooter({ text: `Tiền cược: ${bet} LT` })
      .setTimestamp();
    return msg.reply({ embeds: [embed] });
  },
};

module.exports = [taixiu, flip, slot, db];
