function createBar(current, max, length = 15, emoji = "🟩") {
  if (max <= 0) max = 1;
  const filled = Math.max(0, Math.round((current / max) * length));
  const empty = Math.max(0, length - filled);
  return `${emoji.repeat(filled)}${"⬛".repeat(empty)} (${current}/${max})`;
}
module.exports = { createBar };
