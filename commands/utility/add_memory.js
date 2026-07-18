const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ComponentType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_memory')
    .setDescription('Spend 5 XP while 💫 I N T H E Z O N E 💫 to unlock a permanent +memory+ from the current episode.'),

  async execute(interaction) {
    const playerDataPath = path.join(__dirname, '..', '..', 'player_data.json');
    const showrunnerDataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    // 1. Read and validate player profile state
    let playerDb = {};
    try {
      if (fs.existsSync(playerDataPath)) {
        const raw = fs.readFileSync(playerDataPath, 'utf8');
        playerDb = raw.trim() ? JSON.parse(raw) : {};
      }
    } catch (e) {
      playerDb = {};
    }

    if (!playerDb[userId] || !playerDb[userId].characters || playerDb[userId].characters.length === 0) {
      await interaction.reply({ content: 'No active character profiles found.', ephemeral: true });
      return;
    }

    const character = playerDb[userId].characters[playerDb[userId].activeIndex];

    // Case-insensitive key lookups for safety
    const itzKey = Object.keys(character).find(k => k.toLowerCase() === 'inthezone') || 'inTheZone';
    const xpKey = Object.keys(character).find(k => k.toLowerCase() === 'xp') || 'xp';

    const isInTheZone = !!character[itzKey];
    const currentXp = Number(character[xpKey] ?? 0);

    if (!isInTheZone) {
      await interaction.reply({ content: 'You must be **💫 I N T H E Z O N E 💫** to establish a new memory.', ephemeral: true });
      return;
    }

    if (currentXp < 5) {
      await interaction.reply({ content: `You do not have enough XP. Adding a memory costs **5 XP** (You currently have **${currentXp} XP**).`, ephemeral: true });
      return;
    }

    // 2. Read and validate showrunner context pool
    let showrunnerDb = {};
    try {
      if (fs.existsSync(showrunnerDataPath)) {
        const raw = fs.readFileSync(showrunnerDataPath, 'utf8');
        showrunnerDb = raw.trim() ? JSON.parse(raw) : {};
      }
    } catch (e) {
      showrunnerDb = {};
    }

    const channelData = showrunnerDb[channelId];
    if (!channelData) {
      await interaction.reply({ content: 'No active episode data found for this channel.', ephemeral: true });
      return;
    }

    // Build a unified pool of available options
    const memoryPool = [];
    if (Array.isArray(channelData.people)) channelData.people.forEach(item => memoryPool.push({ name: item, type: 'People' }));
    if (Array.isArray(channelData.places)) channelData.places.forEach(item => memoryPool.push({ name: item, type: 'Places' }));
    if (Array.isArray(channelData.things)) channelData.things.forEach(item => memoryPool.push({ name: item, type: 'Things' }));
    if (Array.isArray(channelData.ideas)) channelData.ideas.forEach(item => memoryPool.push({ name: item, type: 'Ideas' }));

    if (memoryPool.length === 0) {
      await interaction.reply({ content: 'The current episode exists but contains no listed elements (People, Places, Things, or Ideas) to remember.', ephemeral: true });
      return;
    }

    // 3. Phase 1: Provide Button Confirmation
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mem_confirm_yes')
        .setLabel('Yes, spend 5 XP')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('mem_confirm_no')
        .setLabel('No, Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    const initialResponse = await interaction.reply({
      content: `**Remember something?**\nSpending **5 XP** allows you to permanently carry a element from this episode over into your character profile as a \`+memory+\`.\n\n*Current Character XP: **${currentXp}** → Will become: **${currentXp - 5}***\nAre you sure you want to proceed?`,
      components: [confirmRow],
      ephemeral: true
    });

    const btnCollector = initialResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 45000
    });

    btnCollector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: 'This processing window belongs to someone else.', ephemeral: true });
        return;
      }

      if (btnInteraction.customId === 'mem_confirm_no') {
        await btnInteraction.update({ content: 'Session cancelled. Your XP has been preserved.', components: [] });
        btnCollector.stop();
        return;
      }

      if (btnInteraction.customId === 'mem_confirm_yes') {
        btnCollector.stop(); // Gracefully exit step 1 listener

        // 4. Phase 2: Render Dropdown Selection Menu (Capped to max 25 elements for Discord layout safety)
        const selectOptions = memoryPool.slice(0, 25).map((item, index) => {
          return new StringSelectMenuOptionBuilder()
            .setLabel(`[${item.type}] ${item.name}`.substring(0, 100))
            .setValue(String(index));
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('memory_dropdown_select')
          .setPlaceholder('Choose 1 element to +remember+...')
          .addOptions(selectOptions);

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        // Update the existing ephemeral interface smoothly to display choices
        const menuResponse = await btnInteraction.update({
          content: '✨ Select a thing from this episode to +remember+:',
          components: [menuRow]
        });

        const menuCollector = menuResponse.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60000
        });

        menuCollector.on('collect', async (menuInteraction) => {
          if (menuInteraction.user.id !== interaction.user.id) {
            await menuInteraction.reply({ content: 'This processing menu belongs to someone else.', ephemeral: true });
            return;
          }

          // 5. Execution Phase: Re-read state synchronously right before file write to prevent state desyncs
          let currentDb = {};
          try {
            if (fs.existsSync(playerDataPath)) {
              const raw = fs.readFileSync(playerDataPath, 'utf8');
              currentDb = raw.trim() ? JSON.parse(raw) : playerDb;
            }
          } catch (err) {
            currentDb = playerDb;
          }

          const activeChar = currentDb[userId].characters[currentDb[userId].activeIndex];
          const chosenIndex = parseInt(menuInteraction.values[0]);
          const selectedMemoryItem = memoryPool[chosenIndex];

          if (!selectedMemoryItem) {
            await menuInteraction.update({ content: 'State error or synchronization conflict occurred.', components: [] });
            menuCollector.stop();
            return;
          }

          // Mutate properties securely 
          const targetXpKey = Object.keys(activeChar).find(k => k.toLowerCase() === 'xp') || 'xp';
          const targetMemoriesKey = Object.keys(activeChar).find(k => k.toLowerCase() === 'memories') || 'memories';

          // Final verification step right before processing calculations
          if (Number(activeChar[targetXpKey] ?? 0) < 5) {
            await menuInteraction.update({ content: 'Processing transaction error: Your character layout record no longer possesses 5 XP.', components: [] });
            menuCollector.stop();
            return;
          }

          // Deduct points and push data structure changes
          activeChar[targetXpKey] = Number(activeChar[targetXpKey]) - 5;
          if (!Array.isArray(activeChar[targetMemoriesKey])) {
            activeChar[targetMemoriesKey] = [];
          }
          activeChar[targetMemoriesKey].push(selectedMemoryItem.name);

          // Save adjustments back to the filesystem safely
          try {
            fs.writeFileSync(playerDataPath, JSON.stringify(currentDb, null, 2), 'utf8');
          } catch (writeErr) {
            console.error('Failed writing memory tracking records to storage disk path:', writeErr);
          }

          // Update interaction screen context to clear out inputs cleanly
          // Update interaction screen context to clear out inputs cleanly
          await menuInteraction.update({
            content: `+Memory+ added. **${activeChar[targetXpKey]}** remaining XP.`,
            components: []
          });

          // Announce the memory crystallization publicly to the channel
          if (interaction.channel) {
            await interaction.channel.send({
              content: `${activeChar.name} remembered \`+${selectedMemoryItem.name}+\`.`
            }).catch(err => console.error('Failed to send public memory announcement:', err));
          }

          menuCollector.stop();
        });

        menuCollector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            await interaction.editReply({ content: 'Selection window timed out without changes.', components: [] }).catch(() => {});
          }
        });
      }
    });

    btnCollector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await interaction.editReply({ content: 'Confirmation action timed out.', components: [] }).catch(() => {});
      }
    });
  }
};