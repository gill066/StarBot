const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

function getPlayerData() {
  const file = path.join(__dirname, '..', '..', 'player_data.json');
  let db = {};
  try {
    const raw = fs.readFileSync(file, 'utf8');
    db = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    db = {};
  }
  return { file, db };
}

function savePlayerData(file, db) {
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use_perk')
    .setDescription('Activate a perk from your specialist profile')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Perk to activate')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const { file, db } = getPlayerData();
    const userId = interaction.user.id;
    let userEntry = db[userId];

    if (!userEntry) {
      await replySafely(interaction, { content: 'No variables found for you. Create a specialist first.', ephemeral: true });
      return;
    }

    // --- STRUCTURAL MIGRATION FOR LEGACY SINGLE CHARACTERS ---
    if (userEntry.name && !userEntry.characters) {
      const legacyCharacter = { ...userEntry };
      db[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
      userEntry = db[userId];
    }

    if (!userEntry.characters || userEntry.characters.length === 0) {
      await replySafely(interaction, { content: 'You do not have any active specialist profiles.', ephemeral: true });
      return;
    }

    // Target the current active character's profile record
    const activeCharacter = userEntry.characters[userEntry.activeIndex];

    if (!activeCharacter || !Array.isArray(activeCharacter.perks)) {
      await replySafely(interaction, { content: 'Your active specialist does not have any perks yet.', ephemeral: true });
      return;
    }

    // Find the perk by cleaning underscores or matching case-insensitively
    const perk = activeCharacter.perks.find(entry => {
      const rawName = (entry?.Name || entry?.name || entry?.key || '').replace(/__/g, '');
      return rawName.toLowerCase() === String(name || '').toLowerCase();
    });

    if (!perk) {
      await replySafely(interaction, { content: `Your active specialist (**${activeCharacter.name}**) does not have a perk named ${name}.`, ephemeral: true });
      return;
    }

    const remainingUses = Number(perk.Uses ?? 0);
    if (remainingUses === 0) {
      await replySafely(interaction, { content: `**${perk.Name || perk.key}** has no uses left. You must recharge or refresh it.`, ephemeral: true });
      return;
    }

    if (remainingUses > 0) {
      perk.Uses = remainingUses - 1;
    } else if (remainingUses < 0) {
      perk.Uses = -1; // Keep unlimited value preserved
    }

    const cleanPerkName = (perk.Name || perk.key || '').replace(/__/g, '').toLowerCase();

    // --- TRIGGER FOR "DETERMINED" ---
    if (cleanPerkName === 'determined') {
      activeCharacter.inTheZone = true;
    }

    savePlayerData(file, db);
    
    const usesAlert = perk.Uses < 0 ? '(Unlimited)' : `(${perk.Uses}↺ remaining)`;
    const description = perk.Description || perk.description || 'No description available.';

    let baseContent = `⚡ **${activeCharacter.name}** activated **${perk.Name || perk.key}** ${usesAlert}.\n*${description}*`;

    if (cleanPerkName === 'determined') {
      baseContent += `\n\n💫 **Determined Activation:** **${activeCharacter.name}** is now **I N T H E Z O N E**!`;
    }

    // --- SETUP OPTIONAL LAYOUT INTERACTION ARRAYS ---
    let componentsArray = [];

    // --- CHECK IF PERK IS ADAPTABLE (BUTTONS) ---
    if (cleanPerkName === 'adaptable') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('adaptable_zone_up')
          .setLabel('+1 ZONE')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('adaptable_zone_down')
          .setLabel('-1 ZONE')
          .setStyle(ButtonStyle.Danger)
      );
      componentsArray.push(row);
    }

    // --- CHECK IF PERK IS EFFICIENT (SELECT MENU) ---
    let targetInventory = Array.isArray(activeCharacter.inventory) ? activeCharacter.inventory : [];
    const validItems = targetInventory.filter(item => item?.Name && (Number(item.Uses ?? 0) > 0 || Number(item.Uses ?? 0) < 0));

    if (cleanPerkName === 'efficient') {
      if (validItems.length === 0) {
        baseContent += `\n\n⚠️ **Efficient Prompt:** **${activeCharacter.name}** has no items in their inventory with remaining uses left to execute!`;
      } else {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('efficient_item_select')
          .setPlaceholder('Select an item to use efficiently...');

        // Map inventory items down into option blocks (Discord maximum 25 items cap boundary)
        const options = validItems.slice(0, 25).map((item, idx) => {
          const usesLeft = item.Uses < 0 ? 'Unlimited' : `${item.Uses}↺`;
          return {
            label: item.Name,
            description: `Uses: ${usesLeft} | ${item.Use.slice(0, 50)}`,
            value: `${item.Name.toLowerCase()}_${idx}` // Unique fallback compound ID key
          };
        });

        selectMenu.addOptions(options);
        const menuRow = new ActionRowBuilder().addComponents(selectMenu);
        componentsArray.push(menuRow);
      }
    }

    // Dispatch primary output response
    const mainMessage = await replySafely(interaction, { 
      content: baseContent, 
      components: componentsArray,
      ephemeral: false,
      fetchReply: true
    });

    // Terminate sequence execution immediately if no sub-prompt actions are required
    if (cleanPerkName !== 'adaptable' && (cleanPerkName !== 'efficient' || validItems.length === 0)) return;

    // --- LOCAL COMPONENT COLLECTOR FRAMEWORK ---
    const filter = i => i.user.id === interaction.user.id;
    const collector = mainMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async componentInteraction => {
      await componentInteraction.deferUpdate();

      // Fetch synchronized database file tracking frame state references
      const freshData = getPlayerData();
      const freshDb = freshData.db;
      const targetChar = freshDb[userId]?.characters?.[freshDb[userId]?.activeIndex];

      if (!targetChar) {
        return await interaction.followUp({ content: '❌ Could not re-locate your active specialist profile.', ephemeral: true });
      }

      // 1. Process Adaptable Buttons Changes
      if (componentInteraction.customId === 'adaptable_zone_up' || componentInteraction.customId === 'adaptable_zone_down') {
        let currentZone = Number(targetChar.zone || 0);

        if (componentInteraction.customId === 'adaptable_zone_up') {
          currentZone += 1;
        } else if (componentInteraction.customId === 'adaptable_zone_down') {
          currentZone = Math.max(0, currentZone - 1);
        }

        targetChar.zone = String(currentZone);
        savePlayerData(freshData.file, freshDb);

        await interaction.editReply({
          content: `${baseContent}\n\n🛠️ **Adaptable Update:** **${targetChar.name}** adjusted their layout to **ZONE ${targetChar.zone}** (BODY: ${targetChar.body} | MIND: ${targetChar.mind}).`,
          components: [] 
        });
      }

      // 2. Process Efficient Dropdown Select Choice Mechanics
      if (componentInteraction.customId === 'efficient_item_select') {
        const choiceValue = componentInteraction.values[0];
        
        // Match the inventory array element index tracking reference string securely
        const matchedItem = (targetChar.inventory || []).find((item, idx) => {
          return choiceValue === `${item?.Name?.toLowerCase()}_${idx}`;
        });

        if (!matchedItem) {
          return await interaction.followUp({ content: '❌ Could not find the selected item in your inventory data pool.', ephemeral: true });
        }

        // --- DO NOT DEDUCT AN ITEM USE VALUE STAGE ---
        // We explicitly skip changing matchedItem.Uses to keep the usage unexpended!

        const usesAlert = matchedItem.Uses < 0 ? '(Unlimited)' : `(${matchedItem.Uses}↺ remaining - Unexpended)`;

        await interaction.editReply({
          content: `${baseContent}\n\n⚙️ **Efficient Activation:** **${targetChar.name}** used **${matchedItem.Name}** ${usesAlert} without expending a charge!\n*${matchedItem.Use}*`,
          components: [] // Clear dropdown row
        });
      }
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        try {
          await interaction.editReply({ components: [] });
        } catch(e) {}
      }
    });
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const { db } = getPlayerData();
    const userId = interaction.user.id;
    const userEntry = db[userId];

    let perks = [];

    if (userEntry) {
      if (Array.isArray(userEntry.characters) && userEntry.characters[userEntry.activeIndex]) {
        perks = userEntry.characters[userEntry.activeIndex].perks || [];
      } else if (userEntry.name && Array.isArray(userEntry.perks)) {
        perks = userEntry.perks;
      }
    }

    const choices = perks
      .map(entry => {
        const cleanName = (entry?.Name || entry?.name || entry?.key || '').replace(/__/g, '');
        return { name: cleanName, value: cleanName };
      })
      .filter(choice => choice.name)

      .filter(choice => !focusedValue || choice.name.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25);

    await interaction.respond(choices);
  },
};
