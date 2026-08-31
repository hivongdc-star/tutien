const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ComponentType,
} = require("discord.js");
const { createUser, loadUsers, saveUsers, getUser } = require("../utils/storage");
const races = require("../utils/races");
const elements = require("../utils/element");
const { getExpNeeded } = require("../utils/xp");
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

function ensureGear(user) {
  if (!user.gear) user.gear = {};
  if (!user.gear.equipped || typeof user.gear.equipped !== "object") {
    user.gear.equipped = { weapon: null, armor: null, boots: null, bracelet: null };
  }
}

const create = {
  name: "create",
  aliases: ["c", "crate"],
  run: async (_client, msg) => {
    const users = loadUsers();
    if (users[msg.author.id]) return msg.reply("⚠️ Đạo hữu đã nhập đạo rồi. Dùng `-profile` để xem hồ sơ hiện tại.");

    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("select_race")
      .setPlaceholder("Chọn huyết mạch...")
      .addOptions(Object.entries(races).map(([key, r]) => ({ label: r.name.substring(0, 25), value: key, emoji: r.emoji })));
    const elementMenu = new StringSelectMenuBuilder()
      .setCustomId("select_element")
      .setPlaceholder("Chọn bản mệnh ngũ hành...")
      .addOptions(Object.entries(elements.display).map(([key, raw]) => {
        const [emoji, name] = raw.split(" ");
        return { label: name.substring(0, 25), value: key, emoji };
      }));

    const reply = await msg.reply({
      embeds: [new EmbedBuilder().setTitle("✨ Khai Mở Nhân Vật").setDescription("Chọn **huyết mạch** và **bản mệnh ngũ hành** để khai mở tiên đồ.").setColor(0x8E44AD)],
      components: [new ActionRowBuilder().addComponents(raceMenu), new ActionRowBuilder().addComponents(elementMenu)],
    });

    let selectedRace = null;
    let selectedElement = null;
    let created = false;
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({ content: "⚠️ Đây không phải lựa chọn của đạo hữu.", ephemeral: true });
      }
      if (interaction.customId === "select_race") {
        selectedRace = interaction.values[0];
        await interaction.reply({ content: `Đã chọn huyết mạch: **${races[selectedRace].emoji} ${races[selectedRace].name}**`, ephemeral: true });
      }
      if (interaction.customId === "select_element") {
        selectedElement = interaction.values[0];
        await interaction.reply({ content: `Đã chọn bản mệnh: **${elements.display[selectedElement]}**`, ephemeral: true });
      }
      if (selectedRace && selectedElement && !created) {
        created = true;
        const newUser = createUser(msg.author.id, selectedRace, selectedElement);
        newUser.background = "default";
        const confirm = new EmbedBuilder()
          .setTitle("✅ Nhập Đạo Thành Công")
          .setColor(0x2ECC71)
          .setDescription(
            `Huyết mạch: **${races[selectedRace].emoji} ${races[selectedRace].name}**\n` +
            `Bản mệnh: **${elements.display[selectedElement]}**\n` +
            `Cảnh giới: **${newUser.realm}**\n\n` +
            `Sinh lực: **${newUser.hp}/${newUser.maxHp}**\n` +
            `Linh lực: **${newUser.mp}/${newUser.maxMp}**\n` +
            `Công kích: **${newUser.atk}**\nPhòng ngự: **${newUser.def}**\nThân pháp: **${newUser.spd}**\n` +
            `Linh thạch: **${newUser.lt}**`
          )
          .setFooter({ text: "Dùng -profile để xem hồ sơ, -bag để mở hành trang." });
        await msg.channel.send({ embeds: [confirm] });
        collector.stop();
      }
    });
    collector.on("end", () => {
      if (!created) msg.channel.send("⏳ Đạo hữu chưa hoàn tất khai mệnh. Dùng `-create` để bắt đầu lại.");
    });
  },
};

const reset = {
  name: "reset",
  aliases: ["rs"],
  run: async (_client, msg) => {
    const users = loadUsers();
    if (!users[msg.author.id]) return msg.reply("⚠️ Đạo hữu chưa có nhân vật để tái lập căn cơ.");
    delete users[msg.author.id];
    saveUsers(users);

    const raceMenu = new StringSelectMenuBuilder()
      .setCustomId("reset_select_race")
      .setPlaceholder("🧬 Chọn lại Tộc")
      .addOptions(Object.entries(races).map(([key, r]) => ({ label: r.name.substring(0, 25), value: key, emoji: r.emoji })));
    const elementMenu = new StringSelectMenuBuilder()
      .setCustomId("reset_select_element")
      .setPlaceholder("🌿 Chọn lại Ngũ hành")
      .addOptions(Object.entries(elements.display).map(([key, raw]) => {
        const [emoji, ...rest] = String(raw || "").split(" ");
        return { label: rest.join(" ").substring(0, 25), value: key, emoji };
      }));

    const reply = await msg.channel.send({
      embeds: [new EmbedBuilder().setColor("Red").setTitle("♻️ Tái Lập Căn Cơ").setDescription(`Nhân vật của **${msg.author.username}** đã được xoá.\n👉 Hãy chọn lại **Tộc** và **Ngũ hành** để bắt đầu lại từ đầu!`)],
      components: [new ActionRowBuilder().addComponents(raceMenu), new ActionRowBuilder().addComponents(elementMenu)],
    });

    let selectedRace = null;
    let selectedElement = null;
    let completed = false;
    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async (interaction) => {
      if (interaction.user.id !== msg.author.id) {
        return interaction.reply({ content: "⚠️ Đạo hữu chỉ có thể tái lập căn cơ của chính mình.", ephemeral: true });
      }
      if (interaction.customId === "reset_select_race") {
        selectedRace = interaction.values[0];
        await interaction.reply({ content: `🧬 Đã chọn lại **${races[selectedRace].emoji} ${races[selectedRace].name}**`, ephemeral: true });
      }
      if (interaction.customId === "reset_select_element") {
        selectedElement = interaction.values[0];
        await interaction.reply({ content: `🌿 Đã chọn lại **${elements.display[selectedElement]}**`, ephemeral: true });
      }
      if (selectedRace && selectedElement && !completed) {
        completed = true;
        const newUser = createUser(msg.author.id, selectedRace, selectedElement);
        const confirm = new EmbedBuilder()
          .setTitle("✅ Tái Lập Thành Công").setColor("Green")
          .setDescription(
            `🧬 **Tộc:** ${races[selectedRace].emoji} ${races[selectedRace].name}\n` +
            `🌿 **Ngũ hành:** ${elements.display[selectedElement]}\n` +
            `⚔️ **Cảnh giới:** ${newUser.realm}\n` +
            `❤️ HP: ${newUser.hp}/${newUser.maxHp} | 🔷 MP: ${newUser.mp}/${newUser.maxMp}\n` +
            `🔥 Công: ${newUser.atk} | 🛡️ Thủ: ${newUser.def} | ⚡ Tốc: ${newUser.spd}\n` +
            `💢 Nộ: ${newUser.fury} | 💎 Linh Thạch: ${newUser.lt}`
          );
        await msg.channel.send({ embeds: [confirm] });
        collector.stop("done");
      }
    });
    collector.on("end", (_collected, reason) => {
      if (reason !== "done") msg.channel.send("⏳ Reset không hoàn tất, hãy dùng lại lệnh `-reset`.");
    });
  },
};

const profile = {
  name: "profile",
  aliases: ["p", "prof"],
  run: async (_client, msg) => {
    const user = getUser(msg.author.id);
    if (!user) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` để khai mở nhân vật.");
    const displayName = user.name && user.name !== "Chưa đặt tên" ? user.name : msg.author.username;
    const titlePrefix = user.title ? `[${user.title}] ` : "";
    const raceLabel = races[user.race]?.name || user.race || "?";
    const elementLabel = elements.display[user.element] || user.element || "?";
    const expNeed = getExpNeeded(Number(user.level) || 1);
    const embed = new EmbedBuilder()
      .setColor(0x5865F2).setTitle("📜 Hồ Sơ Tu Luyện")
      .setThumbnail(msg.author.displayAvatarURL({ extension: "png", size: 256 }))
      .setDescription(`**${titlePrefix}${displayName}**\n${user.realm || "(chưa rõ)"}\n\n${raceLabel} • ${elementLabel}`)
      .addFields(
        { name: "Tiến cảnh", value: `Cấp tu luyện: **${Number(user.level) || 1}**\nKinh nghiệm: **${Number(user.exp) || 0}/${expNeed}**\nLinh thạch: **${Number(user.lt) || 0}**`, inline: true },
        { name: "Nội thể", value: `Sinh lực: **${Number(user.hp) || 0}/${Number(user.maxHp) || 0}**\nLinh lực: **${Number(user.mp) || 0}/${Number(user.maxMp) || 0}**`, inline: true },
        { name: "Nền tảng", value: `Công kích: **${Number(user.atk) || 0}**\nPhòng ngự: **${Number(user.def) || 0}**\nThân pháp: **${Number(user.spd) || 0}**` },
        { name: "Lời tự thuật", value: user.bio ? String(user.bio).slice(0, 1024) : "Chưa lưu lại lời tự thuật." }
      )
      .setFooter({ text: "Dùng -nv để xem chi tiết gia tăng từ pháp bảo và chiêu thức." });
    return msg.reply({ embeds: [embed] });
  },
};

const nv = {
  name: "nv",
  aliases: ["nhanvat", "char"],
  description: "Xem chỉ số nhân vật.",
  run: async (_client, msg) => {
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
    const embed = new EmbedBuilder()
      .setColor(tierMeta("huyen").color).setTitle("🧾 Nền Tảng Nhân Vật")
      .setDescription(`**${titlePrefix}${user.name || msg.author.username}**\n${user.realm || "(chưa rõ)"} • ${races[user.race]?.name || user.race || "?"} • ${elements.display[user.element] || user.element || "?"}\nCấp tu luyện: **${user.level || 1}** • Linh thạch: **${user.lt || 0}**`)
      .addFields(
        { name: "Sinh lực & linh lực", value: `Sinh lực: ${progressBar(curHp, effMaxHp, 12)} **${curHp}/${effMaxHp}** _( +${formatPct(mainPct.hp)}% )_\nLinh lực: ${progressBar(curMp, effMaxMp, 12)} **${curMp}/${effMaxMp}** _( +${formatPct(mainPct.mp)}% )_` },
        { name: "Chỉ số nền", value: `Công kích: **${baseAtk}** _( +${formatPct(mainPct.atk)}% )_ → **${effAtk}**\nPhòng ngự: **${baseDef}** _( +${formatPct(mainPct.def)}% )_ → **${effDef}**\nThân pháp: **${baseSpd}** _( +${formatPct(mainPct.spd)}% )_ → **${effSpd}**` },
        { name: "Thuộc tính kèm theo", value: affLines.join("\n") },
        { name: "Chiêu thức đang mang", value: skillLines.join("\n") }
      );
    return msg.reply({ embeds: [embed] });
  },
};

const bio = {
  name: "bio",
  aliases: ["b", "thongtin", "about"],
  run: (_client, msg, args) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.channel.send("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    const text = args.join(" ");
    if (!text) return msg.channel.send("❌ Hãy nhập bio mới.");
    if (text.length > 200) return msg.channel.send("⚠️ Bio quá dài, tối đa 200 ký tự.");
    user.bio = text.replace(/[*_`~|]/g, "");
    saveUsers(users);
    return msg.channel.send("✅ Cập nhật bio thành công.");
  },
};

const doiten = {
  name: "doiten",
  aliases: ["rename", "name"],
  run: (_client, msg, args) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.channel.send("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    const newName = args.join(" ");
    if (!newName) return msg.channel.send("❌ Hãy nhập đạo hiệu mới.");
    if (newName.length > 30) return msg.channel.send("⚠️ Đạo hiệu quá dài, tối đa 30 ký tự.");
    const safeName = newName.replace(/[*_`~|]/g, "");
    user.name = safeName;
    saveUsers(users);
    return msg.channel.send(`✅ Đạo hiệu đã đổi thành: **${safeName}**`);
  },
};

const danhhieu = {
  name: "danhhieu",
  aliases: ["title"],
  run: async (_client, msg) => {
    const users = loadUsers();
    const user = users[msg.author.id];
    if (!user) return msg.reply("❌ Đạo hữu chưa nhập đạo. Dùng `-create` trước.");
    user.titles = user.titles || [];
    if (!user.titles.length) return msg.reply("❌ Đạo hữu chưa có danh hiệu nào.");
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`title_${msg.author.id}`)
      .setPlaceholder("Chọn danh hiệu...")
      .addOptions(user.titles.slice(0, 25).map((t) => ({ label: t.slice(0, 100), value: t.slice(0, 100), description: `Chọn danh hiệu: ${t}`.slice(0, 100) })));
    const sent = await msg.reply({ content: "🎖 Chọn danh hiệu muốn hiển lộ:", components: [new ActionRowBuilder().addComponents(menu)] });
    const collector = sent.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 });
    collector.on("collect", (i) => {
      if (i.user.id !== msg.author.id) return i.reply({ content: "❌ Đây không phải danh sách danh hiệu của đạo hữu.", ephemeral: true });
      const chosen = i.values[0];
      user.title = chosen;
      saveUsers(users);
      return i.update({ content: `✅ Đã chọn danh hiệu **${chosen}**`, components: [] });
    });
    collector.on("end", () => sent.edit({ components: [] }).catch(() => {}));
  },
};

module.exports = [create, reset, profile, nv, bio, doiten, danhhieu];
