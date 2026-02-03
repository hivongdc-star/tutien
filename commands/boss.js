// commands/boss.js
// World Boss tuần (combo 3): đánh boss, xem HP, nhận thưởng theo đóng góp.

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} = require("discord.js");

const { loadUsers, saveUsers } = require("../utils/storage");
const { computeEffective } = require("../utils/dungeonEngine");
const elements = require("../utils/element");
const { formatGearLines } = require("../utils/forge");
const {
  ensureBoss,
  bossSummary,
  applyDamage,
  claimReward,
  canClaim,
  computeRewardForUser,
} = require("../utils/worldBoss");

const { recordEvent: recordQuestEvent } = require("../utils/questSystem");
const { recordEvent: recordAchvEvent } = require("../utils/achievementSystem");

const ATTACK_COOLDOWN_MS = 60_000; // 60s

function fmtLT(n) {
  return Number(n || 0).toLocaleString("vi-VN");
}

function ensureGearBag(user) {
  user.gear = user.gear || {};
  if (!Array.isArray(user.gear.bag)) user.gear.bag = [];
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function computeDamageFromUser(user) {
  const { eff } = computeEffective(user);
  const atk = Number(eff.atk) || 0;
  const spd = Number(eff.spd) || 0;
  const lvl = Number(user.level) || 1;
  const base = atk * 1.6 + spd * 0.4;
  const lvMult = 1 + Math.min(0.8, Math.log10(Math.max(1, lvl)) * 0.25);
  const roll = rand(0.85, 1.15);
  const dmg = Math.floor(Math.max(1, base * lvMult * roll));
  return Math.max(1, Math.min(250_000, dmg));
}

function buildBossEmbed(summary) {
  const topLines = summary.top.length
    ? summary.top
        .map((t) => `#${t.rank} • **${t.name}** — ${fmtLT(t.dmg)} DMG`)
        .join("\n")
    : "(Chưa có ai ra tay)";

  const b1 = summary.bonusTop?.[1] ?? Math.round((Number(summary.poolLt) || 0) * 0.25);
  const b2 = summary.bonusTop?.[2] ?? Math.round((Number(summary.poolLt) || 0) * 0.15);
  const b3 = summary.bonusTop?.[3] ?? Math.round((Number(summary.poolLt) || 0) * 0.08);
  const gearLine = summary.killedAt
    ? `Trang bị 🔴: **${fmtLT(summary.redDropTotal || 0)}** món (chia theo % sát thương)`
    : `Trang bị 🔴: sẽ rơi khi hạ gục (chia theo % sát thương)`;

  const emb = new EmbedBuilder()
    .setTitle("🐉 World Boss Tuần")
    .setColor(0xE74C3C)
    .setDescription(
      `Tuần: **${summary.weekKey}**\n` +
        `Boss: **${summary.name}** • Hệ: ${summary.elementText}\n\n` +
        `HP: **${summary.hpText}**\n${summary.bar}`
    )
    .addFields(
      { name: "🏅 Top đóng góp", value: topLines, inline: false },
      {
        name: "💰 Quỹ thưởng (ước tính)",
        value:
          `**${fmtLT(summary.poolLt)} LT** (chia theo % sát thương)\n` +
          `Top 1/2/3: +${fmtLT(b1)}/+${fmtLT(b2)}/+${fmtLT(b3)} LT\n` +
          gearLine,
        inline: false,
      }
    );

  if (summary.killedAt) {
    emb.setFooter({ text: "Boss đã bị hạ gục — hãy nhận thưởng nếu bạn có đóng góp." });
  } else {
    emb.setFooter({ text: "Nhấn 'Tấn công' để ra tay. Cooldown 60 giây." });
  }

  return emb;
}

function buildRows({ userId, nonce, dead }) {
  const row = new ActionRowBuilder();
  if (!dead) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`boss_atk_${userId}_${nonce}`)
        .setLabel("Tấn công")
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`boss_claim_${userId}_${nonce}`)
        .setLabel("Nhận thưởng")
        .setStyle(ButtonStyle.Success)
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`boss_close_${userId}_${nonce}`)
      .setLabel("Đóng")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

module.exports = {
  name: "boss",
  aliases: ["wb"],
  run: async (client, msg) => {
    const users = loadUsers();
    const u = users[msg.author.id];
    if (!u) return msg.reply("❌ Bạn chưa có nhân vật. Dùng `-create` trước.");

    // ensure boss for current week
    const st = ensureBoss(users, Date.now());
    const summary = bossSummary(st, users);
    if (!summary) return msg.reply("⚠️ Không thể tạo World Boss.");

    const nonce = Math.random().toString(36).slice(2, 8);
    const sent = await msg.reply({
      embeds: [buildBossEmbed(summary)],
      components: buildRows({ userId: msg.author.id, nonce, dead: Boolean(summary.killedAt) }),
    });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== msg.author.id) {
        return i.reply({ content: "❌ Đây không phải bảng của bạn.", ephemeral: true });
      }

      const cid = String(i.customId || "");
      if (!cid.endsWith(`_${nonce}`)) return i.reply({ content: "⚠️ Session đã hết hạn.", ephemeral: true });

      if (cid.startsWith("boss_close_")) {
        await i.deferUpdate();
        collector.stop("close");
        return sent.edit({ components: [] }).catch(() => {});
      }

      if (cid.startsWith("boss_atk_")) {
        await i.deferUpdate();
        const users2 = loadUsers();
        const u2 = users2[msg.author.id];
        if (!u2) return i.followUp({ content: "❌ Bạn chưa có nhân vật.", ephemeral: true });

        const now = Date.now();
        const last = Number(u2.bossLastAt) || 0;
        const remain = last + ATTACK_COOLDOWN_MS - now;
        if (remain > 0) {
          const sec = Math.ceil(remain / 1000);
          return i.followUp({ content: `⏳ Bạn cần chờ **${sec}s** để ra tay lần nữa.`, ephemeral: true });
        }

        const st2 = ensureBoss(users2, now);
        const sum2 = bossSummary(st2, users2);
        if (!sum2) return i.followUp({ content: "⚠️ Boss lỗi.", ephemeral: true });
        if (sum2.killedAt) {
          await sent.edit({
            embeds: [buildBossEmbed(sum2)],
            components: buildRows({ userId: msg.author.id, nonce, dead: true }),
          }).catch(() => {});
          return i.followUp({ content: "⚠️ Boss đã bị hạ gục. Hãy nhận thưởng.", ephemeral: true });
        }

        const dmg = computeDamageFromUser(u2);
        const res = applyDamage(st2, msg.author.id, dmg, now);
        if (!res.ok) return i.followUp({ content: `❌ ${res.message}`, ephemeral: true });

        // cooldown
        u2.bossLastAt = now;

        // quest + achievement
        recordQuestEvent(u2, "boss_damage", res.dmg);
        const unlockedTitles = recordAchvEvent(u2, "boss_damage", res.dmg) || [];

        users2[msg.author.id] = u2;
        saveUsers(users2);

        const afterSum = bossSummary(st2, users2);
        await sent.edit({
          embeds: [buildBossEmbed(afterSum)],
          components: buildRows({ userId: msg.author.id, nonce, dead: Boolean(afterSum.killedAt) }),
        }).catch(() => {});

        const extra = unlockedTitles.length
          ? `\n🎖 Mở khoá danh hiệu: **${unlockedTitles.join(", ")}**`
          : "";
        const killedMsg = res.killed ? "\n🏁 **Đòn này đã hạ gục Boss!**" : "";
        return i.followUp({
          content: `⚔️ Bạn gây **${fmtLT(res.dmg)}** sát thương.${killedMsg}${extra}`,
          ephemeral: true,
        });
      }

      if (cid.startsWith("boss_claim_")) {
        await i.deferUpdate();
        const users2 = loadUsers();
        const u2 = users2[msg.author.id];
        if (!u2) return i.followUp({ content: "❌ Bạn chưa có nhân vật.", ephemeral: true });

        const st2 = ensureBoss(users2, Date.now());
        if (!st2?.boss?.killedAt) return i.followUp({ content: "⚠️ Boss chưa bị hạ gục.", ephemeral: true });
        if (!canClaim(st2.boss, msg.author.id)) {
          const info = computeRewardForUser(st2.boss, msg.author.id);
          if ((Number(info.dmg) || 0) <= 0) {
            return i.followUp({ content: "❌ Bạn không có đóng góp tuần này.", ephemeral: true });
          }
          return i.followUp({ content: "⚠️ Bạn đã nhận thưởng hoặc không đủ điều kiện.", ephemeral: true });
        }

        const claimed = claimReward(st2, msg.author.id);
        if (!claimed.ok) return i.followUp({ content: `❌ ${claimed.message}`, ephemeral: true });
        u2.lt = (Number(u2.lt) || 0) + (Number(claimed.rewardLt) || 0);

        const drops = Array.isArray(claimed.drops) ? claimed.drops : [];
        if (drops.length) {
          ensureGearBag(u2);
          for (const g of drops) u2.gear.bag.push(g);
        }

        const info = claimed.info;
        const titlesUnlocked = info.rank === 1 ? (recordAchvEvent(u2, "boss_rank1", 1) || []) : [];

        users2[msg.author.id] = u2;
        saveUsers(users2);

        const rankTxt = info.rank ? `Top #${info.rank}` : "";
        const bonusTxt = info.bonus ? ` (bonus ${fmtLT(info.bonus)} LT)` : "";
        const extra = titlesUnlocked.length ? `
🎖 Mở khoá danh hiệu: **${titlesUnlocked.join(", ")}**` : "";
        const dropTxt = drops.length
          ? `
🔴 Trang bị rơi: **+${drops.length}** món
${drops
  .slice(0, 3)
  .map((g) => `• ${formatGearLines(g).title}`)
  .join("\n")}${drops.length > 3 ? `
… và thêm ${drops.length - 3} món nữa` : ""}`
          : "";
        return i.followUp({
          content:
            `✅ Nhận thưởng World Boss: **${fmtLT(claimed.rewardLt)} LT** ${rankTxt}${bonusTxt}` +
            dropTxt +
            extra,
          ephemeral: true,
        });
      }
    });

    collector.on("end", () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};
