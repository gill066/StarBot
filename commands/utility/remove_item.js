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

// Rewritten helper targeting the active character object profile fields directly
function recalculateInventoryStats(db, userId) {
  const userEntry = db[userId];
  if (!userEntry || !userEntry.characters || !userEntry.characters[userEntry.activeIndex]) return;

  const activeCharacter = userEntry.characters[userEntry.activeIndex];
  if (!Array.isArray(activeCharacter.inventory)) activeCharacter.inventory = [];

  const getNumeric = value => Number(value ?? 0) || 0;
  const inventoryLoad = activeCharacter.inventory.reduce((sum, item) => sum + getNumeric(item?.Weight), 0);
  const inventoryCapChange = activeCharacter.inventory.reduce((sum, item) => sum + getNumeric(item?.CapChange), 0);
  const perksArr = Array.isArray(activeCharacter.perks) ? activeCharacter.perks : [];
  const perkCapChange = perksArr.reduce((sum, perk) => sum + getNumeric(perk?.CapChange), 0);

  activeCharacter.load = inventoryLoad;
  activeCharacter.capacity = 6 + inventoryCapChange + perkCapChange;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_item')
    .setDescription('Remove an item from your inventory')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item to remove')
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

    // Extract the active profile matching the active pointer index
    const activeCharacter = userEntry.characters[userEntry.activeIndex];

    if (!activeCharacter || !Array.isArray(activeCharacter.inventory)) {
      await replySafely(interaction, { content: 'Your active specialist does not have an inventory yet.', ephemeral: true });
      return;
    }

    const itemIndex = activeCharacter.inventory.findIndex(entry => (entry?.Name || '').toLowerCase() === String(name || '').toLowerCase());
    if (itemIndex === -1) {
      await replySafely(interaction, { content: `Your active specialist (**${activeCharacter.name}**) does not have an item named ${name}.`, ephemeral: true });
      return;
    }

    // Splice from the specific active character's list block area bounds
    const removedItem = activeCharacter.inventory.splice(itemIndex, 1)[0];
    recalculateInventoryStats(db, userId);
    savePlayerData(file, db);

    await replySafely(interaction, { content: `Removed **${removedItem?.Name || name}** from **${activeCharacter.name}**'s inventory. New load: ${activeCharacter.load}`, ephemeral: true });
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const { db } = getPlayerData();
    const userId = interaction.user.id;
    const userEntry = db[userId];

    let inventory = [];

    // Safely pull items belonging strictly to the active specialist during character lookup
    if (userEntry) {
      if (Array.isArray(userEntry.characters) && userEntry.characters[userEntry.activeIndex]) {
        inventory = userEntry.characters[userEntry.activeIndex].inventory || [];
      } else if (userEntry.name && Array.isArray(userEntry.inventory)) {
        // Unmigrated legacy user fallback matching context path
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
