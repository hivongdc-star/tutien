const progress = require("../commands/progress");

module.exports = {
  ACHIEVEMENTS: progress.ACHIEVEMENTS,
  ensureAchv: progress.ensureAchv,
  recordEvent: progress.recordAchievementEvent,
  checkUnlocks: progress.checkUnlocks,
};
