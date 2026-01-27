// commands/nv.js
// Xem toàn bộ chỉ số nhân vật (base + % tăng từ trang bị + tổng phụ tố).

const { EmbedBuilder } = require("discord.js");
const { loadUsers } = require("../utils/storage");
const { tierMeta } = require("../utils/tiers");
const {
  AFFIX_LABELS,
  MAIN_LABELS,
  sumAffixes,
  sumMainPercents,
  applyPct,
  progressBar,
  formatPct,
} = require("../utils/statsView");

const { ensureUserSkills, getSkill } = require("../utils/skills");

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
    if (!user) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

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

    const lines = [];
    lines.push(`❤️ HP: ${progressBar(curHp, effMaxHp, 12)}  **${curHp}/${effMaxHp}**  _( +${formatPct(mainPct.hp)}% )_`);
    lines.push(`💠 MP: ${progressBar(curMp, effMaxMp, 12)}  **${curMp}/${effMaxMp}**  _( +${formatPct(mainPct.mp)}% )_`);
    lines.push(`⚔️ ${MAIN_LABELS.atk}: **${baseAtk}** _( +${formatPct(mainPct.atk)}% )_ → **${effAtk}**`);
    lines.push(`🛡️ ${MAIN_LABELS.def}: **${baseDef}** _( +${formatPct(mainPct.def)}% )_ → **${effDef}**`);
    lines.push(`💨 ${MAIN_LABELS.spd}: **${baseSpd}** _( +${formatPct(mainPct.spd)}% )_ → **${effSpd}**`);

    const affLines = [];
    for (const [k, v] of Object.entries(aff)) {
      const label = AFFIX_LABELS[k] || k;
      affLines.push(`• ${label}: **+${formatPct(v)}%**`);
    }
    if (!affLines.length) affLines.push("• (Không có)");

    const embed = new EmbedBuilder()
      .setColor(tierMeta("huyen").color)
      .setTitle("🧾 Nhân Vật")
      .setDescription(
        `**${user.title ? `[${user.title}] ` : ""}${user.name || msg.author.username}**\n` +
        `Cảnh giới: **${user.realm || "(chưa rõ)"}**\n` +
        `Tộc: **${user.race || "?"}** • Ngũ hành: **${user.element || "?"}**\n` +
        `Cấp: **${user.level || 1}** • LT: **${user.lt || 0}** 💎\n\n` +
        lines.join("\n")
      )
      .addFields({ name: "🌫️ Phụ tố (tổng)", value: affLines.join("\n") });

    // Bí kíp (hiển thị đầy đủ cho người chơi)
    const eq = user.skills?.equipped || { actives: [null, null, null, null], passive: null };
    const act = Array.isArray(eq.actives) ? eq.actives : [null, null, null, null];
    const actLines = act.map((id, idx) => {
      const sk = id ? getSkill(id) : null;
      return `• Chủ động ${idx + 1}: ${sk ? `**${sk.name}**` : "_(trống)_"}`;
    });
    const pas = eq.passive ? getSkill(eq.passive) : null;
    actLines.push(`• Bị động: ${pas ? `**${pas.name}**` : "_(trống)_"}`);
    embed.addFields({ name: "📜 Bí kíp", value: actLines.join("\n") });

    return msg.reply({ embeds: [embed] });
  },
};
