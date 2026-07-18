const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('episode_info')
    .setDescription('Displays the active showrunner data for this channel if you are the creator.')
    .addBooleanOption(option =>
      option.setName('public')
        .setDescription('Set to true to display this information publicly to the channel instead of privately.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const channelId = interaction.channelId;
    const currentUserId = interaction.user.id;

    // Retrieve the optional 'public' argument (defaults to false if not provided)
    const isPublic = interaction.options.getBoolean('public') ?? false;

    // Read the current data file safely
    let db = {};
    try {
      if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf8');
        db = raw.trim() ? JSON.parse(raw) : {};
      }
    } catch (e) {
      console.error('Failed to read showrunner data file:', e);
    }

    const channelData = db[channelId];

    // 1. Check if data exists for this channel (always ephemeral)
    if (!channelData) {
      await interaction.reply({
        content: 'No episode information has been configured for this channel yet.',
        ephemeral: true
      });
      return;
    }

    // 2. Security Check: Compare the executing user's ID against the stored creator's ID (always ephemeral)
    if (channelData.userId !== currentUserId) {
      await interaction.reply({
        content: `Access Denied. Only the user who initialized this episode configuration (**${channelData.updatedBy || 'Unknown Showrunner'}**) can view this data.`,
        ephemeral: true
      });
      return;
    }

    // 3. Extract and safely format the contents for display
    const { question, people, places, things, ideas } = channelData;

    const formattedPeople = Array.isArray(people) ? people.join(', ') : 'None';
    const formattedPlaces = Array.isArray(places) ? places.join(', ') : 'None';
    const formattedThings = Array.isArray(things) ? things.join(', ') : 'None';
    const formattedIdeas = Array.isArray(ideas) ? ideas.join(', ') : 'None';

    // 4. Send the breakdown (visbility toggled by the 'public' choice)
    await interaction.reply({
      content: `**Episode info for this Channel:**\n\n` +
               `**Question:** "${question}"\n` +
               `**People:** ${formattedPeople || 'None'}\n` +
               `**Places:** ${formattedPlaces || 'None'}\n` +
               `**Things:** ${formattedThings || 'None'}\n` +
               `**Ideas:** ${formattedIdeas || 'None'}`,
      ephemeral: !isPublic // If public is true, ephemeral is false
    });
  }
};