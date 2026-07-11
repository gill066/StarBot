const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('char_sheet')
    .setDescription('Show your character sheet from the player database.'),

  async execute(interaction) {
    const file = path.join(__dirname, '../../player_data.json');
    let db = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    const entry = db[interaction.user.id];
    if (!entry) {
      await interaction.reply({ content: 'No variables found for you. Create a specialist first.', ephemeral: true });
      return;
    }

    const inventory = Array.isArray(entry.inventory) && entry.inventory.length
      ? entry.inventory.map((item, index) => {
          const name = item.Name || item.name || item.key || 'Unknown';
          const func = item.Use || item.function || item.Functionality || 'N/A';
          const weight = item.Weight != null ? item.Weight : 'N/A';
          const uses = item.Uses != null ? item.Uses : 'N/A';
          const maxUses = item.MaxUses != null ? item.MaxUses : 'N/A';
          const usesPart = (maxUses === -1) ? '' : ` ${uses}↺`;
          const weightPart = (weight === 0) ? '' : ` ${weight}#`;
          return `**${name}.** ${func}.${weightPart}${usesPart}`;
        }).join('\n')
      : 'None';

    const content = `
${entry.name}
**Home:** ${entry.home}
**Work:** *${entry.work}*
**Type:** *${entry.type}*
**Zone:** ${entry.zone} **Body:** ${entry.body} **Mind:** ${entry.mind}
**Perk:** ${entry.perk || 'None'}
**Inventory:**\n${inventory}
**Tags:** *${entry.tags?.join(', ') || 'None'}*
`

/*
Home: Ankhmar
Work: Science
Type: Imperious
Zone: 2 Body: 4 Mind: 1
Perk:
Mutated. Redistribute your MIND and BODY 1↺
Gear:
Scanner. Scan targets. 1↺ to collect data. 1# 3↺
Emergency relay. Teleport team to Node. 2# 1↺
Capacity: 3 / 6#
Tags: Candor, Science, Imperious
Rank: 1 XP: 0
💫 I N T H E Z O N E 💫
*/

    await interaction.reply({
      content,
      ephemeral: false,
    });
  },
};
