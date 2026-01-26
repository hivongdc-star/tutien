"use strict";

const schedule = require("node-schedule");
const { drawWinner } = require("./lottery");

const CHANNEL_ID = process.env.LOTTERY_CHANNEL_ID || "ID_CHANNEL_THONG_BAO"; // thay bằng ID thật
const TZ = "Asia/Tokyo";

async function getChannel(client, id) {
  return client.channels.cache.get(id) ?? (await client.channels.fetch(id).catch(() => null));
}

function start(client) {
  if (!process.env.LOTTERY_CHANNEL_ID || CHANNEL_ID === "ID_CHANNEL_THONG_BAO") {
    try {
      console.warn("[LOTTERY] LOTTERY_CHANNEL_ID chưa được set. Auto draw vẫn chạy nhưng sẽ không gửi thông báo ra kênh.");
    } catch {}
  }

  // Nhắc 19:50 JST
  schedule.scheduleJob({ rule: "50 19 * * *", tz: TZ }, async () => {
    const channel = await getChannel(client, CHANNEL_ID);
    if (channel) {
      channel.send("⏰ 10 phút nữa quay số! Ai chưa mua vé thì nhanh tay `-lottery buy` nhé!");
    }
  });

  // Quay 20:00 JST
  schedule.scheduleJob({ rule: "0 20 * * *", tz: TZ }, async () => {
    const result = drawWinner();
    const channel = await getChannel(client, CHANNEL_ID);
    if (channel) channel.send(result.msg);
    try {
      console.log("[LOTTERY] draw", new Date().toISOString(), result.success ? "ok" : "fail");
    } catch {}
  });

  try {
    console.log("[LOTTERY] jobs scheduled (JST 19:50, 20:00)");
  } catch {}
}

module.exports = (client) => start(client);
