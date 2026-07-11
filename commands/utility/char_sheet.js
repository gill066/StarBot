const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

    const perkEntry = entry.perk;
    const perkName = typeof perkEntry === 'string'
      ? perkEntry
      : perkEntry?.Name || perkEntry?.name || perkEntry?.key || 'None';
    const perkDescription = typeof perkEntry === 'object' && perkEntry
      ? perkEntry.Description || perkEntry.description || 'No description available.'
      : 'No description available.';
    const perkUses = typeof perkEntry === 'object' && perkEntry && perkEntry.Uses != null
      ? perkEntry.Uses
      : null;
    const perkUsesPart = (perkUses === null || perkUses === -1)
      ? ''
      : `, ${perkUses}↺`;

    const zoneFooter = entry.inTheZone ? '\n💫 I N T H E Z O N E 💫' : '';

    const description = `**Home:** ${entry.home}
**Work:** *${entry.work}*
**Type:** *${entry.type}*
**Zone:** ${entry.zone} | **Body:** ${entry.body} | **Mind:** ${entry.mind}
**Perk:** __${perkName}__ (${perkDescription}${perkUsesPart})
**Inventory:**\n${inventory}
**Tags:** *${entry.tags?.join(', ') || 'None'}*
**Capacity:** ${entry.load || 0} / ${entry.capacity || 0}#
**XP:** ${entry.xp || 0} | **Rank:** ${entry.rank || 1}${zoneFooter}`;

    const embed = new EmbedBuilder()
      .setTitle(entry.name)
      .setDescription(description);

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  },
};
