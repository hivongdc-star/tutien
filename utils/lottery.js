"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { addLT, removeLT, getLT } = require("./currency");

// Đường dẫn dữ liệu: ../data/lottery.json so với file này (utils/)
const DATA_DIR = path.resolve(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "lottery.json");

let lottery = { jackpot: 0, tickets: {}, lastWinner: null };

// I/O an toàn
function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(lottery, null, 2));
    }
  } catch (e) {
    // giữ im lặng để tránh crash bot
  }
}

function loadLottery() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw);
    // phòng lỗi cấu trúc
    lottery = {
      jackpot: Number(obj?.jackpot) || 0,
      tickets: typeof obj?.tickets === "object" && obj.tickets ? obj.tickets : {},
      lastWinner: obj?.lastWinner ?? null,
    };
  } catch {
    // fallback mặc định
    lottery = { jackpot: 0, tickets: {}, lastWinner: null };
  }
}

function atomicWrite(file, data) {
  try {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch {
    // best-effort
  }
}
function saveLottery() {
  atomicWrite(DATA_FILE, JSON.stringify(lottery, null, 2));
}

// Mua vé
function buyTicket(user, amount, ticketPrice = 10) {
  // xác thực tối thiểu, giữ tham số cũ để tương thích
  amount = Number(amount);
  ticketPrice = Number(ticketPrice);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return { success: false, msg: "❌ Số vé không hợp lệ." };
  }
  if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
    return { success: false, msg: "❌ Giá vé không hợp lệ." };
  }

  const totalCost = amount * ticketPrice;
  const balance = Number(getLT(user)) || 0;
  if (balance < totalCost) {
    return { success: false, msg: "❌ Không đủ LT mua vé!" };
  }

  // trừ LT, kiểm tra trả về nếu hàm có boolean
  const removed = removeLT(user, totalCost);
  if (removed === false) {
    return { success: false, msg: "❌ Giao dịch thất bại. Vui lòng thử lại." };
  }

  lottery.jackpot += totalCost;
  lottery.tickets[user] = (Number(lottery.tickets[user]) || 0) + amount;
  saveLottery();

  return {
    success: true,
    msg: `🎟️ Bạn đã mua ${amount} vé với giá ${totalCost} LT`,
  };
}

// Cộng tiền vào hũ
function addToJackpot(amount) {
  amount = Number(amount) || 0;
  if (amount <= 0) return;
  lottery.jackpot += amount;
  saveLottery();
}

// Xem hũ + thông tin thêm
function getPot() {
  const ticketCount = Object.values(lottery.tickets).reduce((a, b) => a + (Number(b) || 0), 0);
  return {
    jackpot: lottery.jackpot,
    lastWinner: lottery.lastWinner,
    ticketCount,
  };
}

// Quay thưởng
function drawWinner() {
  // tổng số vé và chọn theo trọng số, không tạo mảng lớn
  const entries = Object.entries(lottery.tickets).map(([uid, n]) => [uid, Number(n) || 0]).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  if (total === 0) return { success: false, msg: "❌ Không có vé số nào!" };

  const r = crypto.randomInt(total); // 0..total-1
  let acc = 0;
  let winner = null;
  for (const [uid, n] of entries) {
    acc += n;
    if (r < acc) {
      winner = uid;
      break;
    }
  }

  const prize = lottery.jackpot;
  const added = addLT(winner, prize);
  if (added === false) {
    // không reset nếu cộng thưởng thất bại
    return { success: false, msg: "❌ Trao thưởng thất bại. Thử lại sau." };
  }

  lottery.lastWinner = winner;
  lottery.jackpot = 0;
  lottery.tickets = {};
  saveLottery();

  return {
    success: true,
    msg: `🎉 Người trúng số hôm nay là <@${winner}>! Nhận ${prize} LT`,
    winner,
    prize,
  };
}

loadLottery();
module.exports = { buyTicket, getPot, addToJackpot, drawWinner };
