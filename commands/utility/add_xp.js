const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs').promises;
const path = require('path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_xp')
    .setDescription('Add XP to your specialist')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('The amount of XP to add')
        .setRequired(true)
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const filePath = path.join(__dirname, '..', '..', 'player_data.json');

    try {
      const fileContents = await fs.readFile(filePath, 'utf8');
      const playerData = JSON.parse(fileContents || '{}');
      const userId = interaction.user.id;
      if (!playerData[userId]) playerData[userId] = {};
      const currentXp = typeof playerData[userId].xp === 'number' ? playerData[userId].xp : 0;
      playerData[userId].xp = currentXp + amount;
      await fs.writeFile(filePath, JSON.stringify(playerData, null, 2), 'utf8');

      await replySafely(interaction, `Added ${amount} XP. New total is ${playerData[userId].xp}.`);
    } catch (error) {
      console.error('Error updating XP:', error);
      await replySafely(interaction, {
        content: 'There was an error updating the XP value.',
        ephemeral: true,
      });
    }
  },
};
