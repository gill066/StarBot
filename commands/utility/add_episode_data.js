const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_episode_data')
    .setDescription('Add a new piece of lore to the current channel\'s active episode.')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('The lore database category to update')
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
        .setDescription('The text item or detail to add')
        .setRequired(true)
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category');
    const entry = interaction.options.getString('entry').trim();
    
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const channelId = interaction.channelId;
    const currentUserId = interaction.user.id;

    let db = {};

    // 1. Load the database safely
    try {
      if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf8');
        db = raw.trim() ? JSON.parse(raw) : {};
      }
    } catch (e) {
      console.error('Failed to read showrunner database file:', e);
      await interaction.reply({ content: 'Critical error accessing the showrunner file.', ephemeral: true });
      return;
    }

    // 2. Verify an episode actually exists for this channel
    if (!db[channelId]) {
      await interaction.reply({
        content: '**No Episode Found:** There is no active episode set up for this channel. Use `/episode_new` to build one first.',
        ephemeral: true
      });
      return;
    }

    const channelEpisode = db[channelId];

    // 3. Confirm execution authority against the stored userId
    if (channelEpisode.userId !== currentUserId) {
      await interaction.reply({
        content: `**Sorry:** Showrunners only. <@${channelEpisode.userId}> can update info for this episode.`,
        ephemeral: true
      });
      return;
    }

    // 4. Ensure the targeted category array exists safely
    if (!Array.isArray(channelEpisode[category])) {
      channelEpisode[category] = [];
    }

    // 5. Append the entry and track updates
    channelEpisode[category].push(entry);
    channelEpisode.timestamp = new Date().toISOString(); // Keep historical updates accurate

    // 6. Commit the final state changes back to disk
    try {
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save lore update back to file:', e);
      await interaction.reply({ content: 'File tracking error: changes could not be saved.', ephemeral: true });
      return;
    }

    // 7. Send the private ephemeral update message
    await interaction.reply({
      content: `*"${entry}"* added to to this episode's **${category.toUpperCase()}**.\n\n>`,
      ephemeral: true
    });
  }
};