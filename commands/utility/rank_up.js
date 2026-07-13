const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank_up')
    .setDescription('Check your XP and rank up if eligible.'),

  async execute(interaction) {
    const dataPath = path.resolve(__dirname, '../../player_data.json');

    let playerData;
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      playerData = raw.trim() ? JSON.parse(raw) : {};
    } catch (error) {
      await interaction.reply({ content: 'Could not load player data.', ephemeral: true });
      return;
    }

    const userId = interaction.user.id;

    // Initialize base user profile if missing
    if (!playerData[userId]) {
      playerData[userId] = { activeIndex: 0, characters: [] };
    }

    // Convert legacy single-character format to array profile on the fly if needed
    if (playerData[userId].name && !playerData[userId].characters) {
      const legacyCharacter = { ...playerData[userId] };
      playerData[userId] = {
        activeIndex: 0,
        characters: [legacyCharacter]
      };
    }

    if (!playerData[userId].characters || playerData[userId].characters.length === 0) {
      await interaction.reply({ content: 'No valid player data found for you. Create a specialist first.', ephemeral: true });
      return;
    }

    // Target the currently active character object
    const player = playerData[userId].characters[playerData[userId].activeIndex];

    if (!player || typeof player.rank !== 'number' || typeof player.xp !== 'number') {
      await interaction.reply({ content: 'No valid active character data found for you.', ephemeral: true });
      return;
    }

    const requiredXp = player.rank * 10;
    if (player.xp < requiredXp) {
      await interaction.reply({ content: `Your active specialist (**${player.name}**) needs ${requiredXp} XP to rank up, but only has ${player.xp} XP.`, ephemeral: true });
      return;
    }

    // Deduct and increment stats from the nested active character object boundary
    player.xp -= requiredXp;
    player.rank += 1;

    try {
      fs.writeFileSync(dataPath, JSON.stringify(playerData, null, 2), 'utf8');
    } catch (error) {
      await interaction.reply({ content: 'Could not save updated player data.', ephemeral: true });
      return;
    }

    // send interactive buttons for bonus selection
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rank_extra_capacity').setLabel('Extra Capacity').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rank_choose_perk').setLabel('Choose Perk').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rank_add_tag').setLabel('Add Tag').setStyle(ButtonStyle.Secondary),
    );

    // CHANGED: Added ephemeral: true here
    await interaction.reply({ 
      content: `Rank up successful for **${player.name}**! Choose one bonus.`, 
      components: [row], 
      ephemeral: true 
    });

    const filter = i => i.user.id === interaction.user.id;
    // CHANGED: Targeted interaction directly instead of the 'sent' message variable
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      await i.deferUpdate();
      
      // Reload fresh data to prevent race conditions or overwrites
      let pd = {};
      try {
        const raw = fs.readFileSync(dataPath, 'utf8');
        pd = raw.trim() ? JSON.parse(raw) : {};
      } catch (err) {
        await i.followUp({ content: 'Could not load player data.', ephemeral: true });
        collector.stop();
        return;
      }
      
      if (!pd[userId] || !pd[userId].characters || pd[userId].characters.length === 0) {
        await i.followUp({ content: 'Character tracking profile not found.', ephemeral: true });
        collector.stop();
        return;
      }

      // Re-establish active character target assignment reference on reload
      const activeChar = pd[userId].characters[pd[userId].activeIndex];

      if (i.customId === 'rank_extra_capacity') {
        activeChar.capacity = (activeChar.capacity || 6) + 1;
        try {
          fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
          await i.followUp({ content: `**${activeChar.name}**'s capacity increased by 1. New capacity: ${activeChar.capacity}`, ephemeral: false });
        } catch (err) {
          await i.followUp({ content: 'Failed to save updated capacity.', ephemeral: true });
        }
        collector.stop();
        return;
      }

      if (i.customId === 'rank_choose_perk') {
        try {
          const starnetPath = path.resolve(__dirname, '../../starnet.json');
          const raw = fs.readFileSync(starnetPath, 'utf8');
          const starnet = raw.trim() ? JSON.parse(raw) : {};
          const perks = starnet.perks || {};
          
          // exclude perks the player already has on this specific character
          const ownedList = (activeChar.perks || []).map(p => {
            if (!p) return '';
            if (typeof p === 'string') return p;
            return (p.key || p.name || '').toString();
          }).filter(Boolean);

          const availableKeys = Object.keys(perks).filter(k => !ownedList.includes(k.toString())).slice(0, 25);
          const options = availableKeys.map(key => ({ label: key, value: key }));
          if (options.length === 0) {
            await i.followUp({ content: 'No perks available to choose (you already have them).', ephemeral: true });
            collector.stop();
            return;
          }

          const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_perk')
              .setPlaceholder('Choose a perk')
              .addOptions(options)
          );

          const menuMsg = await interaction.followUp({ content: 'Select a perk from the list:', components: [menu], ephemeral: true, fetchReply: true });

          const menuFilter = sel => sel.user.id === interaction.user.id && sel.customId === 'select_perk';
          const menuCollector = menuMsg.createMessageComponentCollector({ filter: menuFilter, max: 1, time: 60000 });
          menuCollector.on('collect', async sel => {
            const chosen = sel.values[0];
            
            // Reload database snapshot right before array assignment injection to stay synchronized
            try {
              const insideRaw = fs.readFileSync(dataPath, 'utf8');
              pd = insideRaw.trim() ? JSON.parse(insideRaw) : {};
            } catch(e) {}
            
            const nestedActiveChar = pd[userId].characters[pd[userId].activeIndex];
            nestedActiveChar.perks = nestedActiveChar.perks || [];
            
            const perkObj = (perks[chosen] || {});
            const fullPerk = { key: chosen, ...perkObj };
            nestedActiveChar.perks.push(fullPerk);

            // If the chosen perk is STRONG (by name, key, type, or tags), grant +3 capacity
            const isStrong = (() => {
              try {
                if (!chosen) return false;
                if (chosen.toString().toUpperCase() === 'STRONG') return true;
                if (typeof perkObj.name === 'string' && perkObj.name.toUpperCase() === 'STRONG') return true;
                if (typeof perkObj.key === 'string' && perkObj.key.toUpperCase() === 'STRONG') return true;
                if (typeof perkObj.type === 'string' && perkObj.type.toUpperCase() === 'STRONG') return true;
                if (Array.isArray(perkObj.tags) && perkObj.tags.some(t => String(t).toUpperCase() === 'STRONG')) return true;
              } catch (e) {
                return false;
              }
              return false;
            })();

            if (isStrong) {
              nestedActiveChar.capacity = (nestedActiveChar.capacity || 6) + 3;
            }

            try {
              fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
              await sel.reply({ content: `__${chosen}__ added to **${nestedActiveChar.name}**'s __perks__.`, ephemeral: false });
            } catch (err) {
              await sel.reply({ content: 'Failed to save selected perk.', ephemeral: true });
            }
            menuCollector.stop();
            collector.stop();
          });
        } catch (err) {
          await i.followUp({ content: 'Failed to load perks.', ephemeral: true });
          collector.stop();
        }
        return;
      }

      if (i.customId === 'rank_add_tag') {
  await i.followUp({ content: 'Type the new tag in chat within 30 seconds (single word).', ephemeral: true });
  const maxAttempts = 3;
  let added = false;
  
  for (let attempt = 0; attempt < maxAttempts && !added; attempt++) {
    try {
      const collected = await interaction.channel.awaitMessages({ 
        filter: m => m.author.id === interaction.user.id, 
        max: 1, 
        time: 30000, 
        errors: ['time'] 
      });
      
      const userMsg = collected.first();
      const candidate = userMsg.content.trim();
      
      if (!candidate) {
        await i.followUp({ content: 'Empty tag entered. Please enter a single word (no spaces).', ephemeral: true });
        continue;
      }
      
      if (/\s/.test(candidate)) {
        if (attempt < maxAttempts - 1) {
          try { await userMsg.delete(); } catch(e) {}
          await i.followUp({ content: 'Please enter a single word with no spaces. Try again.', ephemeral: true });
          continue;
        } else {
          await i.followUp({ content: 'No valid single-word tag entered in time.', ephemeral: true });
          break;
        }
      }
      
      // Reload and inject into the active user character array instance
      try {
        const tagRaw = fs.readFileSync(dataPath, 'utf8');
        pd = tagRaw.trim() ? JSON.parse(tagRaw) : {};
      } catch(e) {}
      
      const tagActiveChar = pd[userId].characters[pd[userId].activeIndex];
      tagActiveChar.tags = tagActiveChar.tags || [];
      tagActiveChar.tags.push(candidate);
      fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
      
      try { await userMsg.delete(); } catch (e) {}
      
      // FIX: Verified backticks applied below
      await i.followUp({ content: `**${candidate}** added to **${tagActiveChar.name}** successfully.`, ephemeral: false });
      added = true;
      
    } catch (e) {
      await i.followUp({ content: 'Time ran out to provide a tag.', ephemeral: true });
      break;
    }
  }
  collector.stop();
  return;
}
          });
          },
          };