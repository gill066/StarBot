const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder 
} = require('discord.js');

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
          console.error('Failed to deduct Resourceful usage ↺s', err);
        }

        // Recalculate final outcome tier
        let finalOutcome;
        if (successCount >= 2) finalOutcome = 'SUCCESS';
        else if (successCount === 1) finalOutcome = 'MIXED';
        else finalOutcome = 'FAILURE';

        // Update the user's private view
        await btnInteraction.update({
          content: `You rolled a **[${extraRoll}]**.\n**New Total Successes:** ${successCount} (${finalOutcome})${secondaryZoneMsg}\n${freshResourceful.Uses}↺ remaining`,
          components: [] 
        });

        // Announce the perk consumption publicly to the channel
        await interaction.followUp({
          content: `${activeCharacter.name} used a ↺ of __Resourceful__ (${freshResourceful.Uses}↺ remaining) to roll an extra 1d6! Result: **[${extraRoll}]**. New Outcome: **${finalOutcome}**.${secondaryZoneMsg}`
        });

        // If the re-roll STILL yields a failure, run the injury check sequence
        if (finalOutcome === 'FAILURE') {
          await runInjurySequence(interaction, target, dataPath, userId);
        }

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
          
          // If they didn't utilize Resourceful and it was an outright failure, process injury now
          if (outcome === 'FAILURE') {
            await runInjurySequence(interaction, target, dataPath, userId);
          }
        }
      });
    } else if (outcome === 'FAILURE') {
      // No Resourceful alternatives available, jump straight into processing injury updates
      await runInjurySequence(interaction, target, dataPath, userId);
    }
    // === END OF RESOURCEFUL PERK LOGIC ===
  }
};

// === SUB-PROCESS HANDLERS: INJURY LOGIC WORKFLOWS ===

async function runInjurySequence(interaction, target, dataPath, userId) {
  // 1. Core State Re-Verification
  let currentDb = {};
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    currentDb = raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Critical reading error within injury workflow thread', err);
    return;
  }

  const activeCharacter = currentDb[userId]?.characters?.[currentDb[userId].activeIndex];
  if (!activeCharacter) return;

  // Resolve matching case variant names inside profile schema safely
  const attrKey = Object.keys(activeCharacter).find(k => k.toUpperCase() === target.toUpperCase()) || target;
  const attributeScore = Number(activeCharacter[attrKey] ?? 0);

  // Roll 1d6 mitigation check
  const injuryRoll = Math.floor(Math.random() * 6) + 1;
  const baseLogString = `⚠️ **Risk Roll Failure!** Checking for fallback protection... rolled a **${injuryRoll}** against your **${target}** score of **${attributeScore}**.`;

  if (injuryRoll <= attributeScore) {
    // Immediate Injury required
    await presentInjuryChoices(interaction, target, dataPath, userId, baseLogString);
  } else {
    // Above score: mitigation choices become available
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('injury_tough_it_out')
        .setLabel('Tough It Out (-1 Stat)')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('injury_take_the_hit')
        .setLabel('Take An Injury')
        .setStyle(ButtonStyle.Secondary)
    );

    const promptMessage = await interaction.followUp({
      content: `${baseLogString}\n\nYou rolled *above* your attribute threshold! Would you like to **Tough It Out** or choose to take an **Injury condition** directly?`,
      components: [row],
      ephemeral: true
    });

    const collector = promptMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: 'This selection window belongs to another user instance.', ephemeral: true });
        return;
      }

      if (btnInteraction.customId === 'injury_tough_it_out') {
        try {
          const freshRaw = fs.readFileSync(dataPath, 'utf8');
          const freshDb = freshRaw.trim() ? JSON.parse(freshRaw) : currentDb;
          const freshChar = freshDb[userId].characters[freshDb[userId].activeIndex];
          
          const oldScore = Number(freshChar[attrKey] ?? 0);
          freshChar[attrKey] = Math.max(0, oldScore - 1);

          fs.writeFileSync(dataPath, JSON.stringify(freshDb, null, 2), 'utf8');

          await btnInteraction.update({
            content: `🛡️ **Tough It Out Selected:** Your permanent ${target} score was reduced from **${oldScore}** down to **${freshChar[attrKey]}**.`,
            components: []
          });

          await interaction.followUp({
            content: `🛡️ **${freshChar.name}** grits their teeth and decides to **Tough It Out**! Their ${target} score drops to **${freshChar[attrKey]}**.`
          });
        } catch (err) {
          console.error('Failed processing mitigation deductions securely', err);
        }
        collector.stop();
      } else if (btnInteraction.customId === 'injury_take_the_hit') {
        collector.stop();
        // Redirect into standard options flow via automated button interface updating
        await presentInjuryChoices(interaction, target, dataPath, userId, baseLogString, btnInteraction);
      }
    });
  }
}

async function presentInjuryChoices(interaction, target, dataPath, userId, statusContext, operationalButtonInteraction = null) {
  const isBody = target.toUpperCase() === 'BODY';
  
  const rulesMap = isBody ? [
    { label: 'Brain', desc: 'Suffer cognitive fog. Lose access to a perk.', val: 'brain' },
    { label: 'Core', desc: 'Give into pain. CAPACITY halved.', val: 'core' },
    { label: 'Limb', desc: 'Critically fumble. Destroy one item.', val: 'limb' },
    { label: 'Strain', desc: 'Forget yourself. Lose access to a tag.', val: 'strain' }
  ] : [
    { label: 'Fight', desc: '+1 XP when you do something violent.', val: 'fight' },
    { label: 'Flight', desc: '+1 XP when you avoid conflict or hardship.', val: 'flight' },
    { label: 'Freeze', desc: '+1 XP when you let something play out.', val: 'freeze' },
    { label: 'Fawn', desc: '+1 XP when you comply with an enemy.', val: 'fawn' }
  ];

  const row = new ActionRowBuilder().addComponents(
    rulesMap.map(injury => 
      new ButtonBuilder()
        .setCustomId(`select_inj_${injury.val}`)
        .setLabel(injury.label)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const finalPromptContent = `${statusContext}\n\n🚨 **Select your preferred Injury Profile alignment:**\n` + 
    rulesMap.map(i => `• **<${i.label}>**: ${i.desc}`).join('\n');

  // Serve initial prompt view
  if (operationalButtonInteraction) {
    await operationalButtonInteraction.update({
      content: finalPromptContent,
      components: [row]
    });
  } else {
    await interaction.followUp({
      content: finalPromptContent,
      components: [row],
      ephemeral: true
    });
  }

  // Use a flat channel collector filtered by the active user to circumvent ephemeral caching bugs
  const collector = interaction.channel.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 120000 // 2-minute expiration lifeline window for the complete sequence
  });

  collector.on('collect', async (i) => {
    // --- STAGE 1: HANDLE INJURY BUTTON CLICKS ---
    if (i.customId.startsWith('select_inj_')) {
      const targetedKey = i.customId.replace('select_inj_', '');
      const userChoiceMatch = rulesMap.find(item => item.val === targetedKey);

      let freshDb = {};
      try {
        const freshRaw = fs.readFileSync(dataPath, 'utf8');
        freshDb = freshRaw.trim() ? JSON.parse(freshRaw) : {};
      } catch (err) {
        console.error(err);
      }
      const targetCharacter = freshDb[userId]?.characters?.[freshDb[userId].activeIndex];
      if (!targetCharacter) return;

      const injuryLogEntry = {
        sourceAttribute: target,
        classification: userChoiceMatch.label,
        mechanicsText: userChoiceMatch.desc,
        loggedAt: new Date().toISOString()
      };

      targetCharacter.injuries = targetCharacter.injuries || [];
      targetCharacter.inactivePerks = targetCharacter.inactivePerks || [];
      targetCharacter.inactiveItems = targetCharacter.inactiveItems || [];
      targetCharacter.inactiveTags = targetCharacter.inactiveTags || [];

      // Mind Injuries or Core Injury (No dropdown selection sequences required)
      if (!isBody || targetedKey === 'core') {
        targetCharacter.injuries.push(injuryLogEntry);

        // --- ADDED: Increment load case-insensitively ---
        const loadKey = Object.keys(targetCharacter).find(k => k.toUpperCase() === 'LOAD') || 'load';
        targetCharacter[loadKey] = Number(targetCharacter[loadKey] ?? 0) + 1;

        if (targetedKey === 'core') {
          targetCharacter.coreInjury = true;
          const capacityKey = Object.keys(targetCharacter).find(k => k.toUpperCase() === 'CAPACITY') || 'capacity';
          const priorCapacity = Number(targetCharacter[capacityKey] ?? 0);
          targetCharacter[capacityKey] = Math.floor(priorCapacity / 2);
        }

        try {
          fs.writeFileSync(dataPath, JSON.stringify(freshDb, null, 2), 'utf8');
        } catch (err) {
          console.error(err);
        }

        await i.update({
          content: `Injury Sustained: **<${userChoiceMatch.label}>** (+1 Load applied)`,
          components: []
        });

        await interaction.followUp({
          content: `💥 **${targetCharacter.name}** has sustained a **${target} Injury**: \`<${userChoiceMatch.label}>\`! *(${userChoiceMatch.desc})*\n⚠️ **Encumbrance Added:** +1 Load applied.`
        });

        collector.stop();
        return;
      }

      // Prepare Dropdowns for targeted modifications (Brain, Limb, Strain)
      let dropdownOptions = [];
      let placeholderText = '';

      if (targetedKey === 'brain') {
        const activePerks = (targetCharacter.perks || []).filter(p => !p.inactive);
        dropdownOptions = activePerks.map((p, idx) => 
          new StringSelectMenuOptionBuilder()
            .setLabel((p.Name || p.name || p.key || `Perk ${idx}`).substring(0, 100))
            .setValue(String(idx))
        );
        placeholderText = 'Select a __perk__ to disable...';
      } 
      else if (targetedKey === 'limb') {
        const currentItems = targetCharacter.inventory || [];
        dropdownOptions = currentItems.map((item, idx) => 
          new StringSelectMenuOptionBuilder()
            .setLabel((item.Name || item.name || item.key || `Item ${idx}`).substring(0, 100))
            .setValue(String(idx))
        );
        placeholderText = 'Select an **item** to destroy...';
      } 
      else if (targetedKey === 'strain') {
        const activeTags = targetCharacter.tags || [];
        dropdownOptions = activeTags.map((tag, idx) => 
          new StringSelectMenuOptionBuilder()
            .setLabel(tag.substring(0, 100))
            .setValue(String(idx))
        );
        placeholderText = 'Select a *tag* to disable...';
      }

      // Fallback logic for empty array contexts
      if (dropdownOptions.length === 0) {
        targetCharacter.injuries.push(injuryLogEntry);

        // --- ADDED: Increment load case-insensitively ---
        const loadKey = Object.keys(targetCharacter).find(k => k.toUpperCase() === 'LOAD') || 'load';
        targetCharacter[loadKey] = Number(targetCharacter[loadKey] ?? 0) + 1;

        try {
          fs.writeFileSync(dataPath, JSON.stringify(freshDb, null, 2), 'utf8');
        } catch (err) {}

        await i.update({
          content: `Injury Sustained: **<${userChoiceMatch.label}>** (No assets available to lose, +1 Load applied)`,
          components: []
        });
        await interaction.followUp({
          content: `${targetCharacter.name} sustained a ${target} <injury>: \`<${userChoiceMatch.label}>\`! However, no active assets were available to lose.\n⚠️ **Encumbrance Added:** +1 Load applied.`
        });
        collector.stop();
        return;
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`injury_dropdown_${targetedKey}`)
        .setPlaceholder(placeholderText)
        .addOptions(dropdownOptions);

      const dropdownRow = new ActionRowBuilder().addComponents(selectMenu);

      // Transition the view to show the select dropdown menu layout smoothly
      await i.update({
        content: `You selected **<${userChoiceMatch.label}>**. Which asset do you sacrifice?`,
        components: [dropdownRow]
      });
    }

    // --- STAGE 2: HANDLE SELECT MENU SUBMISSIONS ---
    else if (i.customId.startsWith('injury_dropdown_')) {
      const targetedKey = i.customId.replace('injury_dropdown_', '');
      const labelMap = { brain: 'Brain', limb: 'Limb', strain: 'Strain' };
      const descMap = {
        brain: 'Suffer cognitive fog. Lose access to a __perk__.',
        limb: 'Critically fumble. Destroy one **item.**',
        strain: 'Forget yourself. Lose access to a *tag.*'
      };

      let finalDb = {};
      try {
        const finalRaw = fs.readFileSync(dataPath, 'utf8');
        finalDb = finalRaw.trim() ? JSON.parse(finalRaw) : {};
      } catch (err) {
        console.error(err);
      }
      const finalChar = finalDb[userId]?.characters?.[finalDb[userId].activeIndex];
      if (!finalChar) return;

      const selectedIndex = parseInt(i.values[0]);
      let systemicAnnouncementDetail = '';

      finalChar.injuries = finalChar.injuries || [];
      finalChar.injuries.push({
        sourceAttribute: target,
        classification: labelMap[targetedKey],
        mechanicsText: descMap[targetedKey],
        loggedAt: new Date().toISOString()
      });

      // --- ADDED: Increment load case-insensitively ---
      const loadKey = Object.keys(finalChar).find(k => k.toUpperCase() === 'LOAD') || 'load';
      finalChar[loadKey] = Number(finalChar[loadKey] ?? 0) + 1;

      finalChar.inactivePerks = finalChar.inactivePerks || [];
      finalChar.inactiveItems = finalChar.inactiveItems || [];
      finalChar.inactiveTags = finalChar.inactiveTags || [];

      if (targetedKey === 'brain') {
        const activePerks = (finalChar.perks || []).filter(p => !p.inactive);
        const targetedPerk = activePerks[selectedIndex];
        if (targetedPerk) {
          targetedPerk.inactive = true;
          targetedPerk.brainInjury = true;
          finalChar.inactivePerks.push(targetedPerk);
          systemicAnnouncementDetail = `__${targetedPerk.Name || targetedPerk.name || targetedPerk.key}__ disabled`;
        }
      } 
      else if (targetedKey === 'limb') {
        if (finalChar.inventory && finalChar.inventory[selectedIndex]) {
          const [destroyedItem] = finalChar.inventory.splice(selectedIndex, 1);
          finalChar.inactiveItems.push(destroyedItem);
          systemicAnnouncementDetail = `**${destroyedItem.Name || destroyedItem.name || destroyedItem.key}** destroyed`;
        }
      } 
      else if (targetedKey === 'strain') {
        if (finalChar.tags && finalChar.tags[selectedIndex]) {
          const [disabledTag] = finalChar.tags.splice(selectedIndex, 1);
          finalChar.inactiveTags.push(disabledTag);
          systemicAnnouncementDetail = `*${disabledTag}* disabled`;
        }
      }

      try {
        fs.writeFileSync(dataPath, JSON.stringify(finalDb, null, 2), 'utf8');
      } catch (err) {
        console.error(err);
      }

      // Confirm visually to the user that the selection cleared out successfully
      await i.update({
        content: `<Injury> sustained: ${systemicAnnouncementDetail} (+1 Load applied)`,
        components: []
      });

      await interaction.followUp({
        content: `${finalChar.name} has sustained a **${target} Injury**: \`<${labelMap[targetedKey]}>\`!\n⚠️ **Consequences Applied:** ${systemicAnnouncementDetail} (+1 Load applied).`
      });

      collector.stop();
    }
  });
}