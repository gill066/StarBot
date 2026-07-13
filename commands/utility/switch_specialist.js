const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('switch_specialist')
    .setDescription('Switch your currently active specialist profile')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name of the character to switch to')
        .setRequired(true)
        .setAutocomplete(true) // 1. Tells Discord to request choices from our bot
    ),

  // 2. The Autocomplete Engine: Runs dynamically as the player types
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const file = path.join(__dirname, '..', '..', 'player_data.json');
    let db = {};

    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      return await interaction.respond([]);
    }

    const userId = interaction.user.id;
    let characters = [];

    // Account for legacy data migration inside the autocomplete choice finder
    if (db[userId]) {
      if (Array.isArray(db[userId].characters)) {
        characters = db[userId].characters;
      } else if (db[userId].name) {
        characters = [db[userId]];
      }
    }

    // Filter characters matching what the user has typed so far
    const filtered = characters.filter(char => 
      char.name && char.name.toLowerCase().includes(focusedValue)
    );

    // Turn characters into Discord choice options (Max 25 choices allowed by Discord API)
    const choices = filtered.map(char => ({
      name: char.name,
      value: char.name
    })).slice(0, 25);

    // Return options back to the user interface
    await interaction.respond(choices);
  },

  // 3. The Execution Engine: Runs when the player submits the command
  async execute(interaction) {
    const targetName = interaction.options.getString('name');
    const file = path.join(__dirname, '..', '..', 'player_data.json');
    let db = {};
    
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    const userId = interaction.user.id;
    const userEntry = db[userId];

    // Legacy migration fallback
    if (userEntry && userEntry.name && !userEntry.characters) {
      const legacyCharacter = { ...userEntry };
      db[userId] = { activeIndex: 0, characters: [legacyCharacter] };
    }

    if (!db[userId] || !db[userId].characters || db[userId].characters.length === 0) {
      return await replySafely(interaction, { content: "❌ You don't have any characters to switch to.", ephemeral: true });
    }

    // Search array for name match (case-insensitive)
    const targetIndex = db[userId].characters.findIndex(
      char => char.name.toLowerCase() === targetName.toLowerCase()
    );

    if (targetIndex === -1) {
      return await replySafely(interaction, { 
        content: `❌ Could not find a specialist named "**${targetName}**". Use the autocomplete list!`, 
        ephemeral: true 
      });
    }

    // Set the pointer index to the found match
    db[userId].activeIndex = targetIndex;
    const matchedCharacter = db[userId].characters[targetIndex];

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      await replySafely(interaction, { 
        content: `🔄 Successfully switched active profile to **${matchedCharacter.name}**!`, 
        ephemeral: false 
      });
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await replySafely(interaction, { content: `Failed to save changes.`, ephemeral: true });
    }
  },
};
