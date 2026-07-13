const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('risk_roll')
    .setDescription('Roll risk with BODY or MIND against your current zone.')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('How many of your tags apply to the situation?')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Choose the attribute to use for the roll')
        .setRequired(true)
        .addChoices(
          { name: 'Body', value: 'BODY' },
          { name: 'Mind', value: 'MIND' }
        )
    ),

  async execute(interaction) {
    const number = interaction.options.getInteger('number');
    const target = interaction.options.getString('target');
    const dataPath = path.join(__dirname, '..', '..', 'player_data.json');
    const userId = interaction.user.id;

    let db = {};
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Failed to load player data for risk_roll', e);
      db = {};
    }

    // 1. Structural Migration / Setup Check
    if (!db[userId]) {
      db[userId] = { activeIndex: 0, characters: [] };
    }

    if (db[userId].name && !db[userId].characters) {
      const legacyCharacter = { ...db[userId] };
      db[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
    }

    if (!db[userId].characters || db[userId].characters.length === 0) {
      await replySafely(interaction, { content: 'You do not have any active specialist profiles. Please create a specialist first.', ephemeral: true });
      return;
    }

    // 2. Safely capture the active character profile reference
    const activeCharacter = db[userId].characters[db[userId].activeIndex];

    let zoneValue = null;
    let overweight = 0;

    const capacity = Number(activeCharacter.capacity ?? activeCharacter.CAPACITY ?? 0);
    const load = Number(activeCharacter.load ?? activeCharacter.LOAD ?? 0);
    overweight = Math.max(load - capacity, 0);
    
    if (typeof activeCharacter.zone !== 'undefined') {
      zoneValue = Number(activeCharacter.zone);
    }

    if (!Number.isFinite(zoneValue)) {
      await replySafely(interaction, { content: 'Zone is not set or is invalid for your active character.', ephemeral: true });
      return;
    }

    // Dice math adjustments
    const dice = Math.max(1 + number - overweight, 1); // Ensure at least 1 die is rolled even if overweight

    const rolls = Array.from({ length: dice }, () => Math.floor(Math.random() * 6) + 1);
    let successCount = rolls.filter(result => {
      return target === 'BODY'
        ? result >= zoneValue
        : result <= zoneValue;
    }).length;

    let anyExact = rolls.some(r => r === zoneValue);
    
    // 3. Update character fields securely on the nested instance
    let updatedZone = null;
    let zoneChanged = false; 

    // Track previous condition safely
    const wasInTheZone = activeCharacter.inTheZone;

    if (anyExact) {
        activeCharacter.inTheZone = true;
        updatedZone = true;
    } else if (successCount === 0) {
        activeCharacter.inTheZone = false;
        updatedZone = false;
    }

    // Determine if structural modifications need saving
    if (updatedZone !== null && wasInTheZone !== updatedZone) {
        zoneChanged = true;
    }

    // Always commit state modifications (or initial array structures if migrated)
    try {
        fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to update player database state variables', e);
    }

    // compute outcome text configurations
    let outcome;
    if (successCount >= 2) {
        outcome = 'SUCCESS';
    } else if (successCount === 1) {
        outcome = 'MIXED';
    } else {
        outcome = 'FAILURE';
    }

    let replyMsg = `**${activeCharacter.name}** is rolling ${dice}D6 against ZONE ${zoneValue} using ${target}. (Load penalty: ${overweight}, tag bonus: ${number})\n${outcome} - Rolls: [${rolls.join(', ')}]`;

    // Append localized strings dynamically if states shifted
    if (zoneChanged) {
        if (updatedZone === false) {
            replyMsg += `\nYou are no longer 💫 I N T H E Z O N E 💫`;
        } else if (updatedZone === true) {
            replyMsg += `\nYou are now 💫 I N T H E Z O N E 💫`;
        }
    }

    // Send the main roll result message
    await replySafely(interaction, { content: replyMsg });

    // === NEW LOGIC: RESOURCEFUL PERK CHECK ===
    // Scan the perks array for a perk with the key "resourceful" (case-insensitive)
    const characterPerks = activeCharacter.perks || [];
    const resourcefulPerk = characterPerks.find(p => String(p.key || '').toLowerCase() === 'resourceful');

    // Only proceed if they actually have the perk, failed/mixed the roll, and have uses remaining
    if (resourcefulPerk && (outcome === 'MIXED' || outcome === 'FAILURE') && Number(resourcefulPerk.Uses) > 0) {
      
      const currentUses = Number(resourcefulPerk.Uses);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('add_resourceful_die')
          .setLabel(`Roll Extra 1d6 (${currentUses} left)`)
          .setStyle(ButtonStyle.Primary)
      );

      const promptMessage = await interaction.followUp({
        content: `__Resourceful:__ Your roll resulted in a **${outcome}**. Would you like to spend 1 charge to roll an extra 1d6? (Remaining uses: ${currentUses})`,
        components: [row],
        ephemeral: true
      });

      const collector = promptMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000 
      });

      collector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
          await btnInteraction.reply({ content: 'This is not your perk prompt.', ephemeral: true });
          return;
        }

        // Re-read DB file from disk for data security (concurrency safety)
        let currentDb = {};
        try {
          const currentRaw = fs.readFileSync(dataPath, 'utf8');
          currentDb = currentRaw.trim() ? JSON.parse(currentRaw) : db;
        } catch (err) {
          console.error(err);
          currentDb = db;
        }

        const freshCharacter = currentDb[userId].characters[currentDb[userId].activeIndex];
        const freshPerks = freshCharacter.perks || [];
        const freshResourceful = freshPerks.find(p => String(p.key || '').toLowerCase() === 'resourceful');

        // Check if charges were depleted while waiting
        if (!freshResourceful || Number(freshResourceful.Uses) <= 0) {
          await btnInteraction.update({
            content: '❌ You no longer have any uses of Resourceful remaining!',
            components: []
          });
          collector.stop();
          return;
        }

        // Deduct 1 usage point
        freshResourceful.Uses = Number(freshResourceful.Uses) - 1;

        // Roll the extra 1d6
        const extraRoll = Math.floor(Math.random() * 6) + 1;
        
        // Evaluate math changes
        const extraSuccess = target === 'BODY' ? extraRoll >= zoneValue : extraRoll <= zoneValue;
        if (extraSuccess) successCount += 1;

        // Check for exact zone value shifts
        let secondaryZoneMsg = '';
        if (extraRoll === zoneValue && !freshCharacter.inTheZone) {
          freshCharacter.inTheZone = true;
          secondaryZoneMsg = `\nYou are now 💫 I N T H E Z O N E 💫`;
        }

        // Save updated uses and optional "In The Zone" changes to JSON database
        try {
          fs.writeFileSync(dataPath, JSON.stringify(currentDb, null, 2), 'utf8');
        } catch (err) {
          console.error('Failed to deduct Resourceful usage charges', err);
        }

        // Recalculate final outcome tier
        let finalOutcome;
        if (successCount >= 2) finalOutcome = 'SUCCESS';
        else if (successCount === 1) finalOutcome = 'MIXED';
        else finalOutcome = 'FAILURE';

        // Update the user's private view
        await btnInteraction.update({
          content: `🎲 __Resourceful Extra Die:__ You rolled a **[${extraRoll}]**!\n**New Total Successes:** ${successCount} (${finalOutcome})${secondaryZoneMsg}\n${freshResourceful.Uses}↺ remaining`,
          components: [] 
        });

        // Announce the perk consumption publicly to the channel
        await interaction.followUp({
          content: `${activeCharacter.name} used a charge of __Resourceful__ (${freshResourceful.Uses}↺ remaining) to roll an extra 1d6! Result: **[${extraRoll}]**. New Outcome: **${finalOutcome}**.${secondaryZoneMsg}`
        });

        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('add_resourceful_die')
              .setLabel('Expired')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );
          await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        }
      });
    }
    // === END OF RESOURCEFUL PERK LOGIC ===
  }
};
