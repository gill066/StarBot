const { SlashCommandBuilder } = require('discord.js');
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
    const successCount = rolls.filter(result => {
      return target === 'BODY'
        ? result >= zoneValue
        : result <= zoneValue;
    }).length;

    const anyExact = rolls.some(r => r === zoneValue);
    
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

    // compute outcome outcome text configurations
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

    await replySafely(interaction, { content: replyMsg });
  }
};
