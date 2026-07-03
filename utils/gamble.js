const { addLT, removeLT, getLT } = require("./currency");
const { addToJackpot, getPot } = require("./lottery");
const crypto = require("node:crypto");

// 🎲 Tài Xỉu
function playTaiXiu(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };

  removeLT(user, bet);
  // Dùng crypto RNG để nhất quán và khó dự đoán hơn Math.random()
  const dice = Array.from({ length: 3 }, () => crypto.randomInt(1, 7));
  const total = dice.reduce((a, b) => a + b, 0);
  let result = `🎲 Tung xúc xắc: ${dice.join(" + ")} = ${total}\n`;

  // Metadata bổ sung để UI/commands có thể render đẹp hơn (không phá tương thích cũ)
  const meta = {
    bet,
    dice,
    total,
    outcome: "lose",
    win: 0,
    tax: 0,
    jackpot: undefined,
  };

  if (total >= 13) {
    let win = bet * 2;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Đạo hữu thắng! Nhận ${win} LT (trích ${tax} LT vào bảo khố)`;

    meta.outcome = "win";
    meta.win = win;
    meta.tax = tax;
  } else {
    result += "💀 Đạo hữu thua ván này.";
  }

  // Best-effort: lấy jackpot hiện tại để hiển thị
  try {
    meta.jackpot = getPot().jackpot;
  } catch {
    // ignore
  }

  return { success: true, msg: result, ...meta };
}

// 🪙 Tung Xu
function playFlip(user, bet, choice) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };

  removeLT(user, bet);
  // RNG crypto để nhất quán với tài xỉu
  const side = crypto.randomInt(0, 2) === 0 ? "ngửa" : "sấp";
  let result = `🪙 Tung đồng xu: ${side}\n`;

  const meta = {
    bet,
    choice,
    side,
    outcome: "lose",
    win: 0,
    tax: 0,
    jackpot: undefined,
  };

  if (side === choice) {
    let win = bet * 2;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Đoán trúng! Nhận ${win} LT (trích ${tax} LT vào bảo khố)`;

    meta.outcome = "win";
    meta.win = win;
    meta.tax = tax;
  } else {
    result += "💀 Đoán sai, mất cược.";
  }

  try {
    meta.jackpot = getPot().jackpot;
  } catch {
    // ignore
  }

  return { success: true, msg: result, ...meta };
}

// 🎰 Slot Machine
function playSlot(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };

  removeLT(user, bet);
  const symbols = ["⚔️", "🌲", "💧", "🔥", "🪨", "💎"];
  const spin = Array.from({ length: 3 }, () => symbols[crypto.randomInt(0, symbols.length)]);
  let result = `🎰 [ ${spin.join(" | ")} ]\n`;

  const meta = {
    bet,
    symbols,
    spin,
    outcome: "lose",
    win: 0,
    tax: 0,
    jackpot: undefined,
  };

  if (spin.every((s) => s === spin[0])) {
    let win = spin[0] === "💎" ? bet * 50 : bet * 5;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Đại vận khai mở! Đạo hữu thắng ${win} LT (trích ${tax} LT vào bảo khố)`;

    meta.outcome = "jackpot";
    meta.win = win;
    meta.tax = tax;
  } else if (
    spin[0] === spin[1] ||
    spin[1] === spin[2] ||
    spin[0] === spin[2]
  ) {
    let win = bet * 2;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Tiểu vận hanh thông! Nhận ${win} LT (trích ${tax} LT vào bảo khố)`;

    meta.outcome = "smallwin";
    meta.win = win;
    meta.tax = tax;
  } else {
    result += "💀 Đạo hữu thua ván này.";
  }

  try {
    meta.jackpot = getPot().jackpot;
  } catch {
    // ignore
  }

  return { success: true, msg: result, ...meta };
}

// 🎴 Bài Cào (đấu với nhà cái, có 3 cào)
function playBaiCao(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Linh thạch không đủ để đặt cược." };

  removeLT(user, bet);

  const suits = ["♠️", "♥️", "♦️", "♣️"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck = [];
  for (let s of suits) {
    for (let r of ranks) {
      deck.push({ rank: r, suit: s });
    }
  }

  function drawHand() {
    const hand = [];
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(Math.random() * deck.length);
      hand.push(deck.splice(index, 1)[0]);
    }
    return hand;
  }

  function calcPoint(hand) {
    const values = hand.map((c) => {
      if (["J", "Q", "K"].includes(c.rank)) return 10;
      if (c.rank === "A") return 1;
      return parseInt(c.rank);
    });
    return values.reduce((a, b) => a + b, 0) % 10;
  }

  function isBaCao(hand) {
    return hand.every((c) => ["J","Q","K"].includes(c.rank));
  }

  const playerHand = drawHand();
  const botHand = drawHand();

  const playerPoint = calcPoint(playerHand);
  const botPoint = calcPoint(botHand);

  const playerBaCao = isBaCao(playerHand);
  const botBaCao = isBaCao(botHand);

  let result = `👤 Bài của đạo hữu: ${playerHand.map(c => c.rank + c.suit).join(" ")}\n`;
  result += `🏯 Bài nhà cái: ${botHand.map(c => c.rank + c.suit).join(" ")}\n`;

  if (playerBaCao && botBaCao) {
    addLT(user, bet);
    result += "⚖️ Hai bên cùng Tam Cào → hòa, hoàn cược.";
  } else if (playerBaCao) {
    let win = bet * 5;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Tam Cào hiện thế! Đạo hữu thắng ${win} LT (trích ${tax} LT vào bảo khố)`;
  } else if (botBaCao) {
    result += "💀 Nhà cái lật Tam Cào. Đạo hữu thua ván này.";
  } else {
    if (playerPoint > botPoint) {
      let win = bet * 2;
      let tax = Math.floor(win * 0.05);
      win -= tax;
      addLT(user, win);
      addToJackpot(tax);
      result += `✨ Đạo hữu ${playerPoint} điểm, nhà cái ${botPoint} điểm → thắng ${win} LT (trích ${tax} LT vào bảo khố)`;
    } else if (playerPoint < botPoint) {
      result += `💀 Đạo hữu ${playerPoint} điểm, nhà cái ${botPoint} điểm → thua ván này.`;
    } else {
      addLT(user, bet);
      result += `⚖️ Đồng điểm (${playerPoint}) → hòa, hoàn cược.`;
    }
  }

  return { success: true, msg: result };
}

module.exports = { playTaiXiu, playFlip, playSlot, playBaiCao };
