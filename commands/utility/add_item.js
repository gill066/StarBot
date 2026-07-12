const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

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
        .setName('use')
        .setDescription('Item use')
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
    const use = interaction.options.getString('use');
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
    if (!db[userId]) db[userId] = { inventory: [] };
    if (!Array.isArray(db[userId].inventory)) db[userId].inventory = [];
    db[userId].inventory.push(item);

    // Recalculate load and capacity for this user
    const getNumeric = v => Number(v ?? 0) || 0;
    const inventoryLoad = db[userId].inventory.reduce((sum, it) => sum + getNumeric(it?.Weight), 0);
    const inventoryCapChange = db[userId].inventory.reduce((sum, it) => sum + getNumeric(it?.CapChange), 0);
    const perksArr = Array.isArray(db[userId].perks) ? db[userId].perks : [];
    const perkCapChange = perksArr.reduce((sum, p) => sum + getNumeric(p?.CapChange), 0);
    db[userId].load = inventoryLoad;
    db[userId].capacity = 6 + inventoryCapChange + perkCapChange;

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      await interaction.reply({ content: `Added item to your inventory. New load: ${db[userId].load}`, ephemeral: true });
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await interaction.reply({ content: `Failed to add item.`, ephemeral: true });
    }
  },

};
