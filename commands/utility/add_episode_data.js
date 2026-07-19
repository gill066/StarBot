const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_episode_data')
    .setDescription('Add entries to the current episode log.')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The category of lore you are updating')
        .setRequired(true)
        .addChoices(
          { name: 'People', value: 'people' },
          { name: 'Places', value: 'places' },
          { name: 'Things', value: 'things' },
          { name: 'Ideas', value: 'ideas' }
        )
    )
    .addStringOption(option =>
      option.setName('entry')
        .setDescription('The text details you want to add to this category')
        .setRequired(true)
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category');
    const entry = interaction.options.getString('entry');
    
    // Adjust this path if your episode data file lives elsewhere
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');    
    const userId = interaction.user.id;

    let episodeDb = {};
    try {
      if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf8');
        episodeDb = raw.trim() ? JSON.parse(raw) : {};
      } else {
        // Fallback initialization if the file does not exist yet
        episodeDb = { authorId: userId, people: [], places: [], things: [], ideas: [] };
      }
    } catch (e) {
      console.error('Failed to read episode data file', e);
      await replySafely(interaction, { content: 'Critical error reading the lore database.', ephemeral: true });
      return;
    }

    // 1. Author Security Verification
    // Checks if the executing user matches the assigned author of the current episode file
    if (episodeDb.authorId && episodeDb.authorId !== userId) {
      await replySafely(interaction, { 
        content: `**Sorry.** Showrunners only. <@${episodeDb.authorId}> is the showrunner of this episode.`, 
        ephemeral: true 
      });
      return;
    }

    // 2. Ensure target array structures are instantiated safely
    if (!Array.isArray(episodeDb[category])) {
      episodeDb[category] = [];
    }

    // 3. Commit data string changes
    episodeDb[category].push(entry);

    // Save state back to the disk database securely
    try {
      fs.writeFileSync(dataPath, JSON.stringify(episodeDb, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write updated arrays back to episode data file', e);
      await replySafely(interaction, { content: 'Failed to save updates to the data file.', ephemeral: true });
      return;
    }

    // 4. Ephemeral user notification loop confirmation
    await replySafely(interaction, {
      content: `Successfully added *"${entry}"* to this episode's ${category.toUpperCase()}.`,
      ephemeral: true
    });
  }
};