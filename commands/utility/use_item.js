const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

function getPlayerData() {
  const file = path.join(__dirname, '..', '..', 'player_data.json');
  let db = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    db = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    db = {};
  }
  return { file, db };
}

function savePlayerData(file, db) {
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use_item')
    .setDescription('Use an item from your inventory')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item to use')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const { file, db } = getPlayerData();
    const userId = interaction.user.id;
    let userEntry = db[userId];

    if (!userEntry) {
      await replySafely(interaction, { content: 'No variables found for you. Create a specialist first.', ephemeral: true });
      return;
    }

    // --- STRUCTURAL MIGRATION FOR LEGACY SINGLE CHARACTERS ---
    if (userEntry.name && !userEntry.characters) {
      const legacyCharacter = { ...userEntry };
      db[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
      userEntry = db[userId];
    }

    if (!userEntry.characters || userEntry.characters.length === 0) {
      await replySafely(interaction, { content: 'You do not have any active specialist profiles.', ephemeral: true });
      return;
    }

    // Target the current active character's profile record
    const activeCharacter = userEntry.characters[userEntry.activeIndex];

    if (!activeCharacter || !Array.isArray(activeCharacter.inventory)) {
      await replySafely(interaction, { content: 'Your active specialist does not have an inventory yet.', ephemeral: true });
      return;
    }

    const item = activeCharacter.inventory.find(entry => (entry?.Name || '').toLowerCase() === String(name || '').toLowerCase());
    if (!item) {
      await replySafely(interaction, { content: `Your active specialist (**${activeCharacter.name}**) does not have an item named ${name}.`, ephemeral: true });
      return;
    }

    const remainingUses = Number(item.Uses ?? 0);
    if (remainingUses === 0) {
      await replySafely(interaction, { content: `**${item.Name}** has no uses left.`, ephemeral: true });
      return;
    }

    if (remainingUses > 0) {
      item.Uses = remainingUses - 1;
    } else if (remainingUses < 0) {
      item.Uses = -1; // Keep unlimited value preserved
    }

    savePlayerData(file, db);
    
    const usesAlert = item.Uses < 0 ? '(Unlimited)' : `(${item.Uses}↺ remaining)`;
    await replySafely(interaction, { content: `**${activeCharacter.name}** used **${item.Name}** ${usesAlert}.\n*${item.Use}*`, ephemeral: false });
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const { db } = getPlayerData();
    const userId = interaction.user.id;
    const userEntry = db[userId];

    let inventory = [];

    // Safely look up character items within autocomplete parsing boundaries
    if (userEntry) {
      if (Array.isArray(userEntry.characters) && userEntry.characters[userEntry.activeIndex]) {
        inventory = userEntry.characters[userEntry.activeIndex].inventory || [];
      } else if (userEntry.name && Array.isArray(userEntry.inventory)) {
        // Fallback option mapping context for unmigrated single characters
        inventory = userEntry.inventory;
      }
    }

    const choices = inventory
      .filter(entry => entry?.Name)
      .map(entry => ({ name: entry.Name, value: entry.Name }))
      .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25);

    await interaction.respond(choices);
  },
};
 