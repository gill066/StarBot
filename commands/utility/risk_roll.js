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
    

    let zoneValue = null;
    let userTags = [];
    let overweight = 0;
    try {
      const dataPath = path.join(__dirname, '..', '..', 'player_data.json');
      const raw = fs.readFileSync(dataPath, 'utf8');
      const db = raw.trim() ? JSON.parse(raw) : {};
      const userId = interaction.user.id;
      const entry = db[userId];

      if (entry) {
        const capacity = Number(entry.capacity ?? entry.CAPACITY ?? 0);
        const load = Number(entry.load ?? entry.LOAD ?? 0);
        overweight = Math.max(load - capacity, 0);
        if (typeof entry.zone !== 'undefined') {
          zoneValue = Number(entry.zone);
        }
      }
    } catch (e) {
      console.error('Failed to load player data for risk_roll', e);
    }
    const dice = Math.max(number - overweight, 1); // Ensure at least 1 die is rolled even if overweight

    if (!Number.isFinite(zoneValue)) {
      await replySafely(interaction, { content: 'Zone is not set or is invalid. Please create a specialist first.', ephemeral: true });
      return;
    }

    const rolls = Array.from({ length: dice }, () => Math.floor(Math.random() * 6) + 1);
    const successCount = rolls.filter(result => {
      return target === 'BODY'
        ? result >= zoneValue
        : result <= zoneValue;
    }).length;

    const anyExact = rolls.some(r => r === zoneValue);
    let updatedZone = null;
    try {
      const dataPath = path.join(__dirname, '..', '..', 'player_data.json');
      const raw = fs.readFileSync(dataPath, 'utf8');
      const db = raw.trim() ? JSON.parse(raw) : {};
      const userId = interaction.user.id;
      if (db[userId]) {
        if (anyExact) {
          db[userId].inTheZone = true;
          updatedZone = true;
        } else if (successCount === 0) {
          db[userId].inTheZone = false;
          updatedZone = false;
        }
        if (updatedZone !== null) {
          fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
        }
      }
    } catch (e) {
      console.error('Failed to update inTheZone', e);
    }

    // compute outcome with if/else
    let outcome;
    if (successCount >= 2) {
      outcome = 'SUCCESS';
    } else if (successCount === 1) {
      outcome = 'MIXED';
    } else {
      outcome = 'FAILURE';
    }

    let replyMsg = `Rolling ${dice}D6 against ZONE ${zoneValue} using ${target}.
    Overweight ${overweight} Tags applicable ${number}
${outcome} - Rolls: [${rolls.join(', ')}]
`;
    if (updatedZone === false) replyMsg += 'You are no longer 💫 I N T H E Z O N E 💫';
    if (updatedZone === true) replyMsg += 'You are now 💫 I N T H E Z O N E 💫';
    await replySafely(interaction, { content: replyMsg });
  }
};