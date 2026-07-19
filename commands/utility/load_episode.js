const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('load_episode')
    .setDescription('Select and deploy a saved episode into this channel.'),

  async execute(interaction) {
    const showrunnerPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const playerPath = path.join(__dirname, '..', '..', 'player_data.json');
    
    const channelId = interaction.channelId;
    const userId = interaction.user.id;

    // 1. Read player archives
    let playerDb = {};
    if (fs.existsSync(playerPath)) {
      try {
        const raw = fs.readFileSync(playerPath, 'utf8');
        playerDb = raw.trim() ? JSON.parse(raw) : {};
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: 'Error reading player data tracking grids.', ephemeral: true });
      }
    }

    const saves = playerDb[userId]?.savedEpisodes || [];
    if (saves.length === 0) {
      return interaction.reply({ content: 'You do not have any saved episodes tied to your player profile.', ephemeral: true });
    }

    // 2. Build the Selection Menu UI
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('load_episode_select')
      .setPlaceholder('Choose an episode to restore...');

    saves.forEach(save => {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(save.slotName.substring(0, 100))
          .setDescription(`Saved: ${new Date(save.savedAt).toLocaleDateString()}`)
          .setValue(save.saveId)
      );
    });

    const menuRow = new ActionRowBuilder().addComponents(selectMenu);

    const initialResponse = await interaction.reply({
      content: 'Select which episode you wish to activate in this channel:',
      components: [menuRow],
      ephemeral: true
    });

    // 3. Collect Dropdown Selection
    const menuCollector = initialResponse.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    menuCollector.on('collect', async (menuInteraction) => {
      if (menuInteraction.user.id !== interaction.user.id) return;
      menuCollector.stop();

      const selectedSaveId = menuInteraction.values[0];
      const selectedSave = saves.find(s => s.saveId === selectedSaveId);

      if (!selectedSave) {
        return menuInteraction.update({ content: 'Selection processing mismatch error occurred.', components: [] });
      }

      // Check if channel has an active episode state requiring confirmation overrides
      let showrunnerDb = {};
      if (fs.existsSync(showrunnerPath)) {
        try {
          const raw = fs.readFileSync(showrunnerPath, 'utf8');
          showrunnerDb = raw.trim() ? JSON.parse(raw) : {};
        } catch (e) { console.error(e); }
      }

      const channelHasData = !!showrunnerDb[channelId];

      const proceedWithLoad = async (targetCtxInteraction) => {
        showrunnerDb[channelId] = {
          ...selectedSave.episodeData,
          timestamp: new Date().toISOString() // refresh context reference trace metric
        };

        try {
          fs.writeFileSync(showrunnerPath, JSON.stringify(showrunnerDb, null, 2), 'utf8');
          
          const confirmMsg = `**"${selectedSave.slotName}"** is now the current episode in this channel`;
          
          if (targetCtxInteraction.replied || targetCtxInteraction.deferred) {
            await targetCtxInteraction.followUp({ content: confirmMsg, ephemeral: true });
          } else {
            await targetCtxInteraction.update({ content: confirmMsg, components: [] });
          }
        } catch (e) {
          console.error(e);
          await targetCtxInteraction.followUp({ content: 'Write process encountered an issue saving modifications.', ephemeral: true });
        }
      };

      // 4. Overwrite Evaluation Check Pathway
      if (channelHasData) {
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_load_overwrite')
            .setLabel('Yes, Overwrite Channel')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_load_overwrite')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        const promptMessage = await menuInteraction.update({
          content: `This channel already contains an active episode.\nDo you want to overwrite it with **"${selectedSave.slotName}"**?`,
          components: [confirmRow]
        });

        const btnCollector = promptMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 60000
        });

        btnCollector.on('collect', async (btnInteraction) => {
          if (btnInteraction.user.id !== interaction.user.id) return;
          btnCollector.stop();

          if (btnInteraction.customId === 'cancel_load_overwrite') {
            await btnInteraction.update({ content: 'Episode load cancelled.', components: [] });
          } else if (btnInteraction.customId === 'confirm_load_overwrite') {
            await proceedWithLoad(btnInteraction);
          }
        });

      } else {
        // Direct inject path if data field structures evaluate clean
        await proceedWithLoad(menuInteraction);
      }
    });
  }
};