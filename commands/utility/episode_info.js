const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('episode_info')
    .setDescription('Displays the episode info for this channel if you are the showrunner.'),

  async execute(interaction) {
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const channelId = interaction.channelId;
    const currentUserId = interaction.user.id;

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

    // 1. Check if data exists for this channel
    if (!channelData) {
      await interaction.reply({
        content: 'No episode information has been configured for this channel yet.',
        ephemeral: true
      });
      return;
    }

    // 2. Security Check: Compare the executing user's ID against the stored creator's ID
    if (channelData.userId !== currentUserId) {
      await interaction.reply({
        content: `Access Denied. Only the showrunner (${channelData.updatedBy || 'Unknown Showrunner'}) can view this data.`,
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

    // 4. Send the private information breakdown
    await interaction.reply({
      content: `**Episode info:**\n\n` +
               `**Question:** "${question}"\n` +
               `**People:** ${formattedPeople || 'None'}\n` +
               `**Places:** ${formattedPlaces || 'None'}\n` +
               `**Things:** ${formattedThings || 'None'}\n` +
               `**Ideas:** ${formattedIdeas || 'None'}`,
      ephemeral: true
    });
  }
};