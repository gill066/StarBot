const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('save_episode')
    .setDescription('Save the current channel\'s episode into your showrunner profile.')
    .addStringOption(option =>
      option.setName('slot_name')
        .setDescription('Give this save slot a descriptive name')
        .setRequired(false)
    ),

  async execute(interaction) {
    const slotNameInput = interaction.options.getString('slot_name');
    
    const showrunnerPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const playerPath = path.join(__dirname, '..', '..', 'player_data.json');
    
    const channelId = interaction.channelId;
    const userId = interaction.user.id;

    // 1. Load and check Showrunner Data
    let showrunnerDb = {};
    if (fs.existsSync(showrunnerPath)) {
      try {
        const raw = fs.readFileSync(showrunnerPath, 'utf8');
        showrunnerDb = raw.trim() ? JSON.parse(raw) : {};
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: 'Error reading showrunner data.', ephemeral: true });
      }
    }

    const currentEpisode = showrunnerDb[channelId];
    if (!currentEpisode) {
      return interaction.reply({ content: 'There is no active episode data running in this channel to save.', ephemeral: true });
    }

    // 2. Authority Verification Check
    if (currentEpisode.userId !== userId) {
      return interaction.reply({ 
        content: `Only the showrunner <@${currentEpisode.userId}> can save it.`, 
        ephemeral: true 
      });
    }

    // 3. Load and prepare Player Data
    let playerDb = {};
    if (fs.existsSync(playerPath)) {
      try {
        const raw = fs.readFileSync(playerPath, 'utf8');
        playerDb = raw.trim() ? JSON.parse(raw) : {};
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: 'Error reading player data.', ephemeral: true });
      }
    }

    // Ensure user profile structure exists safely
    if (!playerDb[userId]) {
      playerDb[userId] = { activeIndex: 0, characters: [] };
    }
    if (!Array.isArray(playerDb[userId].savedEpisodes)) {
      playerDb[userId].savedEpisodes = [];
    }

    // 4. Maximum Limit Boundary Guard
    if (playerDb[userId].savedEpisodes.length >= 5) {
      return interaction.reply({
        content: `**Save Limit Reached:** You have hit the maximum capacity of **5 saved episodes**. You must delete a saved episode using /delete_episode before saving a new one.`,
        ephemeral: true
      });
    }

    // 5. Construct Save Entry Instance
    const finalSlotName = slotNameInput || currentEpisode.question || `Episode Archive (${new Date().toLocaleDateString()})`;
    
    const saveEntry = {
      saveId: Date.now().toString(), // Used as a unique key descriptor for dropdown menus
      slotName: finalSlotName,
      savedAt: new Date().toISOString(),
      episodeData: { ...currentEpisode } // Deep copy of the source configuration
    };

    playerDb[userId].savedEpisodes.push(saveEntry);

    // 6. Write back to Disk
    try {
      fs.writeFileSync(playerPath, JSON.stringify(playerDb, null, 2), 'utf8');
    } catch (e) {
      console.error(e);
      return interaction.reply({ content: 'Failed to write updates to player profile archiving array.', ephemeral: true });
    }

    await interaction.reply({
      content: `Episode **"${finalSlotName}"** saved. (${playerDb[userId].savedEpisodes.length}/5 slots filled)`,
      ephemeral: true
    });
  }
};