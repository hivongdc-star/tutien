const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const schedule = require("node-schedule");
const { EmbedBuilder } = require("discord.js");
const { addLT, removeLT, getLT } = require("../utils/currency");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLL = process.env.DICE_ROLL_EMOJI || "🎲";
const FLIP = process.env.COIN_FLIP_EMOJI || "🪙";
const SPIN = process.env.SLOT_SPIN_EMOJI || "🎰";
const DICE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

// ==================================================
// XỔ SỐ / JACKPOT
// ==================================================
const LOTTERY_DATA_DIR = path.resolve(__dirname, "../data");
const LOTTERY_DATA_FILE = path.join(LOTTERY_DATA_DIR, "lottery.json");
const LOTTERY_TZ = "Asia/Tokyo";
let lotteryState = { jackpot: 0, tickets: {}, lastWinner: null };
let lotterySchedulerStarted = false;

function ensureLotteryFile() {
  try {
    if (!fs.existsSync(LOTTERY_DATA_DIR)) fs.mkdirSync(LOTTERY_DATA_DIR, { recursive: true });
    if (!fs.existsSync(LOTTERY_DATA_FILE)) {
      fs.writeFileSync(LOTTERY_DATA_FILE, JSON.stringify(lotteryState, null, 2));
    }
  } catch {}
}

function loadLottery() {
  ensureLotteryFile();
  try {
    const obj = JSON.parse(fs.readFileSync(LOTTERY_DATA_FILE, "utf8"));
    lotteryState = {
      jackpot: Number(obj?.jackpot) || 0,
      tickets: obj?.tickets && typeof obj.tickets === "object" ? obj.tickets : {},
      lastWinner: obj?.lastWinner ?? null,
    };
  } catch {
    lotteryState = { jackpot: 0, tickets: {}, lastWinner: null };
  }
  return lotteryState;
}

function saveLottery() {
  try {
    const tmp = `${LOTTERY_DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(lotteryState, null, 2));
    fs.renameSync(tmp, LOTTERY_DATA_FILE);
  } catch {}
}

function buyTicket(userId, amount, ticketPrice = 10) {
  loadLottery();
  amount = Number(amount);
  ticketPrice = Number(ticketPrice);
  if (!Number.isInteger(amount) || amount <= 0) return { success: false, msg: "❌ Số vé không hợp lệ." };
  if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) return { success: false, msg: "❌ Giá vé không hợp lệ." };

  const cost = amount * ticketPrice;
  if ((Number(getLT(userId)) || 0) < cost) return { success: false, msg: "❌ Không đủ LT mua vé!" };

  removeLT(userId, cost);
  lotteryState.jackpot += cost;
  lotteryState.tickets[userId] = (Number(lotteryState.tickets[userId]) || 0) + amount;
  saveLottery();
  return { success: true, msg: `🎟️ Đạo hữu đã mua ${amount} vé với giá ${cost} LT` };
}

function addToJackpot(amount) {
  loadLottery();
  amount = Number(amount) || 0;
  if (amount <= 0) return;
  lotteryState.jackpot += amount;
  saveLottery();
}

function getPot() {
  loadLottery();
  return {
    jackpot: lotteryState.jackpot,
    lastWinner: lotteryState.lastWinner,
    ticketCount: Object.values(lotteryState.tickets).reduce((a, b) => a + (Number(b) || 0), 0),
  };
}

function drawWinner() {
  loadLottery();
  const entries = Object.entries(lotteryState.tickets)
    .map(([uid, n]) => [uid, Number(n) || 0])
    .filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (total <= 0) return { success: false, msg: "❌ Không có vé số nào!" };

  const r = crypto.randomInt(total);
  let acc = 0;
  let winner = null;
  for (const [uid, n] of entries) {
    acc += n;
    if (r < acc) {
      winner = uid;
      break;
    }
  }

  const prize = lotteryState.jackpot;
  addLT(winner, prize);
  lotteryState.lastWinner = winner;
  lotteryState.jackpot = 0;
  lotteryState.tickets = {};
  saveLottery();
  return { success: true, msg: `🎉 Người trúng số hôm nay là <@${winner}>! Nhận ${prize} LT`, winner, prize };
}

async function getLotteryChannel(client) {
  const id = process.env.LOTTERY_CHANNEL_ID;
  if (!id) return null;
  return client.channels.cache.get(id) ?? (await client.channels.fetch(id).catch(() => null));
}

function startScheduler(client) {
  if (lotterySchedulerStarted) return;
  lotterySchedulerStarted = true;

  schedule.scheduleJob({ rule: "50 19 * * *", tz: LOTTERY_TZ }, async () => {
    const channel = await getLotteryChannel(client);
    if (channel) channel.send("⏰ 10 phút nữa quay số! Ai chưa mua vé thì nhanh tay `-lottery buy` nhé!");
  });

  schedule.scheduleJob({ rule: "0 20 * * *", tz: LOTTERY_TZ }, async () => {
    const result = drawWinner();
    const channel = await getLotteryChannel(client);
    if (channel) channel.send(result.msg);
    console.log("[LOTTERY] draw", new Date().toISOString(), result.success ? "ok" : "fail");
  });

  console.log("[LOTTERY] jobs scheduled (JST 19:50, 20:00)");
}

// ==================================================
// GAME ENGINE
// ==================================================
function playTaiXiu(userId, bet) {
  if (getLT(userId) < bet) return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };
  removeLT(userId, bet);
  const dice = Array.from({ length: 3 }, () => crypto.randomInt(1, 7));
  const total = dice.reduce((a, b) => a + b, 0);
  const meta = { bet, dice, total, outcome: "lose", win: 0, tax: 0, jackpot: undefined };

  if (total >= 13) {
    let win = bet * 2;
    const tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(userId, win);
    addToJackpot(tax);
    meta.outcome = "win";
    meta.win = win;
    meta.tax = tax;
  }
  meta.jackpot = getPot().jackpot;
  return { success: true, ...meta };
}

function playFlip(userId, bet, choice) {
  if (getLT(userId) < bet) return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };
  removeLT(userId, bet);
  const side = crypto.randomInt(0, 2) === 0 ? "ngửa" : "sấp";
  const meta = { bet, choice, side, outcome: "lose", win: 0, tax: 0, jackpot: undefined };

  if (side === choice) {
    let win = bet * 2;
    const tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(userId, win);
    addToJackpot(tax);
    meta.outcome = "win";
    meta.win = win;
    meta.tax = tax;
  }
  meta.jackpot = getPot().jackpot;
  return { success: true, ...meta };
}

function playSlot(userId, bet) {
  if (getLT(userId) < bet) return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };
  removeLT(userId, bet);
  const symbols = ["⚔️", "🌲", "💧", "🔥", "🪨", "💎"];
  const spin = Array.from({ length: 3 }, () => symbols[crypto.randomInt(0, symbols.length)]);
  const meta = { bet, spin, outcome: "lose", win: 0, tax: 0, jackpot: undefined };

  let multiplier = 0;
  if (spin.every((s) => s === spin[0])) multiplier = spin[0] === "💎" ? 50 : 5;
  else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) multiplier = 2;

  if (multiplier > 0) {
    let win = bet * multiplier;
    const tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(userId, win);
    addToJackpot(tax);
    meta.outcome = multiplier >= 5 ? "jackpot" : "smallwin";
    meta.win = win;
    meta.tax = tax;
  }
  meta.jackpot = getPot().jackpot;
  return { success: true, ...meta };
}

function playBaiCao(userId, bet) {
  if (getLT(userId) < bet) return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };
  removeLT(userId, bet);

  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  const drawHand = () => Array.from({ length: 3 }, () => deck.splice(crypto.randomInt(0, deck.length), 1)[0]);
  const calcPoint = (hand) => hand.reduce((sum, c) => sum + (["J", "Q", "K"].includes(c.rank) ? 10 : c.rank === "A" ? 1 : Number(c.rank)), 0) % 10;
  const isBaCao = (hand) => hand.every((c) => ["J", "Q", "K"].includes(c.rank));

  const playerHand = drawHand();
  const botHand = drawHand();
  const playerPoint = calcPoint(playerHand);
  const botPoint = calcPoint(botHand);
  const playerBaCao = isBaCao(playerHand);
  const botBaCao = isBaCao(botHand);
  let outcome;

  if (playerBaCao && botBaCao) {
    addLT(userId, bet);
    outcome = "⚖️ Hai bên cùng Tam Cào → hòa, hoàn cược.";
  } else if (playerBaCao) {
    let win = bet * 5;
    const tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(userId, win);
    addToJackpot(tax);
    outcome = `✨ Tam Cào hiện thế! Đạo hữu thắng ${win} LT (trích ${tax} LT vào bảo khố)`;
  } else if (botBaCao) {
    outcome = "💀 Nhà cái lật Tam Cào. Đạo hữu thua ván này.";
  } else if (playerPoint > botPoint) {
    let win = bet * 2;
    const tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(userId, win);
    addToJackpot(tax);
    outcome = `✨ Đạo hữu ${playerPoint} điểm, nhà cái ${botPoint} điểm → thắng ${win} LT (trích ${tax} LT vào bảo khố)`;
  } else if (playerPoint < botPoint) {
    outcome = `💀 Đạo hữu ${playerPoint} điểm, nhà cái ${botPoint} điểm → thua ván này.`;
  } else {
    addLT(userId, bet);
    outcome = `⚖️ Đồng điểm (${playerPoint}) → hòa, hoàn cược.`;
  }

  return { success: true, playerHand, botHand, outcome };
}

// ==================================================
// COMMANDS
// ==================================================
const taixiu = {
  name: "taixiu",
  aliases: ["tx"],
  run: async (_client, msg, args) => {
    const bet = Number.parseInt(args[0], 10);
    if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
    const result = playTaiXiu(msg.author.id, bet);
    if (!result.success) return msg.reply(result.msg);
    const sent = await msg.reply(`🎲 Đang gieo quẻ xúc xắc... ${ROLL} ${ROLL} ${ROLL}`);
    await sleep(1200 + Math.floor(Math.random() * 601));
    const faces = result.dice.map((n) => DICE_FACE[n] || "🎲").join(" ");
    let text = `🎲 Kết quả gieo: ${faces} = ${result.total}\n`;
    text += result.outcome === "win"
      ? `✨ Đạo hữu thắng! +${result.win} LT (trích ${result.tax} LT vào bảo khố)`
      : `💀 Đạo hữu thua ván này. -${bet} LT`;
    text += `\n💰 Bảo khố: ${result.jackpot} LT`;
    return sent.edit(text);
  },
};

const flip = {
  name: "flip",
  aliases: ["coin"],
  run: async (_client, msg, args) => {
    const bet = Number.parseInt(args[0], 10);
    const choice = args[1]?.toLowerCase();
    if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
    if (!["ngửa", "sấp"].includes(choice)) return msg.reply("❌ Hãy chọn `ngửa` hoặc `sấp`.");
    const result = playFlip(msg.author.id, bet, choice);
    if (!result.success) return msg.reply(result.msg);
    const sent = await msg.reply(`🪙 Đang tung linh xu... ${FLIP} ${FLIP} ${FLIP}`);
    await sleep(1200 + Math.floor(Math.random() * 601));
    let text = `🪙 Linh xu rơi mặt: **${result.side.toUpperCase()}**\n`;
    text += result.outcome === "win"
      ? `✨ Đoán trúng (**${choice}**)! +${result.win} LT (trích ${result.tax} LT vào bảo khố)`
      : `💀 Đoán sai (**${choice}**). -${bet} LT`;
    text += `\n💰 Bảo khố: ${result.jackpot} LT`;
    return sent.edit(text);
  },
};

const slot = {
  name: "slot",
  aliases: ["quay"],
  run: async (_client, msg, args) => {
    const bet = Number.parseInt(args[0], 10);
    if (!Number.isFinite(bet) || bet <= 0) return msg.reply("❌ Hãy nhập số Linh thạch muốn đặt cược.");
    const result = playSlot(msg.author.id, bet);
    if (!result.success) return msg.reply(result.msg);
    const sent = await msg.reply(`🎰 Trận bàn đang xoay... ${SPIN} ${SPIN} ${SPIN}`);
    await sleep(1200 + Math.floor(Math.random() * 601));
    let text = `🎰 Kết quả trận bàn: [ ${result.spin.join(" | ")} ]\n`;
    if (result.outcome === "jackpot") text += `✨ Đại vận khai mở! +${result.win} LT (trích ${result.tax} LT vào bảo khố)`;
    else if (result.outcome === "smallwin") text += `✨ Tiểu vận hanh thông! +${result.win} LT (trích ${result.tax} LT vào bảo khố)`;
    else text += `💀 Đạo hữu thua ván này. -${bet} LT`;
    text += `\n💰 Bảo khố: ${result.jackpot} LT`;
    return sent.edit(text);
  },
};

const db = {
  name: "db",
  aliases: ["daubai", "danhbai"],
  description: "Đấu bài cào với nhà cái",
  run: async (_client, msg, args) => {
    const bet = Number.parseInt(args[0], 10);
    if (!Number.isFinite(bet) || bet <= 0) return msg.reply("⚠️ Hãy nhập số Linh thạch hợp lệ để đặt cược.");
    const result = playBaiCao(msg.author.id, bet);
    if (!result.success) return msg.reply(result.msg);
    const fmtHand = (hand) => hand.map((c) => c.rank + c.suit).join(" ");
    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("🎴 Đấu Bài Cào")
      .addFields(
        { name: "👤 Bài của đạo hữu", value: fmtHand(result.playerHand), inline: true },
        { name: "🏯 Bài nhà cái", value: fmtHand(result.botHand), inline: true },
        { name: "📊 Kết quả", value: result.outcome }
      )
      .setFooter({ text: `Tiền cược: ${bet} LT` })
      .setTimestamp();
    return msg.reply({ embeds: [embed] });
  },
};

const lottery = {
  name: "lottery",
  aliases: ["loto", "xs"],
  description: "Xổ số và jackpot",
  run: (_client, msg, args) => {
    const sub = String(args[0] || "").toLowerCase();
    if (sub === "buy") return msg.reply(buyTicket(msg.author.id, Number.parseInt(args[1], 10) || 1).msg);
    if (sub === "pot") {
      const pot = getPot();
      const embed = new EmbedBuilder()
        .setColor("Gold")
        .setTitle("💰 Jackpot Hiện Tại")
        .addFields(
          { name: "💎 Tổng Jackpot", value: `${pot.jackpot} LT`, inline: true },
          { name: "🎟️ Tổng số vé", value: `${pot.ticketCount}`, inline: true }
        )
        .setFooter({ text: "Mua vé bằng lệnh: -lottery buy <số vé>" })
        .setTimestamp();
      if (pot.lastWinner) embed.addFields({ name: "🏆 Người thắng gần nhất", value: `<@${pot.lastWinner}>` });
      return msg.reply({ embeds: [embed] });
    }
    if (sub === "draw") {
      if (msg.author.id !== process.env.OWNER_ID) return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
      return msg.reply(drawWinner().msg);
    }
    return msg.reply("📌 Dùng:\n`-lottery buy <số vé>`\n`-lottery pot`\n`-lottery draw` (Owner)");
  },
};

loadLottery();
module.exports = {
  commands: [taixiu, flip, slot, db, lottery],
  startScheduler,
};
