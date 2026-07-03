const { playSlot } = require("../utils/gamble");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tùy biến emoji/GIF “đang quay” (giống vibe OwO)
// Ví dụ .env: SLOT_SPIN_EMOJI=<a:slot_spin:123456789012345678>
const SPIN = process.env.SLOT_SPIN_EMOJI || "🎰";

module.exports = {
  name: "slot",
  run: async (client, msg, args) => {
    try {
      const bet = Number.parseInt(args[0], 10);
      if (!Number.isFinite(bet) || bet <= 0)
        return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");

      // Commit cược + RNG trước (nhanh), UI chỉ là reveal.
      const result = playSlot(msg.author.id, bet);
      if (!result?.success) return msg.reply(result?.msg || "❌ Có lỗi xảy ra.");

      const sent = await msg.reply(`🎰 Trận bàn đang xoay... ${SPIN} ${SPIN} ${SPIN}`);

      // 1.2–1.8s như vibe OwO
      const delayMs = 1200 + Math.floor(Math.random() * 601);
      await sleep(delayMs);

      const spin = Array.isArray(result.spin) ? result.spin : null;
      const jackpot = Number(result.jackpot);

      let finalMsg;
      if (spin && spin.length === 3) {
        finalMsg = `🎰 Kết quả trận bàn: [ ${spin.join(" | ")} ]\n`;

        if (result.outcome === "jackpot") {
          const win = Number(result.win) || 0;
          const tax = Number(result.tax) || 0;
          finalMsg += `✨ Đại vận khai mở! +${win} LT (trích ${tax} LT vào bảo khố)`;
        } else if (result.outcome === "smallwin") {
          const win = Number(result.win) || 0;
          const tax = Number(result.tax) || 0;
          finalMsg += `✨ Tiểu vận hanh thông! +${win} LT (trích ${tax} LT vào bảo khố)`;
        } else {
          finalMsg += `💀 Đạo hữu thua ván này. -${bet} LT`;
        }

        if (Number.isFinite(jackpot)) finalMsg += `\n💰 Bảo khố: ${jackpot} LT`;
      } else {
        // Fallback nếu thiếu metadata
        finalMsg = result.msg;
      }

      await sent.edit(finalMsg);
    } catch (e) {
      try {
        await msg.reply("❌ Trận bàn bị nhiễu. Hãy thử lại sau.");
      } catch {}
      console.error("[slot] error:", e);
    }
  },
};
