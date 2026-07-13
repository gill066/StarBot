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

      // 1. Structure Check & Setup
      if (!playerData[userId]) {
        playerData[userId] = {
          activeIndex: 0,
          characters: []
        };
      }

      // Convert legacy single character to the new array system if needed
      if (playerData[userId].name && !playerData[userId].characters) {
        const legacyCharacter = { ...playerData[userId] };
        playerData[userId] = {
          activeIndex: 0,
          characters: [legacyCharacter]
        };
      }

      // Reject execution if they have zero characters saved
      if (playerData[userId].characters.length === 0) {
        return await replySafely(interaction, {
          content: "❌ You don't have any characters created yet. Use `/create_specialist` first!",
          ephemeral: true,
        });
      }

      // 2. Target the currently active character object
      const activeCharacter = playerData[userId].characters[playerData[userId].activeIndex];

      // 3. Update the character's internal XP stat securely
      const currentXp = typeof activeCharacter.xp === 'number' ? activeCharacter.xp : 0;
      activeCharacter.xp = currentXp + amount;

      // Write data back to file
      await fs.writeFile(filePath, JSON.stringify(playerData, null, 2), 'utf8');

      await replySafely(interaction, `Added ${amount} XP to **${activeCharacter.name}**. New total is ${activeCharacter.xp}.`);
    } catch (error) {
      console.error('Error updating XP:', error);
      await replySafely(interaction, {
        content: 'There was an error updating the XP value.',
        ephemeral: true,
      });
    }
  },
};
