const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Try to load player_data.json and extract tags array for the command description
let tags = [];
try {
  const dataPath = path.join(__dirname, '..', '..', 'player_data.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.tags)) {
    tags = parsed.tags;
  } else if (parsed && typeof parsed === 'object') {
    const firstEntry = Object.values(parsed).find(entry => Array.isArray(entry.tags));
    if (firstEntry) tags = firstEntry.tags;
  }
} catch (e) {
  // If file missing or malformed, leave tags empty
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('risk_roll')
    .setDescription(`How many tags apply to the situation?: (${tags.join(', ')})`)
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription(`How many tags apply to the situation?: (${tags.join(', ')})`)
        .setRequired(true)
    ),

  async execute(interaction) {
    const dice = interaction.options.getInteger('number')+1;
    
    await interaction.reply({ content: `You want to roll: ${dice}D6`});
  },
};
