const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ComponentType 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heal_injury')
    .setDescription('Heal an active <injury> from your profile and restore any lost assets.'),

  async execute(interaction) {
    const dataPath = path.join(__dirname, '..', '..', 'player_data.json');
    const userId = interaction.user.id;

    let db = {};
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    // Ensure profile structure sanity
    if (!db[userId] || !db[userId].characters || db[userId].characters.length === 0) {
      await replySafely(interaction, { content: 'No active character profiles found.', ephemeral: true });
      return;
    }

    const character = db[userId].characters[db[userId].activeIndex];

    // Verify there are actually injuries to manage
    if (!character.injuries || character.injuries.length === 0) {
      await replySafely(interaction, { content: 'You do not have any active <injuries> to heal.', ephemeral: true });
      return;
    }

    // Build interactive dropdown selections out of current active injuries
    const options = character.injuries.map((injury, idx) => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(`[${idx + 1}] <${injury.classification}>`)
        .setDescription(injury.mechanicsText.substring(0, 100))
        .setValue(String(idx));
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('heal_injury_select')
      .setPlaceholder('Choose an <injury> to treat...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const response = await replySafely(interaction, {
      content: 'Select which <injury> to treat:',
      components: [row],
      ephemeral: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    collector.on('collect', async (menuInteraction) => {
      if (menuInteraction.user.id !== interaction.user.id) {
        await menuInteraction.reply({ content: 'This processing execution thread belongs to someone else.', ephemeral: true });
        return;
      }

      // Re-read file synchronously right before mutation to prevent file concurrency issues
      let currentDb = {};
      try {
        const raw = fs.readFileSync(dataPath, 'utf8');
        currentDb = raw.trim() ? JSON.parse(raw) : db;
      } catch (err) {
        currentDb = db;
      }

      const activeChar = currentDb[userId].characters[currentDb[userId].activeIndex];
      const selectedIndex = parseInt(menuInteraction.values[0]);
      const chosenInjury = activeChar.injuries[selectedIndex];

      if (!chosenInjury) {
        await menuInteraction.update({ content: '❌ Invalid choice or state desync occurred.', components: [] });
        collector.stop();
        return;
      }

      let resolutionText = '';
      const classificationLower = chosenInjury.classification.toLowerCase();

      // === REVERSAL LOGIC MATRIX ===
      if (classificationLower === 'brain') {
        if (activeChar.inactivePerks && activeChar.inactivePerks.length > 0) {
          const restored = activeChar.inactivePerks.pop();
          const name = restored.Name || restored.name || restored.key;
          
          // Locate the specific perk shell within the main array to flip its operational visibility flags
          const mainPerk = (activeChar.perks || []).find(p => (p.Name || p.name || p.key) === name && p.inactive);
          if (mainPerk) {
            delete mainPerk.inactive;
            delete mainPerk.brainInjury;
          }
          resolutionText = `Regained ${name}`;
        } else {
          resolutionText = 'Cognitive fog dissipated (no disabled perks found to return).';
        }
      } 
      else if (classificationLower === 'core') {
        const capacityKey = Object.keys(activeChar).find(k => k.toUpperCase() === 'CAPACITY') || 'capacity';
        const currentCap = Number(activeChar[capacityKey] ?? 0);
        
        // Reverse the halving action accurately
        activeChar[capacityKey] = currentCap * 2;
        activeChar.coreInjury = false;
        resolutionText = `Carrying CAPACITY restored to **${activeChar[capacityKey]}#**`;
      } 
      else if (classificationLower === 'limb') {
        if (activeChar.inactiveItems && activeChar.inactiveItems.length > 0) {
          const restored = activeChar.inactiveItems.pop();
          activeChar.inventory = activeChar.inventory || [];
          activeChar.inventory.push(restored);
          resolutionText = `Item repaired/recovered to inventory: **${restored.Name || restored.name || restored.key}**`;
        } else {
          resolutionText = '<Limb injury> treated (no destroyed item back-ups found to recreate).';
        }
      } 
      else if (classificationLower === 'strain') {
        if (activeChar.inactiveTags && activeChar.inactiveTags.length > 0) {
          const restored = activeChar.inactiveTags.pop();
          activeChar.tags = activeChar.tags || [];
          activeChar.tags.push(restored);
          resolutionText = `*Tag* reactivated: ***${restored}***`;
        } else {
          resolutionText = '<Strain injury> treated (no hidden tags found to return).';
        }
      } 
      else {
        // Fallback for Mind Alignment traits (Fight, Flight, Freeze, Fawn)
        resolutionText = `\`<${chosenInjury.classification}>\` has been treated.`;
      }

      // === DECREMENT LOAD BY 1 ===
      const loadKey = Object.keys(activeChar).find(k => k.toUpperCase() === 'LOAD') || 'load';
      if (activeChar[loadKey] !== undefined) {
        // Keeps it safe from dropping below 0 defensively
        activeChar[loadKey] = Math.max(0, Number(activeChar[loadKey] ?? 0) - 1);
        resolutionText += ` | # decreased to ${activeChar[loadKey]}`;
      }

      // Remove the specific injury index object cleanly from the active list tracking array
      activeChar.injuries.splice(selectedIndex, 1);

      // Save structural database adjustments
      try {
        fs.writeFileSync(dataPath, JSON.stringify(currentDb, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed writing recovery alterations to disk path', err);
      }

      // Clear the menu for the user privately
      await menuInteraction.update({
        content: `Healed <${chosenInjury.classification}>`,
        components: []
      });

      // Announce the medical recovery publicly
      await interaction.followUp({
        content: `${activeChar.name}'s <${chosenInjury.classification} injury> healed - ${resolutionText}`
      });

      collector.stop();
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await interaction.editReply({
          content: '⏳ Treatment session window timed out.',
          components: []
        }).catch(() => {});
      }
    });
  }
};