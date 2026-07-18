const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list_keywords')
    .setDescription("Produces a list of all your character's tags, items, perks, injuries, and memories.")
    .addBooleanOption(option =>
      option.setName('public')
        .setDescription('Share your {keyword} list publicly?.')
        .setRequired(false)
    ),

  async execute(interaction) {
    const file = path.join(__dirname, '../../player_data.json');
    const userId = interaction.user.id;
    const isPublic = interaction.options.getBoolean('public') ?? false;

    let db = {};
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        db = raw.trim() ? JSON.parse(raw) : {};
      }
    } catch (e) {
      db = {};
    }

    let userEntry = db[userId];

    if (!userEntry) {
      await replySafely(interaction, { content: 'No profile found for you. Create a specialist first.', ephemeral: true });
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
      
      try {
        fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      } catch (err) {
        console.error('Failed to write legacy migration during list_keywords:', err);
      }
    }
    // --------------------------------------------------------

    if (!userEntry.characters || userEntry.characters.length === 0) {
      await replySafely(interaction, { content: 'No specialists found in your database profile.', ephemeral: true });
      return;
    }

    const entry = userEntry.characters[userEntry.activeIndex];

    // 1. Process *Tags*
    const tagsList = Array.isArray(entry.tags) && entry.tags.length
      ? entry.tags.map(t => `*${t}*`).join(', ')
      : 'None';

    // 2. Process **Items**
    const itemsList = Array.isArray(entry.inventory) && entry.inventory.length
      ? entry.inventory.map(item => `**${item.Name || item.name || item.key || 'Unknown'}**`).join(', ')
      : 'None';

    // 3. Process __Perks__ (Filtering out inactive perks to stay consistent with char_sheet)
    const activePerks = Array.isArray(entry.perks) ? entry.perks.filter(p => !p.inactive) : [];
    const perksList = activePerks.length
      ? activePerks.map(p => `__${p.Name || p.name || p.key || 'Unknown'}__`).join(', ')
      : 'None';

    // 4. Process <Injuries>
    const injuriesList = Array.isArray(entry.injuries) && entry.injuries.length
      ? entry.injuries.map(i => `<${i.classification || 'Unknown'}>`).join(', ')
      : 'None';

    // 5. Process +Memories+
    const memoriesList = Array.isArray(entry.memories) && entry.memories.length
      ? entry.memories.map(m => `+${m}+`).join(', ')
      : 'None';

    // Build the scannable system log printout
    const content = `**${entry.name}**:\n` +
                    `***Tags***: ${tagsList}\n` +
                    `**Items**: ${itemsList}\n` +
                    `**___Perks___**: ${perksList}\n` + 
                    `**<Injuries>**: ${injuriesList}\n` +
                    `**+Memories+**: ${memoriesList}`;

    // Dispatches response view matching user's visibility preferences
    await replySafely(interaction, {
      content: content,
      ephemeral: !isPublic
    });
  }
};