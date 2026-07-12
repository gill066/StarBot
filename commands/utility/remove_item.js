const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const playerDataPath = path.join(__dirname, '..', '..', 'player_data.json');

function loadPlayerData() {
  try {
    const raw = fs.readFileSync(playerDataPath, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function savePlayerData(data) {
  fs.writeFileSync(playerDataPath, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove_item')
    .setDescription('Remove an item from your inventory')
    .addStringOption((option) =>
      option
        .setName('item')
        .setDescription('Select the item to remove from your inventory')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction) {
    const playerData = loadPlayerData();
    const player = playerData[interaction.user.id];
    const inventory = Array.isArray(player?.inventory) ? player.inventory : [];
    const focusedRaw = interaction.options.getFocused();
    const focused = (focusedRaw === undefined || focusedRaw === null) ? '' : String(focusedRaw).toLowerCase();

    const choices = inventory
      .map((item) => String(item))
      .filter((itemStr) => itemStr.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((itemStr) => {
        // Ensure Discord limits: name max 100 chars
        const name = itemStr.length > 100 ? itemStr.slice(0, 100) : itemStr;
        return { name, value: itemStr };
      });

    try {
      await interaction.respond(choices);
    } catch (err) {
      console.error('Failed to respond to autocomplete for remove_item:', err);
      // best-effort: respond with empty choices to avoid client-side error
      try { await interaction.respond([]); } catch (e) {}
    }
  },

  async execute(interaction) {
    const itemName = interaction.options.getString('item');
    const playerId = interaction.user.id;
    const playerData = loadPlayerData();
    const player = playerData[playerId];

    if (!player) {
      return interaction.reply({ content: 'No player data found for you.', ephemeral: true });
    }

    if (!Array.isArray(player.inventory) || player.inventory.length === 0) {
      return interaction.reply({ content: 'Your inventory is empty.', ephemeral: true });
    }

    const itemIndex = player.inventory.findIndex(
      (item) => item.toString().toLowerCase() === itemName.toLowerCase(),
    );

    if (itemIndex === -1) {
      return interaction.reply({ content: `Item "${itemName}" was not found in your inventory.`, ephemeral: true });
    }

    const [removedItem] = player.inventory.splice(itemIndex, 1);
    playerData[playerId] = player;

    try {
      savePlayerData(playerData);
    } catch (error) {
      return interaction.reply({ content: 'Failed to update player data.', ephemeral: true });
    }

    return interaction.reply({ content: `Removed ${removedItem} from your inventory.`, ephemeral: false });
  },
};
