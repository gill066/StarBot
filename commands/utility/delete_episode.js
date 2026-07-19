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
    .setName('delete_episode')
    .setDescription('Permanently remove a saved episode.'),

  async execute(interaction) {
    const playerPath = path.join(__dirname, '..', '..', 'player_data.json');
    const userId = interaction.user.id;

    // 1. Read player database 
    let playerDb = {};
    if (fs.existsSync(playerPath)) {
      try {
        const raw = fs.readFileSync(playerPath, 'utf8');
        playerDb = raw.trim() ? JSON.parse(raw) : {};
      } catch (e) {
        console.error(e);
        return interaction.reply({ content: 'Error reading player data profiles.', ephemeral: true });
      }
    }

    const saves = playerDb[userId]?.savedEpisodes || [];
    if (saves.length === 0) {
      return interaction.reply({ content: 'You do not have any saved episodes to delete.', ephemeral: true });
    }

    // 2. Build Selection Dropdown UI
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('delete_episode_select')
      .setPlaceholder('Choose an archived episode to purge...');

    saves.forEach(save => {
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(save.slotName.substring(0, 100))
          .setDescription(`Archived: ${new Date(save.savedAt).toLocaleDateString()}`)
          .setValue(save.saveId)
      );
    });

    const menuRow = new ActionRowBuilder().addComponents(selectMenu);

    const initialResponse = await interaction.reply({
      content: 'Select which episode you want to delete:',
      components: [menuRow],
      ephemeral: true
    });

    // 3. Collect Selection Choice
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

      // 4. Build Confirmation Row
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_delete_purge')
          .setLabel('Yes, Delete Permanently')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_delete_purge')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      const promptMessage = await menuInteraction.update({
        content: `Are you sure you want to delete **"${selectedSave.slotName}"**?`,
        components: [confirmRow]
      });

      // 5. Collect Final Confirmation Button Input
      const btnCollector = promptMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
      });

      btnCollector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) return;
        btnCollector.stop();

        if (btnInteraction.customId === 'cancel_delete_purge') {
          await btnInteraction.update({
            content: 'Deletion canceled.',
            components: []
          });
          return;
        }

        if (btnInteraction.customId === 'confirm_delete_purge') {
          // Reload database right before deletion execution to avoid race condition states
          let freshDb = {};
          try {
            if (fs.existsSync(playerPath)) {
              const raw = fs.readFileSync(playerPath, 'utf8');
              freshDb = raw.trim() ? JSON.parse(raw) : playerDb;
            }
          } catch (err) {
            freshDb = playerDb;
          }

          const freshSaves = freshDb[userId]?.savedEpisodes || [];
          const targetIndex = freshSaves.findIndex(s => s.saveId === selectedSaveId);

          if (targetIndex === -1) {
            await btnInteraction.update({ content: 'The selected episode file could not be located in your profile data.', components: [] });
            return;
          }

          // Remove item out of data chain arrays
          const [removedSlot] = freshSaves.splice(targetIndex, 1);

          try {
            fs.writeFileSync(playerPath, JSON.stringify(freshDb, null, 2), 'utf8');
            
            await btnInteraction.update({
              content: `**"${removedSlot.slotName}"** deleted. \nStorage Slots Free: **${5 - freshSaves.length}/5**`,
              components: []
            });
          } catch (e) {
            console.error(e);
            await btnInteraction.followUp({ content: 'Disk system error: could not write file updates to player_data.', ephemeral: true });
          }
        }
      });
    });
  }
};