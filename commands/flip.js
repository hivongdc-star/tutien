const { playFlip } = require("../utils/gamble");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tùy biến emoji/GIF “đang tung” (giống vibe OwO)
// Ví dụ .env: COIN_FLIP_EMOJI=<a:coin_flip:123456789012345678>
const FLIP = process.env.COIN_FLIP_EMOJI || "🪙";

module.exports = {
  name: "flip",
  run: async (client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      const choice = args[1]?.toLowerCase();
      if (!Number.isFinite(bet) || bet <= 0)
        return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
      if (!["ngửa", "sấp"].includes(choice))
        return msg.reply("❌ Hãy chọn `ngửa` hoặc `sấp`.");

      // Commit cược + RNG trước (nhanh), UI chỉ là reveal.
      const result = playFlip(msg.author.id, bet, choice);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");

      const sent = await msg.reply(`🪙 Đang tung linh xu... ${FLIP} ${FLIP} ${FLIP}`);

      // 1.2–1.8s như vibe OwO
      const delayMs = 1200 + Math.floor(Math.random() * 601);
      await sleep(delayMs);

      const side = typeof result.side === "string" ? result.side : null;
      const jackpot = Number(result.jackpot);

      let finalMsg;
      if (side) {
        finalMsg = `🪙 Linh xu rơi mặt: **${side.toUpperCase()}**\n`;

        if (result.outcome === "win") {
          const win = Number(result.win) || 0;
          const tax = Number(result.tax) || 0;
          finalMsg += `✨ Đoán trúng (**${choice}**)! +${win} LT (trích ${tax} LT vào bảo khố)`;
        } else {
          finalMsg += `💀 Đoán sai (**${choice}**). -${bet} LT`;
        }

        if (Number.isFinite(jackpot)) finalMsg += `\n💰 Bảo khố: ${jackpot} LT`;
      } else {
        finalMsg = result.msg;
      }

      await sent.edit(finalMsg);
    } catch (e) {
      try {
        await msg.reply("❌ Linh xu bị nhiễu. Hãy thử lại sau.");
      } catch {}
      console.error("[flip] error:", e);
    }
  },
};
