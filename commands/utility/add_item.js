const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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
    const nameInput = interaction.options.getString('name');
    const use = interaction.options.getString('function');
    const weight = interaction.options.getInteger('weight');
    const uses = interaction.options.getInteger('uses');

    const customItem = {
      Name: nameInput,
      Use: use,
      Weight: weight,
      Uses: uses,
      MaxUses: uses,
      CapChange: 0,
    };

    // Predefined registry of stock items normalized for simple matching
    const stockItems = {
      "battery pack": { Name: "Battery pack", Use: "Refill ↺ on StarNet devices", Weight: 1, Uses: 1, MaxUses: 1, CapChange: 0 },
      "ansible radio": { Name: "Ansible radio", Use: "Communicate long-distance", Weight: 1, Uses: -1, MaxUses: -1, CapChange: 0 },
      "bubble shield": { Name: "Bubble shield", Use: "Emit temporary forcefield", Weight: 2, Uses: 1, MaxUses: 1, CapChange: 0 },
      "emergency relay": { Name: "Emergency relay", Use: "Teleport team to Node", Weight: 2, Uses: 1, MaxUses: 1, CapChange: 0 },
      "matter fabricator": { Name: "Matter fabricator", Use: "Print .fab blueprints", Weight: 3, Uses: 2, MaxUses: 2, CapChange: 0 },
      "carry rig": { Name: "Carry rig", Use: "Add 3# to carrying capacity", Weight: 0, Uses: -1, MaxUses: -1, CapChange: 3 },
      "translator": { Name: "Translator", Use: "Understand non-Basic languages", Weight: 1, Uses: -1, MaxUses: -1, CapChange: 0 },
      "exosuit": { Name: "Exosuit", Use: "Traverse hazards. 1↺ per hour", Weight: 3, Uses: 6, MaxUses: 6, CapChange: 0 },
      "drone": { Name: "Drone", Use: "Do tasks from afar. 1↺ per task", Weight: 2, Uses: 3, MaxUses: 3, CapChange: 0 },
      "scanner": { Name: "Scanner", Use: "Scan targets. 1↺ to collect data", Weight: 1, Uses: 3, MaxUses: 3, CapChange: 0 },
      "medkit": { Name: "Medkit", Use: "Fix injuries. 1↺ per injury healed", Weight: 3, Uses: 3, MaxUses: 3, CapChange: 0 },
      "coilgun": { Name: "Coilgun", Use: "Magnetic SMG. 1↺ to injure or kill", Weight: 2, Uses: 6, MaxUses: 6, CapChange: 0 }
    };

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

    if (db[userId].name && !db[userId].characters) {
      const legacyCharacter = { ...db[userId] };
      db[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
    }

    if (db[userId].characters.length === 0) {
      return await replySafely(interaction, { 
        content: "You don't have any characters active. Use `/create_specialist` first!", 
        ephemeral: true 
      });
    }

    const activeCharacter = db[userId].characters[db[userId].activeIndex];

    // Shared execution logic to update tracking fields and commit modifications to file
    const processInventoryAddition = async (finalItem, targetCtxInteraction, isButtonPayload = false) => {
      if (!Array.isArray(activeCharacter.inventory)) {
        activeCharacter.inventory = [];
      }
      
      activeCharacter.inventory.push(finalItem);

      const getNumeric = v => Number(v ?? 0) || 0;
      const inventoryLoad = activeCharacter.inventory.reduce((sum, it) => sum + getNumeric(it?.Weight), 0);
      const inventoryCapChange = activeCharacter.inventory.reduce((sum, it) => sum + getNumeric(it?.CapChange), 0);
      const perksArr = Array.isArray(activeCharacter.perks) ? activeCharacter.perks : [];
      const perkCapChange = perksArr.reduce((sum, p) => sum + getNumeric(p?.CapChange), 0);
      
      activeCharacter.load = inventoryLoad;
      activeCharacter.capacity = 6 + inventoryCapChange + perkCapChange;

      try {
        fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
        const textOutput = `Added **${finalItem.Name}** to ${activeCharacter.name}'s inventory. New load: ${activeCharacter.load}`;
        
        if (isButtonPayload) {
          // Clear operational items on original ephemeral screen, then broadcast the public log
          await targetCtxInteraction.update({ content: `Selection processed: ${finalItem.Name} has been added.`, components: [] });
          await interaction.followUp({ content: textOutput, ephemeral: false });
        } else {
          await replySafely(targetCtxInteraction, { content: textOutput, ephemeral: false });
        }
      } catch (err) {
        console.error('Failed to write player_data.json', err);
        if (isButtonPayload) {
          await targetCtxInteraction.update({ content: 'Failed to add item due to a database file system error.', components: [] });
        } else {
          await replySafely(targetCtxInteraction, { content: 'Failed to add item.', ephemeral: true });
        }
      }
    };

    // 2. Check for matching catalog layout configurations
    const normalizedSearchKey = nameInput.toLowerCase().trim();
    const matchedStockItem = stockItems[normalizedSearchKey];

    if (matchedStockItem) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_add_stock')
          .setLabel('Use Stock Version')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_add_custom')
          .setLabel('Keep Custom Version')
          .setStyle(ButtonStyle.Secondary)
      );

      const initialMessage = await interaction.reply({
        content: `The item name "${nameInput}" matches an entry in the master database layout. Would you like to use the official stock attributes or proceed with your custom inputs?`,
        components: [row],
        ephemeral: true
      });

      const collector = initialMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000
      });

      collector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
          return btnInteraction.reply({ content: 'This confirmation screen belongs to someone else.', ephemeral: true });
        }
        collector.stop();

        if (btnInteraction.customId === 'btn_add_stock') {
          await processInventoryAddition(matchedStockItem, btnInteraction, true);
        } else if (btnInteraction.customId === 'btn_add_custom') {
          await processInventoryAddition(customItem, btnInteraction, true);
        }
      });

      return;
    }

    // 3. Direct standard custom insertion pathway if no asset conflict matches
    await processInventoryAddition(customItem, interaction, false);
  },
};