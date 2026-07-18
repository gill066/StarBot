const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

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
      
      // Save the migration back to the disk right away
      try {
        fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to write legacy migration during char_sheet:', err);
      }
    }
    // --------------------------------------------------------

    // Reject command execution if they structural entry exists but contains 0 array elements
    if (!userEntry.characters || userEntry.characters.length === 0) {
      await replySafely(interaction, { content: 'No specialists found in your database profile. Create one first.', ephemeral: true });
      return;
    }

    // Extract the active profile matching the user's active pointer index slot
    const entry = userEntry.characters[userEntry.activeIndex];

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

    // --- FIXED: Filter out perks where inactive is true ---
    const activePerks = Array.isArray(entry.perks) ? entry.perks.filter(p => !p.inactive) : [];

    const perksDisplay = activePerks.length
      ? activePerks.map(p => {
          const name = p.Name || p.name || p.key || 'Unknown';
          const desc = p.Description || p.description || 'No description available.';
          const uses = p.Uses != null ? p.Uses : null;
          const usesPart = (uses === null || uses === -1) ? '' : ` (${uses}↺)`;
          return `${name} — ${desc}${usesPart}`;
        }).join('\n')
      : 'None';

    const zoneFooter = entry.inTheZone ? '\n💫 I N T H E Z O N E 💫' : '';

    // --- DYNAMIC INJURY DISPLAY ---
    const injuriesDisplay = Array.isArray(entry.injuries) && entry.injuries.length
      ? `\n**Injuries:** ${entry.injuries.map(i => `**<${i.classification}>** *${i.mechanicsText}*`).join(', ')}`
      : '';

    const description = `**Home:** ${entry.home} | **Work:** *${entry.work}* | **Type:** *${entry.type}*
**Zone:** ${entry.zone} | **Body:** ${entry.body} | **Mind:** ${entry.mind}
**Perks:**\n${perksDisplay}
**Inventory:**\n${inventory}
**Capacity:** ${entry.load || 0} / ${entry.capacity || 0}#
**Tags:** *${entry.tags?.join(', ') || 'None'}*${injuriesDisplay}
**XP:** ${entry.xp || 0} | **Rank:** ${entry.rank || 1}${zoneFooter}`;

    // Add slot metadata in the embed footer so players know their active list context
    const slotCount = userEntry.characters.length;

    // --- CONDITIONALLY ADD PRONOUNS TO TITLE ---
    const embedTitle = entry.pronouns ? `${entry.name} (${entry.pronouns})` : entry.name;

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setDescription(description)
      .setFooter({ text: `Active Slot: ${userEntry.activeIndex + 1} / ${slotCount} (Max 5)` });

    await replySafely(interaction, {
      embeds: [embed],
      ephemeral: false,
    });
  },
};