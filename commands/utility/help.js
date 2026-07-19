const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Provides a link to the StarBot documentation.'),

  async execute(interaction) {
    await interaction.reply({
      content: 'StarBot Documentation:\nhttps://cryptpad.fr/pad/#/2/pad/view/tJEI3F6go7nOcFxllbXnt9Jn+5DuzVJ-zbLnZOHcDWc/',
      ephemeral: true
    });
  }
};