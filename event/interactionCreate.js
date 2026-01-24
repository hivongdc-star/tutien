const { handleSkillInteraction } = require("../utils/duelMenu");

module.exports = async (client, interaction) => {
  try {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("duel-skill-")
    ) {
      await handleSkillInteraction(interaction, client);
    }
  } catch (err) {
    console.error("❌ Interaction error:", err);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "⚠️ Có lỗi khi xử lý interaction!",
          ephemeral: true,
        });
      } catch (e) {
        console.error("❌ Reply error:", e);
      }
    }
  }
};
