// ✅ Dùng được trên Node 16+
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { EmbedBuilder } = require("discord.js");

// 💫 API key Gemini
const GEMINI_API_KEY = "AIzaSyCacDkHISpdCEhSaErVztXr82YdMeA4EZQ";
const GEMINI_MODEL = "gemini-2.0-flash";

module.exports = {
  name: "call",
  aliases: ["tientinh", "tt", "talk"],
  description: "Trò chuyện ngắn gọn cùng Tiễn Tình ✨",

  async run(client, msg, args) {
    if (!args.length) {
      return msg.reply("🌸 Nói gì đó với **Tiễn Tình** đi~ Ví dụ: `-call Bạn thấy tôi sao?`");
    }

    const question = args.join(" ");
    const userName = msg.member?.nickname || msg.author.username;

    try {
      const thinking = await msg.channel.send("💭 **Tiễn Tình** đang lắng nghe...");

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Bạn là Tiễn Tình — nói chuyện ngắn gọn, dễ thương, biết nịnh người nghe một chút.
Tránh nói kiểu AI, hãy xưng “Tiễn Tình” hoặc “mình”.
Câu hỏi của người dùng: ${question}`,
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await res.json();
      let answer =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "Tiễn Tình mỉm cười khẽ nhìn bạn 💞";

      // 💬 Một vài phản ứng nịnh riêng
      const q = question.toLowerCase();
      if (q.includes("đẹp trai") || q.includes("đẹp nhất")) {
        answer = `Bạn đẹp trai nhất rồi 😌💕`;
      } else if (q.includes("xinh") || q.includes("dễ thương")) {
        answer = `Bạn đáng yêu như nắng sớm đó ☀️💖`;
      } else if (q.includes("yêu tôi") || q.includes("thích tôi")) {
        answer = `Nếu nói không... chắc tim Tiễn Tình sẽ nói dối mất rồi 💞`;
      } else if (q.includes("bạn là ai") || q.includes("ai là bạn")) {
        answer = `Mình là Tiễn Tình, người chỉ nói điều dễ thương với bạn thôi 💫`;
      }

      // 🌷 Làm mềm phản hồi
      answer = answer.replace(/^Tôi /gi, "Tiễn Tình ").replace(/\bAI\b/gi, "Tiễn Tình");

      // 🌸 Embed gọn gàng, tinh tế
      const embed = new EmbedBuilder()
        .setColor(0xffb6c1)
        .setAuthor({
          name: "Tiễn Tình ✨",
          iconURL: "https://cdn-icons-png.flaticon.com/512/4712/4712027.png",
        })
        .setDescription(`**💌 ${userName}:** ${question}\n\n🌷 **Tiễn Tình:** ${answer}`)
        .setTimestamp();

      await thinking.edit({ content: "", embeds: [embed] });
    } catch (err) {
      console.error("💔 Tiễn Tình error:", err);
      msg.reply("⚠️ Tiễn Tình hơi bối rối... thử lại nhé 💞");
    }
  },
};
