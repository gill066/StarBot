// Basic global variables
const { Client, GatewayIntentBits, Partials } = require("discord.js");

// Use GatewayIntentBits constants. Comment privileged intents if you don't
// plan to enable them in the Developer Portal.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        // Privileged intents (enable in Developer Portal if needed):
        // GatewayIntentBits.GuildMembers,
        // GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// Fires when bot is online
client.on("ready", () => {
    console.clear();
    console.log(`Bot Online\nLogged as: ${client.user.username}#${client.user.discriminator}`);
    client.user.setPresence({
        status: "online"
    });
    client.user.setActivity("Connecting The Stars");
    // You can set a custom activity as well
})

// Fires when bot gets in a guild
client.on("guildCreate", server => {
    // Your code here...
})

// Fires when a member sends a message to chat
client.on("messageCreate", async (message) => {
    // Ignore other bots
    if (message.author && message.author.bot) return;

    // Safe console log
    console.log(`${message.author.username}#${message.author.discriminator}: ${message.content || ''}`);

    // Example command (case-insensitive, trimmed)
    const content = (message.content || '').toLowerCase().trim();
    if (content === "!mycommand") {
        try {
            await message.reply("Hi there! You've executed my command!");
        } catch (err) {
            // Fallback if reply fails (e.g., DMs disabled)
            try { await message.channel.send("Hi there! You've executed my command!"); } catch (e) { /* ignore */ }
        }
    }

    // Your code here...

});


// Fires when a member join a guild
client.on("guildMemberAdd", member => {
    // Your code here...
});

// LogIn
const config = require('./.config.json');
client.login(config.token);