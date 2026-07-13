const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete_specialist')
    .setDescription('Permanently delete one of your specialist profiles')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name of the character to delete')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // Autocomplete feeds character selection targets to the player UI
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const file = path.join(__dirname, '..', '..', '..', 'player_data.json');
    let db = {};

    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      return await interaction.respond([]);
    }

    const userId = interaction.user.id;
    let characters = [];

    if (db[userId]) {
      if (Array.isArray(db[userId].characters)) {
        characters = db[userId].characters;
      } else if (db[userId].name) {
        characters = [db[userId]];
      }
    }

    const filtered = characters.filter(char => 
      char.name && char.name.toLowerCase().includes(focusedValue)
    );

    const choices = filtered.map(char => ({
      name: char.name,
      value: char.name
    })).slice(0, 25);

    await interaction.respond(choices);
  },

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
      return await replySafely(interaction, { content: "❌ You have no character profiles to delete.", ephemeral: true });
    }

    // 1. Locate character to delete
    const targetIndex = db[userId].characters.findIndex(
      char => char.name.toLowerCase() === targetName.toLowerCase()
    );

    if (targetIndex === -1) {
      return await replySafely(interaction, { 
        content: `❌ Could not find a specialist named "${targetName}". Please select from the dropdown.`, 
        ephemeral: true 
      });
    }

    // Capture name context before slicing the data entry out
    const deletedName = db[userId].characters[targetIndex].name;
    const previousActiveIndex = db[userId].activeIndex;

    // 2. Remove the profile slot from the character list
    db[userId].characters.splice(targetIndex, 1);

    // 3. Re-calculate activeIndex so it never points past array bounds or points to wrong profile
    if (db[userId].characters.length === 0) {
      db[userId].activeIndex = 0; // Empty reset
    } else if (previousActiveIndex === targetIndex) {
      // If they deleted their active character, default them back to their first character array slot
      db[userId].activeIndex = 0;
    } else if (previousActiveIndex > targetIndex) {
      // Shift active index left by 1 since splicing shifted subsequent array items downward
      db[userId].activeIndex = previousActiveIndex - 1;
    }

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      
      let followUpText = `\n🔄 Your active profile has been reset to **${db[userId].characters[db[userId].activeIndex]?.name}**.`;
      if (db[userId].characters.length === 0) {
        followUpText = `\n⚠️ You now have **0** active profiles. Use \`/create_specialist\` to play again.`;
      }

      await replySafely(interaction, { 
        content: `🗑️ Successfully deleted specialist profile: **${deletedName}**.${followUpText}`, 
        ephemeral: false 
      });
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await replySafely(interaction, { content: `Failed to save changes during character deletion.`, ephemeral: true });
    }
  },
};
