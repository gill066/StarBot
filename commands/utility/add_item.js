const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add_item')
    .setDescription('Add an item to the inventory')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Item name')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('function')
        .setDescription('Item function')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('weight')
        .setDescription('Item weight')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('uses')
        .setDescription('Item uses (-1 if usage is unlimited)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const use = interaction.options.getString('function');
    const weight = interaction.options.getInteger('weight');
    const uses = interaction.options.getInteger('uses');

    const item = {
      Name: name,
      Use: use,
      Weight: weight,
      Uses: uses,
      MaxUses: uses,
      CapChange: 0,
    };

    // persist item to player_data.json under this user's inventory
    const file = path.join(__dirname, '..', '..', 'player_data.json');
    let db = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    const userId = interaction.user.id;

    // 1. Structural Migration / Setup check
    if (!db[userId]) {
      db[userId] = {
        activeIndex: 0,
        characters: []
      };
    }

    // Convert old single character format to array profile on the fly if needed
    if (db[userId].name && !db[userId].characters) {
      const legacyCharacter = { ...db[userId] };
      db[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
    }

    // Reject command if they have no characters at all
    if (db[userId].characters.length === 0) {
      return await replySafely(interaction, { 
        content: "❌ You don't have any characters active. Use `/create_specialist` first!", 
        ephemeral: true 
      });
    }

    // 2. Fetch the target character profile reference using the activeIndex pointer
    const activeCharacter = db[userId].characters[db[userId].activeIndex];

    // Safely verify character inventory property exists
    if (!Array.isArray(activeCharacter.inventory)) {
      activeCharacter.inventory = [];
    }
    
    // Push the item into the array reference
    activeCharacter.inventory.push(item);

    // 3. Recalculate load and capacity strictly for this specific character
    const getNumeric = v => Number(v ?? 0) || 0;
    const inventoryLoad = activeCharacter.inventory.reduce((sum, it) => sum + getNumeric(it?.Weight), 0);
    const inventoryCapChange = activeCharacter.inventory.reduce((sum, it) => sum + getNumeric(it?.CapChange), 0);
    const perksArr = Array.isArray(activeCharacter.perks) ? activeCharacter.perks : [];
    const perkCapChange = perksArr.reduce((sum, p) => sum + getNumeric(p?.CapChange), 0);
    
    // Update variables inside the active character object boundaries
    activeCharacter.load = inventoryLoad;
    activeCharacter.capacity = 6 + inventoryCapChange + perkCapChange;

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      await replySafely(interaction, { 
        content: `Added **${name}** to ${activeCharacter.name}'s inventory. New load: ${activeCharacter.load}`, 
        ephemeral: false 
      });
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await replySafely(interaction, { content: `Failed to add item.`, ephemeral: true });
    }
  },
};
