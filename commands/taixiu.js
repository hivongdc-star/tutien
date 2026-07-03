const { playTaiXiu } = require("../utils/gamble");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cho phép tùy biến emoji/GIF “đang quay” giống OwO.
// Ví dụ .env: DICE_ROLL_EMOJI=<a:dice_roll:123456789012345678>
const ROLL = process.env.DICE_ROLL_EMOJI || "🎲";
const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

module.exports = {
  name: "taixiu",
  run: async (client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      if (!Number.isFinite(bet) || bet <= 0)
        return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");

      // Commit cược + RNG trước (nhanh), UI chỉ là reveal.
      const result = playTaiXiu(msg.author.id, bet);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");

      const rollingText = `🎲 Đang gieo quẻ xúc xắc... ${ROLL} ${ROLL} ${ROLL}`;
      const sent = await msg.reply(rollingText);

      // 1.2–1.8s như vibe OwO
      const delayMs = 1200 + Math.floor(Math.random() * 601);
      await sleep(delayMs);

      // Render kết quả đẹp (fallback về msg cũ nếu thiếu data)
      const faces = Array.isArray(result.dice)
        ? result.dice.map((n) => DICE_FACE[n] || "🎲").join(" ")
        : null;

      let finalMsg;
      if (faces && Number.isFinite(result.total)) {
        finalMsg = `🎲 Kết quả gieo: ${faces} = ${result.total}\n`;

        if (result.outcome === "win") {
          const tax = Number(result.tax) || 0;
          const win = Number(result.win) || 0;
          const jackpot = Number(result.jackpot);
          finalMsg += `✨ Đạo hữu thắng! +${win} LT (trích ${tax} LT vào bảo khố)`;
          if (Number.isFinite(jackpot)) finalMsg += `\n💰 Bảo khố: ${jackpot} LT`;
        } else {
          const jackpot = Number(result.jackpot);
          finalMsg += `💀 Đạo hữu thua ván này. -${bet} LT`;
          if (Number.isFinite(jackpot)) finalMsg += `\n💰 Bảo khố: ${jackpot} LT`;
        }
      } else {
        finalMsg = result.msg;
      }

      // Best-effort edit (nếu message bị xóa, ignore)
      await sent.edit(finalMsg);
    } catch (e) {
      try {
        await msg.reply("❌ Trận tài xỉu bị nhiễu. Hãy thử lại sau.");
      } catch {}
      console.error("[taixiu] error:", e);
    }
  },
};
