// Compatibility shim. Canonical progression logic lives in commands/character.js.
const c = require("../commands/character");
module.exports = { getExpNeeded: c.getExpNeeded, computeExpBonusPercent: c.computeExpBonusPercent, getRealm: c.getRealm, addXp: c.addXp };
