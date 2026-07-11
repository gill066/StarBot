const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  // Load starnet homes to populate choices for the `home` option
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('create_specialist')
      .setDescription('Create a new specialist with three attributes.')
      .addStringOption(option => option.setName('name').setDescription('Specialist name').setRequired(true))
      .addStringOption(option => option.setName('work').setDescription('Specialist work').setRequired(true));

    // attempt to load starnet.json and add choices for home
    try {
      const starnetPath = path.join(__dirname, '../../starnet.json');
      const raw = fs.readFileSync(starnetPath, 'utf8');
      const starnet = raw.trim() ? JSON.parse(raw) : {};
      const homes = starnet.homes || {};
      // Present only the key as the visible choice label; use the key as the value as well
      const choices = Object.entries(homes).map(([key, val]) => ({ name: key, value: key }));
      if (choices.length) {
        builder.addStringOption(option => option.setName('home').setDescription('Specialist home').setRequired(true).addChoices(...choices));
      } else {
        builder.addStringOption(option => option.setName('home').setDescription('Specialist home').setRequired(true));
      }
    } catch (e) {
      builder.addStringOption(option => option.setName('home').setDescription('Specialist home').setRequired(true));
    }

    return builder;
  })(),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const home = interaction.options.getString('home');
    const work = interaction.options.getString('work');

    const file = path.join(__dirname, '../../player_data.json');
    let db = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    // preserve any existing entry for this user
    const existing = db[interaction.user.id] || {};

    // load starnet.json to map the selected home key to its value (the tag)
    let homeTag = null;
    try {
      const starnetPath = path.join(__dirname, '../../starnet.json');
      const rawStarnet = fs.readFileSync(starnetPath, 'utf8');
      const starnet = rawStarnet.trim() ? JSON.parse(rawStarnet) : {};
      const homes = starnet.homes || {};
      homeTag = homes[home] || null;
    } catch (e) {
      homeTag = null;
    }

    // build tags array, pushing the homeTag if present and not already included
    const tags = Array.isArray(existing.tags) ? existing.tags.slice() : [];
    if (homeTag && !tags.includes(homeTag)) tags.push(homeTag);

    db[interaction.user.id] = {
      ...existing,
      name,
      home,
      work,
      tags,
      updatedAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      await interaction.reply({ content: 'Your variables have been saved.', ephemeral: true });
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await interaction.reply({ content: 'Failed to save variables.', ephemeral: true });
    }
  },
};
