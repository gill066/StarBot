const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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

    const finalSlotName = slotNameInput || currentEpisode.question || `Episode Archive (${new Date().toLocaleDateString()})`;
    const savedEpisodes = playerDb[userId].savedEpisodes;

    // Check if an episode with the same title already exists
    const existingIndex = savedEpisodes.findIndex(e => e.slotName === finalSlotName);

    // Database write logic handler
    const commitDatabaseSave = async (targetInteraction, overwriteMode = false) => {
      let freshDb = {};
      try {
        if (fs.existsSync(playerPath)) {
          const raw = fs.readFileSync(playerPath, 'utf8');
          freshDb = raw.trim() ? JSON.parse(raw) : playerDb;
        }
      } catch (err) {
        freshDb = playerDb;
      }

      if (!freshDb[userId]) freshDb[userId] = { activeIndex: 0, characters: [] };
      if (!Array.isArray(freshDb[userId].savedEpisodes)) freshDb[userId].savedEpisodes = [];
      const freshSaves = freshDb[userId].savedEpisodes;

      if (overwriteMode) {
        const freshIndex = freshSaves.findIndex(e => e.slotName === finalSlotName);
        if (freshIndex !== -1) {
          freshSaves[freshIndex] = {
            saveId: freshSaves[freshIndex].saveId,
            slotName: finalSlotName,
            savedAt: new Date().toISOString(),
            episodeData: { ...currentEpisode }
          };
        } else {
          freshSaves.push({
            saveId: Date.now().toString(),
            slotName: finalSlotName,
            savedAt: new Date().toISOString(),
            episodeData: { ...currentEpisode }
          });
        }
      } else {
        if (freshSaves.length >= 5) {
          const maxMsg = `**Save Limit Reached:** You have hit the maximum capacity of **5 saved episodes**. You must delete a saved episode using /delete_episode before saving a new one.`;
          if (targetInteraction.replied || targetInteraction.deferred) {
            return targetInteraction.editReply({ content: maxMsg, components: [] });
          } else {
            return targetInteraction.reply({ content: maxMsg, ephemeral: true });
          }
        }

        freshSaves.push({
          saveId: Date.now().toString(),
          slotName: finalSlotName,
          savedAt: new Date().toISOString(),
          episodeData: { ...currentEpisode }
        });
      }

      try {
        fs.writeFileSync(playerPath, JSON.stringify(freshDb, null, 2), 'utf8');
        const successMsg = `Episode **"${finalSlotName}"** saved. (${freshSaves.length}/5 slots filled)`;
        
        if (targetInteraction.replied || targetInteraction.deferred) {
          await targetInteraction.editReply({ content: successMsg, components: [] });
        } else {
          await targetInteraction.reply({ content: successMsg, ephemeral: true });
        }
      } catch (e) {
        console.error(e);
        const errMsg = 'Failed to write updates to player profile archiving array.';
        if (targetInteraction.replied || targetInteraction.deferred) {
          await targetInteraction.editReply({ content: errMsg, components: [] });
        } else {
          await targetInteraction.reply({ content: errMsg, ephemeral: true });
        }
      }
    };

    // 4. Duplicate Title Evaluation Branch
    if (existingIndex !== -1) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('save_btn_overwrite')
          .setLabel('Overwrite Existing')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('save_btn_new_slot')
          .setLabel('Save to New Slot')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('save_btn_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      const initialResponse = await interaction.reply({
        content: `An episode named "${finalSlotName}" already exists. Would you like to overwrite it, save it to a new slot, or cancel?`,
        components: [row],
        ephemeral: true
      });

      const collector = initialResponse.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
      });

      collector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) return;
        collector.stop();

        if (btnInteraction.customId === 'save_btn_cancel') {
          await btnInteraction.update({ content: 'Save canceled. Existing archive was preserved.', components: [] });
        } else if (btnInteraction.customId === 'save_btn_overwrite') {
          await commitDatabaseSave(btnInteraction, true);
        } else if (btnInteraction.customId === 'save_btn_new_slot') {
          await commitDatabaseSave(btnInteraction, false);
        }
      });

      return;
    }

    // 5. Standard Maximum Limit Guard (If no name collision is found)
    if (savedEpisodes.length >= 5) {
      return interaction.reply({
        content: `**Save Limit Reached:** You have hit the maximum capacity of **5 saved episodes**. You must delete a saved episode using /delete_episode before saving a new one.`,
        ephemeral: true
      });
    }

    // Standard baseline write path
    await commitDatabaseSave(interaction, false);
  }
};