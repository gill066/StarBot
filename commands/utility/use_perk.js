const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    savePlayerData(file, db);
    
    const usesAlert = perk.Uses < 0 ? '(Unlimited)' : `(${perk.Uses}↺ remaining)`;
    const description = perk.Description || perk.description || 'No description available.';
    const cleanPerkName = (perk.Name || perk.key || '').replace(/__/g, '');

    // Send the core activation message first
    await replySafely(interaction, { 
      content: `⚡ **${activeCharacter.name}** activated **${perk.Name || perk.key}** ${usesAlert}.\n*${description}*`, 
      ephemeral: false 
    });

    // --- INTERACTIVE BUTTON TRIGGER FOR "ADAPTABLE" ---
    if (cleanPerkName.toLowerCase() === 'adaptable') {
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

      // Send the adjustment control panel ephemerally
      const buttonReply = await interaction.followUp({
        content: `🛠️ **Adaptable Prompt:** Adjust **${activeCharacter.name}**'s current ZONE (Current: **${activeCharacter.zone}**):`,
        components: [row],
        ephemeral: true,
        fetchReply: true
      });

      const filter = i => i.user.id === interaction.user.id;
      const collector = buttonReply.createMessageComponentCollector({ filter, time: 60000, max: 1 });

      collector.on('collect', async btnInteraction => {
        // Fetch fresh database instance to edit
        const freshData = getPlayerData();
        const freshDb = freshData.db;
        const targetChar = freshDb[userId]?.characters?.[freshDb[userId]?.activeIndex];

        if (!targetChar) {
          return await btnInteraction.reply({ content: '❌ Could not re-locate your active specialist tracking profile.', ephemeral: true });
        }

        let currentZone = Number(targetChar.zone || 0);

        if (btnInteraction.customId === 'adaptable_zone_up') {
          currentZone += 1;
        } else if (btnInteraction.customId === 'adaptable_zone_down') {
          currentZone = Math.max(0, currentZone - 1);
        }

        // Apply changes to database variables
        targetChar.zone = String(currentZone);

        savePlayerData(freshData.file, freshDb);

        await btnInteraction.reply({
          content: `${targetChar.name}'s ZONE is now ${targetChar.zone}.`,
          ephemeral: false
        });
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          try {
            await interaction.editReply({ content: '⏳ Adaptable adjustment window expired.', components: [] });
          } catch(e) {}
        }
      });
    }
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
