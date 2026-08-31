const progress = require("../commands/progress");

module.exports = {
  getDailyKey: progress.getDailyKey,
  getISOWeekKey: progress.getISOWeekKey,
  ensureQuestState: progress.ensureQuestState,
  recordEvent: progress.recordQuestEvent,
  getQuestProgress: progress.getQuestProgress,
  canClaim: progress.canClaim,
  claim: progress.claim,
  DAILY_QUESTS: progress.DAILY_QUESTS,
  WEEKLY_QUESTS: progress.WEEKLY_QUESTS,
};
