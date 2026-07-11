const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getvars')
    .setDescription('Get your saved variables from the player database.'),

  async execute(interaction) {
    const file = path.join(__dirname, '../../player_data.json');
    let db = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    const entry = db[interaction.user.id];
    if (!entry) {
      await interaction.reply({ content: 'No variables found for you. Use /setvars first.', ephemeral: true });
      return;
    }

    await interaction.reply({
      content: `Your specialist:\n• Name: ${entry.name}\n• Home: ${entry.home}\n• Work: ${entry.work}\n• Tags: ${entry.tags?.join(', ') || 'None'}`,
      ephemeral: false,
    });
  },
};
