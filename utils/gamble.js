const { addLT, removeLT, getLT } = require("./currency");
const { addToJackpot } = require("./lottery");

// 🎲 Tài Xỉu
function playTaiXiu(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Bạn không đủ LT để cược!" };

  removeLT(user, bet);
  const dice = Array.from(
    { length: 3 },
    () => Math.floor(Math.random() * 6) + 1
  );
  const total = dice.reduce((a, b) => a + b, 0);
  let result = `🎲 Tung xúc xắc: ${dice.join(" + ")} = ${total}\n`;

  if (total >= 13) {
    let win = bet * 2;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Bạn thắng! Nhận ${win} LT (trích ${tax} LT vào Jackpot)`;
  } else {
    result += "💀 Bạn thua!";
  }
  return { success: true, msg: result };
}

// 🪙 Tung Xu
function playFlip(user, bet, choice) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Bạn không đủ LT để cược!" };

  removeLT(user, bet);
  const side = Math.random() < 0.5 ? "ngửa" : "sấp";
  let result = `🪙 Tung đồng xu: ${side}\n`;

  if (side === choice) {
    let win = bet * 2;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Bạn đoán đúng! Nhận ${win} LT (trích ${tax} LT vào Jackpot)`;
  } else {
    result += "💀 Bạn đoán sai!";
  }
  return { success: true, msg: result };
}

// 🎰 Slot Machine
function playSlot(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Bạn không đủ LT để cược!" };

  removeLT(user, bet);
  const symbols = ["⚔️", "🌲", "💧", "🔥", "🪨", "💎"];
  const spin = Array.from(
    { length: 3 },
    () => symbols[Math.floor(Math.random() * symbols.length)]
  );
  let result = `🎰 [ ${spin.join(" | ")} ]\n`;

  if (spin.every((s) => s === spin[0])) {
    let win = spin[0] === "💎" ? bet * 50 : bet * 5;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ Jackpot! Bạn thắng ${win} LT (trích ${tax} LT vào Jackpot)`;
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
    result += `✨ Bạn thắng nhỏ! Nhận ${win} LT (trích ${tax} LT vào Jackpot)`;
  } else {
    result += "💀 Bạn thua!";
  }
  return { success: true, msg: result };
}

// 🎴 Bài Cào (đánh với bot, có 3 cào)
function playBaiCao(user, bet) {
  if (getLT(user) < bet)
    return { success: false, msg: "❌ Bạn không đủ LT để cược!" };

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

  let result = `👤 Bài của bạn: ${playerHand.map(c => c.rank + c.suit).join(" ")}\n`;
  result += `🤖 Bài của bot: ${botHand.map(c => c.rank + c.suit).join(" ")}\n`;

  if (playerBaCao && botBaCao) {
    addLT(user, bet);
    result += "⚖️ Cả hai đều 3 cào → Hòa! Hoàn cược.";
  } else if (playerBaCao) {
    let win = bet * 5;
    let tax = Math.floor(win * 0.05);
    win -= tax;
    addLT(user, win);
    addToJackpot(tax);
    result += `✨ 3 Cào! Bạn thắng ${win} LT (trích ${tax} LT vào Jackpot)`;
  } else if (botBaCao) {
    result += "💀 Bot có 3 Cào! Bạn thua toàn tập!";
  } else {
    if (playerPoint > botPoint) {
      let win = bet * 2;
      let tax = Math.floor(win * 0.05);
      win -= tax;
      addLT(user, win);
      addToJackpot(tax);
      result += `✨ Bạn ${playerPoint} điểm, bot ${botPoint} điểm → Bạn thắng ${win} LT (trích ${tax} LT vào Jackpot)`;
    } else if (playerPoint < botPoint) {
      result += `💀 Bạn ${playerPoint} điểm, bot ${botPoint} điểm → Bạn thua!`;
    } else {
      addLT(user, bet);
      result += `⚖️ Hòa điểm (${playerPoint}) → Hoàn cược.`;
    }
  }

  return { success: true, msg: result };
}

module.exports = { playTaiXiu, playFlip, playSlot, playBaiCao };
