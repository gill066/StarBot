// Basic global variables
const { Client, GatewayIntentBits, Partials, Collection, Events, MessageFlags } = require("discord.js");
const fs = require('node:fs');
const path = require('node:path');
const { startPlayerDataVolumeSync } = require('./services/player_data_volume_sync');


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

// LogIn
require('dotenv').config();
startPlayerDataVolumeSync();
client.login(process.env.TOKEN);

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

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath).filter(folder => {
    const fullPath = path.join(foldersPath, folder);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
});

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command || typeof command.autocomplete !== 'function') {
            console.error(`No autocomplete handler found for ${interaction.commandName}.`);
            return;
        }

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(error);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (replyError) {
            if (replyError?.code !== 40060 && replyError?.code !== 10062) {
                console.error(replyError);
            }
        }
    }
    console.log(interaction);
});
