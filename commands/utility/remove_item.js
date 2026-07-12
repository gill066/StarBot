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

function recalculateInventoryStats(db, userId) {
  if (!db[userId]) db[userId] = {};
  if (!Array.isArray(db[userId].inventory)) db[userId].inventory = [];

  const getNumeric = value => Number(value ?? 0) || 0;
  const inventoryLoad = db[userId].inventory.reduce((sum, item) => sum + getNumeric(item?.Weight), 0);
  const inventoryCapChange = db[userId].inventory.reduce((sum, item) => sum + getNumeric(item?.CapChange), 0);
  const perksArr = Array.isArray(db[userId].perks) ? db[userId].perks : [];
  const perkCapChange = perksArr.reduce((sum, perk) => sum + getNumeric(perk?.CapChange), 0);

  db[userId].load = inventoryLoad;
  db[userId].capacity = 6 + inventoryCapChange + perkCapChange;
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

    if (!db[userId] || !Array.isArray(db[userId].inventory)) {
      await replySafely(interaction, { content: 'You do not have an inventory yet.', ephemeral: true });
      return;
    }

    const itemIndex = db[userId].inventory.findIndex(entry => (entry?.Name || '').toLowerCase() === String(name || '').toLowerCase());
    if (itemIndex === -1) {
      await replySafely(interaction, { content: `You do not have an item named ${name}.`, ephemeral: true });
      return;
    }

    const removedItem = db[userId].inventory.splice(itemIndex, 1)[0];
    recalculateInventoryStats(db, userId);
    savePlayerData(file, db);

    await replySafely(interaction, { content: `Removed ${removedItem?.Name || name} from your inventory.`, ephemeral: true });
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const { db } = getPlayerData();
    const userId = interaction.user.id;
    const inventory = Array.isArray(db[userId]?.inventory) ? db[userId].inventory : [];

    const choices = inventory
      .filter(entry => entry?.Name)
      .map(entry => ({ name: entry.Name, value: entry.Name }))
      .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25);

    await interaction.respond(choices);
  },
};
