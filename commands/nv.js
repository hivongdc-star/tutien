const { EmbedBuilder } = require("discord.js");
const { loadUsers } = require("../utils/storage");
const { tierMeta } = require("../utils/tiers");
const {
  AFFIX_LABELS,
  sumAffixes,
  sumMainPercents,
  applyPct,
  progressBar,
  formatPct,
} = require("../utils/statsView");
const { ensureUserSkills, getSkill } = require("../utils/skills");
const races = require("../utils/races");
const elements = require("../utils/element");

function ensureGear(user) {
  if (!user.gear) user.gear = {};
  if (!user.gear.equipped || typeof user.gear.equipped !== "object") {
    user.gear.equipped = { weapon: null, armor: null, boots: null, bracelet: null };
  }
}

module.exports = {
  name: "nv",
  aliases: ["nhanvat", "char"],
  description: "Xem chỉ số nhân vật.",
  run: async (client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");

    ensureGear(user);
    ensureUserSkills(user);

    const equipped = user.gear.equipped || {};
    const mainPct = sumMainPercents(equipped);
    const aff = sumAffixes(equipped);

    const baseAtk = Number(user.atk) || 0;
    const baseDef = Number(user.def) || 0;
    const baseSpd = Number(user.spd) || 0;
    const baseMaxHp = Number(user.maxHp) || 0;
    const baseMaxMp = Number(user.maxMp) || 0;

    const effAtk = applyPct(baseAtk, mainPct.atk);
    const effDef = applyPct(baseDef, mainPct.def);
    const effSpd = applyPct(baseSpd, mainPct.spd);
    const effMaxHp = applyPct(baseMaxHp, mainPct.hp);
    const effMaxMp = applyPct(baseMaxMp, mainPct.mp);

    const curHp = Math.min(Math.max(0, Number(user.hp) || 0), effMaxHp || 0);
    const curMp = Math.min(Math.max(0, Number(user.mp) || 0), effMaxMp || 0);

    const statusLines = [
      `Sinh lực: ${progressBar(curHp, effMaxHp, 12)} **${curHp}/${effMaxHp}** _( +${formatPct(mainPct.hp)}% )_`,
      `Linh lực: ${progressBar(curMp, effMaxMp, 12)} **${curMp}/${effMaxMp}** _( +${formatPct(mainPct.mp)}% )_`,
    ];

    const baseLines = [
      `Công kích: **${baseAtk}** _( +${formatPct(mainPct.atk)}% )_ → **${effAtk}**`,
      `Phòng ngự: **${baseDef}** _( +${formatPct(mainPct.def)}% )_ → **${effDef}**`,
      `Thân pháp: **${baseSpd}** _( +${formatPct(mainPct.spd)}% )_ → **${effSpd}**`,
    ];

    const affLines = Object.entries(aff).map(([k, v]) => `• ${AFFIX_LABELS[k] || k}: **+${formatPct(v)}%**`);
    if (!affLines.length) affLines.push("Chưa có linh văn phụ trợ.");

    const eq = user.skills?.equipped || { actives: [null, null, null, null], passive: null };
    const act = Array.isArray(eq.actives) ? eq.actives : [null, null, null, null];
    const skillLines = act.map((id, idx) => {
      const sk = id ? getSkill(id) : null;
      return `• Chiêu thức ${idx + 1}: ${sk ? `**${sk.name}**` : "_(trống)_"}`;
    });
    const pas = eq.passive ? getSkill(eq.passive) : null;
    skillLines.push(`• Tâm pháp: ${pas ? `**${pas.name}**` : "_(trống)_"}`);

    const titlePrefix = user.title ? `[${user.title}] ` : "";
    const raceLabel = races[user.race]?.name || user.race || "?";
    const elementLabel = elements.display[user.element] || user.element || "?";

    const embed = new EmbedBuilder()
      .setColor(tierMeta("huyen").color)
      .setTitle("🧾 Nền Tảng Nhân Vật")
      .setDescription(
        `**${titlePrefix}${user.name || msg.author.username}**\n` +
        `${user.realm || "(chưa rõ)"} • ${raceLabel} • ${elementLabel}\n` +
        `Cấp tu luyện: **${user.level || 1}** • Linh thạch: **${user.lt || 0}**`
      )
      .addFields(
        { name: "Sinh lực & linh lực", value: statusLines.join("\n"), inline: false },
        { name: "Chỉ số nền", value: baseLines.join("\n"), inline: false },
        { name: "Thuộc tính kèm theo", value: affLines.join("\n"), inline: false },
        { name: "Chiêu thức đang mang", value: skillLines.join("\n"), inline: false }
      )
      .setFooter({ text: "Các gia tăng bên trên đã gồm ảnh hưởng từ trang bị đang dùng." });

    return msg.reply({ embeds: [embed] });
  },
};
