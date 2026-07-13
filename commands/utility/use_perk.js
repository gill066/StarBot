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

    const cleanPerkName = (perk.Name || perk.key || '').replace(/__/g, '').toLowerCase();

    // --- TRIGGER FOR "DETERMINED" ---
    if (cleanPerkName === 'determined') {
      activeCharacter.inTheZone = true;
    }

    savePlayerData(file, db);
    
    const usesAlert = perk.Uses < 0 ? '(Unlimited)' : `(${perk.Uses}↺ remaining)`;
    const description = perk.Description || perk.description || 'No description available.';

    let baseContent = `⚡ **${activeCharacter.name}** activated the __${perk.Name || perk.key}__ perk. ${usesAlert}.`;

    // Append extra flare to the response if they used Determined
    if (cleanPerkName === 'determined') {
      baseContent += `\n\n**${activeCharacter.name}** is now **💫 I N T H E Z O N E 💫**!`;
    }

    // --- CHECK IF PERK IS ADAPTABLE TO APPEND BUTTONS DIRECTLY ---
    let componentsRow = [];
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
      componentsRow = [row];
    }

    // Send the core activation response
    const mainMessage = await replySafely(interaction, { 
      content: baseContent, 
      components: componentsRow,
      ephemeral: false,
      fetchReply: true
    });

    // If it's not Adaptable, we are fully done executing!
    if (cleanPerkName !== 'adaptable') return;

    // --- DIRECTIONAL COLLECTION SYSTEM FOR "ADAPTABLE" CORES ---
    const filter = i => i.user.id === interaction.user.id;
    const collector = mainMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async btnInteraction => {
      await btnInteraction.deferUpdate();

      const freshData = getPlayerData();
      const freshDb = freshData.db;
      const targetChar = freshDb[userId]?.characters?.[freshDb[userId]?.activeIndex];

      if (!targetChar) {
        return await interaction.followUp({ content: '❌ Could not re-locate your active specialist profile.', ephemeral: true });
      }

      let currentZone = Number(targetChar.zone || 0);

      if (btnInteraction.customId === 'adaptable_zone_up') {
        currentZone += 1;
      } else if (btnInteraction.customId === 'adaptable_zone_down') {
        currentZone = Math.max(0, currentZone - 1);
      }

      targetChar.zone = String(currentZone);
      savePlayerData(freshData.file, freshDb);

      await interaction.editReply({
        content: `${baseContent}\n\n🛠️ **Adaptable Update:** **${targetChar.name}** adjusted their layout to **ZONE ${targetChar.zone}** (BODY: ${targetChar.body} | MIND: ${targetChar.mind}).`,
        components: [] 
      });
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
