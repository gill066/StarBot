const { SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const charSheetCommand = require('./char_sheet');
const { replySafely } = require('../../utils/interaction');

module.exports = {
  // Load starnet homes to populate choices for the `home` option
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('create_specialist')
      .setDescription('Create a new StarNet specialist')
      .addStringOption(option => option.setName('name').setDescription('Specialist name').setRequired(true));

    const addChoicesFrom = (sourceObj, optionName, description, required, labelFn) => {
      try {
        const entries = Array.isArray(sourceObj)
          ? sourceObj.map(value => [value, value])
          : sourceObj && typeof sourceObj === 'object'
            ? Object.entries(sourceObj)
            : [];
        const choices = entries.map(([key, val]) => {
          const value = Array.isArray(sourceObj) ? val : key;
          return { name: labelFn ? labelFn(key, val) : value, value };
        }).slice(0, 25);
        if (choices.length) {
          builder.addStringOption(opt => opt.setName(optionName).setDescription(description).setRequired(!!required).addChoices(...choices));
        } else {
          builder.addStringOption(opt => opt.setName(optionName).setDescription(description).setRequired(!!required));
        }
      } catch (e) {
        builder.addStringOption(opt => opt.setName(optionName).setDescription(description).setRequired(!!required));
      }
    };

    let starnet = {};
    try {
      const starnetPath = path.join(__dirname, '../../starnet.json');
      const raw = fs.readFileSync(starnetPath, 'utf8');
      starnet = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      starnet = {};
    }

    addChoicesFrom(starnet.homes || {}, 'home', 'Specialist home', true, (k) => k);
    addChoicesFrom(starnet.works || {}, 'work', 'Specialist work', true, (k, v) => `${k} — ${v.Name}`);
    addChoicesFrom(starnet.types || {}, 'type', 'Specialist type', true, (k) => k);
    addChoicesFrom(starnet.zone || {}, 'zone', 'Specialist zone', true, (k) => k);
    addChoicesFrom(starnet.startGear || {}, 'startgear', 'StarNet gear', true, (k) => k);
    addChoicesFrom(starnet.perks || {}, 'perk', 'Specialist perk', true, (k) => k);
    return builder;
  })(),

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const home = interaction.options.getString('home');
    const work = interaction.options.getString('work');
    const type = interaction.options.getString('type');
    const zone = interaction.options.getString('zone'); const body = 6-zone; const mind = zone-1;
    const startgear = interaction.options.getString('startgear');
    const perk = interaction.options.getString('perk');

    const file = path.join(__dirname, '../../player_data.json');
    let db = {};
    try {
      const raw = fs.readFileSync(file, 'utf8');
      db = raw.trim() ? JSON.parse(raw) : {};
    } catch (e) {
      db = {};
    }

    let homeTag = null; let workTag = null;
    let workObject = null;
    let startGearObject = null;
    let starnet = {};
    try {
      const starnetPath = path.join(__dirname, '../../starnet.json');
      const rawStarnet = fs.readFileSync(starnetPath, 'utf8');
      starnet = rawStarnet.trim() ? JSON.parse(rawStarnet) : {};
      const homes = starnet.homes || {};
      const works = starnet.works || {};
      homeTag = homes[home] || null;
      if (work in works) {
        workObject = { key: work, ...works[work] };
        workTag = work; // push the selected work key/name into tags
      }
      const startGear = starnet.startGear || {};
      if (startgear && startgear in startGear) startGearObject = { key: startgear, ...startGear[startgear] };
    } catch (e) {
      homeTag = null;
      workTag = null;
      workObject = null;
    }

    const tags = [];
    if (homeTag) tags.push(homeTag);
    if (workTag) tags.push(workTag);
    if (type) tags.push(type);

    const inventory = [];
    if (workObject) inventory.push(workObject);
    if (startGearObject) inventory.push(startGearObject);

    const perkObject = perk && starnet.perks && (perk in starnet.perks)
      ? { key: perk, ...starnet.perks[perk] }
      : null;

    const getNumeric = value => Number(value ?? 0) || 0;
    const inventoryCapChange = inventory.reduce((sum, item) => sum + getNumeric(item?.CapChange), 0);
    const perkCapChange = getNumeric(perkObject?.CapChange);
    const inventoryLoad = inventory.reduce((sum, item) => sum + getNumeric(item?.Weight), 0);

// update the player's load and capacity
    let load = inventoryLoad;
    let capacity = 6 + inventoryCapChange + perkCapChange;
// Save the new specialist data to the player_data.json file
    db[interaction.user.id] = {
      name,
      home,
      work,
      tags,
      inventory,
      type,
      zone,
      body,
      mind,
      perks: perkObject ? [perkObject] : [],
      capacity,
      load,
      inTheZone: false,
      rank: 1,
      xp: 0
    };

    try {
      fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      // Confirm by showing the saved character sheet
      await charSheetCommand.execute(interaction);
    } catch (err) {
      console.error('Failed to write player_data.json', err);
      await replySafely(interaction, { content: 'Failed to save variables.', ephemeral: true });
    }
  },
};
