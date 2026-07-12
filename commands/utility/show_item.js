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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('show_item')
    .setDescription('Show details for one of your items')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item to display')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const { db } = getPlayerData();
    const userId = interaction.user.id;

    if (!db[userId] || !Array.isArray(db[userId].inventory)) {
      await replySafely(interaction, { content: 'You do not have an inventory yet.', ephemeral: true });
      return;
    }

    const item = db[userId].inventory.find(entry => (entry?.Name || '').toLowerCase() === String(name || '').toLowerCase());
    if (!item) {
      await replySafely(interaction, { content: `You do not have an item named ${name}.`, ephemeral: true });
      return;
    }

    const usesRemaining = item.Uses < 0 ? 'Unlimited' : item.Uses;
    const maxUses = item.MaxUses < 0 ? 'Unlimited' : item.MaxUses;
    const details = [
      `Name: ${item.Name}`,
      `Function: ${item.Use}`,
      `Weight: ${item.Weight}`,
      `Uses Remaining: ${usesRemaining}`,
      `Max Uses: ${maxUses}`,
    ].join('\n');

    await replySafely(interaction, { content: details, ephemeral: true });
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
