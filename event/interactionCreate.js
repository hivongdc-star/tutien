const { handleSkillInteraction } = require("../utils/duelMenu");
const { handleBattuInteraction } = require("../utils/battuWizard");

module.exports = async (client, interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("duel-skill-")) {
      await handleSkillInteraction(interaction, client);
      return;
    }

    if ((interaction.isStringSelectMenu() || interaction.isButton()) && interaction.customId.startsWith("battu:")) {
      await handleBattuInteraction(interaction);
      return;
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
