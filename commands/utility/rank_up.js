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
    const player = playerData[userId];

    if (!player || typeof player.rank !== 'number' || typeof player.xp !== 'number') {
      await interaction.reply({ content: 'No valid player data found for you.', ephemeral: true });
      return;
    }

    const requiredXp = player.rank * 10;
    if (player.xp < requiredXp) {
      await interaction.reply({ content: `You need ${requiredXp} XP to rank up, but you only have ${player.xp} XP.`, ephemeral: true });
      return;
    }

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

    const sent = await interaction.reply({ content: 'Rank up successful! Choose one bonus.', components: [row], fetchReply: true });

    const filter = i => i.user.id === interaction.user.id;
    const collector = sent.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
      await i.deferUpdate();
      // reload fresh data
      let pd = {};
      try {
        const raw = fs.readFileSync(dataPath, 'utf8');
        pd = raw.trim() ? JSON.parse(raw) : {};
      } catch (err) {
        await i.followUp({ content: 'Could not load player data.', ephemeral: true });
        collector.stop();
        return;
      }
      if (!pd[userId]) pd[userId] = {};

      if (i.customId === 'rank_extra_capacity') {
        pd[userId].capacity = (pd[userId].capacity || 6) + 1;
        try {
          fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
          await i.followUp({ content: `Capacity increased by 1. New capacity: ${pd[userId].capacity}`, ephemeral: true });
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
          // exclude perks the player already has
          const ownedList = (pd[userId].perks || []).map(p => {
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
            pd[userId].perks = pd[userId].perks || [];
            const perkObj = (perks[chosen] || {});
            const fullPerk = { key: chosen, ...perkObj };
            pd[userId].perks.push(fullPerk);

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
              pd[userId].capacity = (pd[userId].capacity || 6) + 3;
            }

            try {
              fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
              await sel.reply({ content: `__${chosen}__ added to __perks__.`, ephemeral: true });
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
            const collected = await interaction.channel.awaitMessages({ filter: m => m.author.id === interaction.user.id, max: 1, time: 30000, errors: ['time'] });
            const userMsg = collected.first();
            const candidate = userMsg.content.trim();
            if (!candidate) {
              await i.followUp({ content: 'Empty tag entered. Please enter a single word (no spaces).', ephemeral: true });
              continue;
            }
            if (/\s/.test(candidate)) {
              if (attempt < maxAttempts - 1) {
                await userMsg.delete();
                await i.followUp({ content: 'Please enter a single word with no spaces. Try again.', ephemeral: true });
                continue;
              } else {
                await i.followUp({ content: 'No valid single-word tag entered in time.', ephemeral: true });
                break;
              }
            }
            const tag = candidate;
            pd[userId].tags = pd[userId].tags || [];
            pd[userId].tags.push(tag);
            fs.writeFileSync(dataPath, JSON.stringify(pd, null, 2), 'utf8');
            try {
              await userMsg.delete();
            } catch (e) {
              // ignore deletion errors (missing permissions, etc.)
            }
            await i.followUp({ content: `'${tag}' added to your tags.`, ephemeral: true });
            added = true;
            break;
          } catch (err) {
            await i.followUp({ content: 'No tag entered in time.', ephemeral: true });
            break;
          }
          
        }
        collector.stop();
        return;
      }
    });

    collector.on('end', () => {
      try { sent.edit({ components: [] }).catch(() => {}); } catch (e) {}
    });
  },
};
