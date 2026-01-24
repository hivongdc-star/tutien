const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getUser, loadUsers } = require("./storage");
const { getRealm, getExpNeeded } = require("./xp");
const { getBackground } = require("./backgrounds");
const { listItems } = require("../shop/shopUtils");

async function drawProfile(userId, avatarUrl) {
  const user = getUser(userId);
  if (!user) return null;

  const canvas = createCanvas(800, 500); // canvas to rộng hơn cho layout mới
  const ctx = canvas.getContext("2d");

  // --- Background ---
  const bgInfo = getBackground(user.background || "default");
  const bg = await loadImage(`./assets/backgrounds/${bgInfo.file}`);
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

  // --- Avatar ---
  try {
    const avatar = await loadImage(
      avatarUrl || user.avatar || "./assets/default_avatar.png"
    );
    const size = 140;
    ctx.save();
    ctx.beginPath();
    ctx.arc(90, 90, size / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 20, 20, size, size);
    ctx.restore();
  } catch {}

  // --- Tên nhân vật ---
  ctx.font = "bold 36px Sans";
  ctx.fillStyle = "#4fc3f7";
  ctx.fillText(user.name, 180, 60);

  // --- Danh hiệu ---
  if (user.title) {
    ctx.font = "bold 24px Sans";
    ctx.fillStyle = "#ffd54f";
    ctx.fillText(user.title, 180, 95);
  }

  // --- Cảnh giới ---
  const realm = getRealm(user.level);
  ctx.font = "20px Sans";
  ctx.fillStyle = "#fff";
  ctx.fillText(realm, 180, 125);

  // --- Icon tộc & hệ ---
  try {
    const raceIcon = await loadImage(`./assets/icons/${user.race}.png`);
    ctx.drawImage(raceIcon, 20, 170, 128, 128);

    const elementIcon = await loadImage(`./assets/icons/${user.element}.png`);
    ctx.drawImage(elementIcon, 160, 170, 128, 128);
  } catch {}

  // --- Partner & Nhẫn cưới ---
  if (user.relationships && user.relationships.status === "married" && user.relationships.partnerId) {
    const items = listItems();
    const ringBonus = user.relationships.ringBonus || {};
    const ringName = Object.entries(items).find(
      ([id, it]) => id.startsWith("ring_") && JSON.stringify(it.bonus) === JSON.stringify(ringBonus)
    )?.[1]?.name;

    const allUsers = loadUsers();
    const partner = allUsers[user.relationships.partnerId];

    ctx.font = "20px Sans";
    ctx.fillStyle = "#ff80ab";
    ctx.fillText(`💍 ${ringName || "Nhẫn cưới"}`, 320, 200);

    if (partner) {
      ctx.font = "18px Sans";
      ctx.fillStyle = "#ffccbc";
      ctx.fillText(`Partner: ${partner.name}`, 320, 230);
    }
  }

  // --- Thanh EXP ---
  const barX = 20,
    barY = 320,
    barW = 740,
    barH = 30;
  const expNow = user.exp;
  const expNeed = getExpNeeded(user.level);

  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barW, barH);

  ctx.fillStyle = "#4fc3f7";
  ctx.fillRect(barX, barY, Math.floor((barW * expNow) / expNeed), barH);

  ctx.strokeStyle = "#fff";
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.font = "18px Sans";
  ctx.fillStyle = "#fff";
  ctx.fillText(`EXP: ${expNow}/${expNeed}`, barX + 10, barY + 22);

  // --- Linh thạch ---
  try {
    const ltIcon = await loadImage("./assets/icons/lt.png");
    ctx.drawImage(ltIcon, 20, 370, 28, 28);
  } catch {}
  ctx.font = "20px Sans";
  ctx.fillStyle = "#fff";
  ctx.fillText(user.lt.toString(), 60, 392);

  // --- Stats: 2 cột ---
  const stats = [
    { icon: "./assets/icons/hp.png", text: `${user.hp}/${user.maxHp}` },
    { icon: "./assets/icons/atk.png", text: user.atk },
    { icon: "./assets/icons/mp.png", text: `${user.mp}/${user.maxMp}` },
    { icon: "./assets/icons/def.png", text: user.def },
    { icon: "./assets/icons/spd.png", text: user.spd }
  ];

  for (let i = 0; i < stats.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const x = 300 + col * 200;
    const y = 370 + row * 30;

    try {
      const icon = await loadImage(stats[i].icon);
      ctx.drawImage(icon, x, y, 24, 24);
    } catch {}

    ctx.font = "18px Sans";
    ctx.fillStyle = "#fff";
    ctx.fillText(stats[i].text.toString(), x + 30, y + 20);
  }

  // --- Bio ---
  ctx.font = "italic 18px Sans";
  ctx.fillStyle = "#ccc";
  ctx.fillText(user.bio || `"Chưa có mô tả."`, 20, 470);

  return canvas.toBuffer("image/png");
}

module.exports = { drawProfile };
