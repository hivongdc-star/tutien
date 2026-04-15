const axios = require("axios");

module.exports = {
  name: "chat",
  description: "Chat với SimSimi",
  async run(client, msg, args) {
    const utext = args.join(" ").trim();

    if (!utext) {
      return msg.reply("❌ Cú pháp: `-chat <nội dung>`");
    }

    const apiKey = process.env.SIMSIMI_API_KEY;
    if (!apiKey) {
      return msg.reply("❌ Chưa cấu hình `SIMSIMI_API_KEY` trong file `.env`.");
    }

    try {
      const res = await axios.post(
        "https://wsapi.simsimi.com/190410/talk",
        {
          utext,
          lang: "vn",
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          timeout: 10000,
        }
      );

      const data = res?.data || {};
      const status = Number(data.status);
      const atext = typeof data.atext === "string" ? data.atext.trim() : "";

      if (status === 200 && atext) {
        return msg.channel.send(atext);
      }

      if (status === 227) {
        return msg.reply("❌ SimSimi báo thiếu tham số.");
      }

      if (status === 228) {
        return msg.reply("🤔 SimSimi không hiểu câu này.");
      }

      if (status === 403) {
        return msg.reply("❌ API key SimSimi không hợp lệ.");
      }

      if (status === 429) {
        return msg.reply("⏳ SimSimi đã chạm giới hạn tạm thời.");
      }

      if (status === 500) {
        return msg.reply("⚠️ SimSimi đang lỗi phía máy chủ.");
      }

      return msg.reply(
        `⚠️ SimSimi trả về trạng thái không mong đợi${
          data.statusMessage ? `: ${data.statusMessage}` : "."
        }`
      );
    } catch (error) {
      const status = Number(error?.response?.data?.status || error?.response?.status || 0);

      if (status === 403) {
        return msg.reply("❌ API key SimSimi không hợp lệ.");
      }

      if (status === 429) {
        return msg.reply("⏳ SimSimi đã chạm giới hạn tạm thời.");
      }

      if (status === 500) {
        return msg.reply("⚠️ SimSimi đang lỗi phía máy chủ.");
      }

      if (error.code === "ECONNABORTED") {
        return msg.reply("⏳ SimSimi phản hồi quá lâu, hãy thử lại.");
      }

      console.error("SIMSIMI_CHAT_ERROR:", error?.response?.data || error);
      return msg.reply("⚠️ Không gọi được SimSimi API.");
    }
  },
};
