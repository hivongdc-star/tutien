"use strict";

const schedule = require("node-schedule");
const { drawWinner } = require("./lottery");

const CHANNEL_ID = process.env.LOTTERY_CHANNEL_ID || "ID_CHANNEL_THONG_BAO"; // thay bằng ID thật
const TZ = { tz: "Asia/Tokyo" };

async function getChannel(client, id) {
  return client.channels.cache.get(id) ?? await client.channels.fetch(id).catch(() => null);
}

function start(client) {
  // Nhắc 19:50 JST
  schedule.scheduleJob("50 19 * * *", TZ, async () => {
    const channel = await getChannel(client, CHANNEL_ID);
    if (channel) {
      channel.send("⏰ 10 phút nữa quay số! Ai chưa mua vé thì nhanh tay `-lottery buy` nhé!");
    }
  });

  // Quay 20:00 JST
  schedule.scheduleJob("0 20 * * *", TZ, async () => {
    const result = drawWinner();
    const channel = await getChannel(client, CHANNEL_ID);
    if (channel) channel.send(result.msg);
    // log nhẹ để kiểm tra
    try { console.log("[LOTTERY] draw", new Date().toISOString(), result.success ? "ok" : "fail"); } catch {}
  });

  try { console.log("[LOTTERY] jobs scheduled (JST 19:50, 20:00)"); } catch {}
}

module.exports = (client) => start(client);
