const { loadUsers, saveUsers } = require("../utils/storage");
const races = require("../utils/races");
const elements = require("../utils/element");
const { getRealm } = require("../utils/xp");
const OWNER_ID = process.env.OWNER_ID;

module.exports = {
  name: "fixdata",
  description: "Chuẩn hóa & tính lại chỉ số nhân vật theo level (admin only)",
  aliases: ["fd"],

  run(client, msg) {
    if (msg.author.id !== OWNER_ID) {
      return msg.reply("❌ Đạo hữu không có quyền dùng lệnh này.");
    }

    const users = loadUsers();
    let fixed = 0;

    for (const id in users) {
      const u = users[id];
      if (!u) continue;

      const level = u.level || 1;
      const race = u.race || "nhan";
      const element = u.element || "kim";

      // 🟢 Base stats level 1
      let hp = 100,
        maxHp = 100;
      let mp = 100,
        maxMp = 100;
      let atk = 10,
        def = 10,
        spd = 10;

      // 🔄 Loop từ level 2 → level hiện tại
      for (let lv = 2; lv <= level; lv++) {
        // Cộng theo Tộc
        const raceGain = races[race]?.gain || {};
        for (let stat in raceGain) {
          if (stat === "hp") maxHp += raceGain[stat];
          else if (stat === "mp") maxMp += raceGain[stat];
          else if (stat === "atk") atk += raceGain[stat];
          else if (stat === "def") def += raceGain[stat];
          else if (stat === "spd") spd += raceGain[stat];
        }

        // Cộng theo Ngũ hành
        const eleGain = elements[element] || {};
        for (let stat in eleGain) {
          if (stat === "hp") maxHp += eleGain[stat];
          else if (stat === "mp") maxMp += eleGain[stat];
          else if (stat === "atk") atk += eleGain[stat];
          else if (stat === "def") def += eleGain[stat];
          else if (stat === "spd") spd += eleGain[stat];
        }

        // Tăng trưởng cơ bản
        maxHp += 100;
        maxMp += 20;

        // Breakthrough
        if (lv % 10 === 1) {
          let multiplier = race === "than" ? 1.6 : 1.5;
          atk = Math.floor(atk * multiplier);
          def = Math.floor(def * multiplier);
          spd = Math.floor(spd * multiplier);
          maxHp = Math.floor(maxHp * multiplier);
          maxMp = Math.floor(maxMp * multiplier);
        }
      }

      // 🟢 Cập nhật lại user
      users[id] = {
        ...u,
        race,
        element,
        level,
        realm: getRealm(level),
        hp: maxHp,
        maxHp,
        mp: maxMp,
        maxMp,
        atk,
        def,
        spd,
        fury: 0,
        buffs: [],
        shield: 0,
        buffCooldowns: {},
      };

      fixed++;
    }

    saveUsers(users);
    msg.reply(`✅ Đã chuẩn hóa & tính lại chỉ số cho **${fixed}** nhân vật.`);
  },
};
