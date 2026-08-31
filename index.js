require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events } = require("discord.js");
const { startDispatcher } = require("./utils/dispatcher");
const { handleSkillInteraction } = require("./commands/pvp");
const { handleBattuInteraction } = require("./commands/fortune");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  startDispatcher(client);
});

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
        await interaction.reply({ content: "⚠️ Có lỗi xảy ra khi xử lý tương tác.", ephemeral: true });
      } catch (e) {
        console.error("❌ Reply error:", e);
      }
    }
  }
});

client.login(process.env.TOKEN);
