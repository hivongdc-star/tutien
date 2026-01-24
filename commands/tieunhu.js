const { loadUsers, saveUsers } = require("../utils/storage");
const { addXp } = require("../utils/xp");

const cooldown = new Set();

const quotes = [
  "😏 Ngươi tưởng tu tiên dễ lắm sao?",
  "❄️ Ta lạnh lùng, nhưng ngươi còn lạnh hơn túi linh thạch của mình.",
  "🙄 Cũng chỉ thế thôi, chưa đáng để ta nhìn.",
  "👀 Ngươi nghĩ có thể vượt qua ta?",
  "🔥 Hãy chứng minh bằng máu và linh thạch.",
  "🌙 Đêm dài lắm mộng, ngươi đừng ảo tưởng.",
  "💨 Ngươi nhanh, nhưng số mệnh còn nhanh hơn.",
  "⚡ Độ kiếp? Hừ, ngươi sẽ bị đánh thành tro.",
  "🌸 Đừng nhìn ta, ta không phải để ngươi ngắm.",
  "🕊️ Ngươi yếu đuối, ta thậm chí không buồn cười.",
];

module.exports = {
  name: "tieunhu",
  aliases: ["tn"],
  run: (client, msg) => {
    if (cooldown.has(msg.author.id)) {
      return msg.channel.send("❌ Ngươi vừa gặp Tiểu Nhu, hãy chờ 5 phút nữa.");
    }

    const users = loadUsers();
    if (!users[msg.author.id])
      return msg.channel.send("❌ Bạn chưa tạo nhân vật.");

    const reply = quotes[Math.floor(Math.random() * quotes.length)];
    msg.channel.send(`👩‍🦰 **Tiểu Nhu**: ${reply}`);

    addXp(msg.author.id, 20); // cho 20 exp
    saveUsers(users);

    cooldown.add(msg.author.id);
    setTimeout(() => cooldown.delete(msg.author.id), 5 * 60 * 1000);
  },
};
