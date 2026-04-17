require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
const { startDispatcher } = require("./utils/dispatcher");
const { handleSkillInteraction } = require("./utils/duelMenu");
const { handleBattuInteraction } = require("./utils/battuWizard");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // cần để nhận DM
});

// đúng event name là "ready"
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startDispatcher(client);
});

// xử lý interaction (skill menu)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const isSelect = interaction.isStringSelectMenu();
    const isButton = interaction.isButton();
    if (!isSelect && !isButton) return;

    if (isSelect && interaction.customId.startsWith("duel-skill-")) {
      await handleSkillInteraction(interaction, client);
      return;
    }

    if (interaction.customId.startsWith("battu:")) {
      await handleBattuInteraction(interaction);
      return;
    }
  } catch (err) {
    console.error("❌ Interaction error:", err);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "⚠️ Có lỗi xảy ra khi xử lý skill!",
          ephemeral: true,
        });
      } catch (e) {
        console.error("❌ Reply error:", e);
      }
    }
  }
});

client.login(process.env.TOKEN);
