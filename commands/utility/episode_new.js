const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  ActionRowBuilder, 
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('episode_new')
    .setDescription('Set up a new episode for this channel.'),

  async execute(interaction) {
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const channelId = interaction.channelId;

    // 1. Build the confirmation buttons
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('sr_btn_confirm')
        .setLabel('Yes, Proceed')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('sr_btn_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    // Serve the ephemeral confirmation screen
    const initialResponse = await interaction.reply({
      content: 'This will overwrite any existing Episode information - are you sure?',
      components: [confirmRow],
      ephemeral: true
    });

    // 2. Set up a collector for the confirmation buttons
    const btnCollector = initialResponse.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 1 minute to make a choice
    });

    btnCollector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: 'This confirmation prompt belongs to someone else.', ephemeral: true });
        return;
      }

      // Handle Cancel option
      if (btnInteraction.customId === 'sr_btn_cancel') {
        await btnInteraction.update({
          content: '❌ Setup cancelled. Existing episode data was preserved.',
          components: []
        });
        btnCollector.stop();
        return;
      }

      // Handle Confirm option -> Build and show the modal
      if (btnInteraction.customId === 'sr_btn_confirm') {
        btnCollector.stop(); // Stop listening for button actions

        const modal = new ModalBuilder()
          .setCustomId('showrunner_modal')
          .setTitle('Showrunner Setup');

        const questionInput = new TextInputBuilder()
          .setCustomId('sr_question')
          .setLabel("The Episode's QUESTION")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const peopleInput = new TextInputBuilder()
          .setCustomId('sr_people')
          .setLabel('PEOPLE (separated by commas)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. Alice, Bob, The Blacksmith')
          .setRequired(false);

        const placesInput = new TextInputBuilder()
          .setCustomId('sr_places')
          .setLabel('PLACES (separated by commas)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. The Citadel, Overgrown Tavern, Sector 7')
          .setRequired(false);

        const thingsInput = new TextInputBuilder()
          .setCustomId('sr_things')
          .setLabel('THINGS (separated by commas)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. Plasma Rifle, Ancient Map, Glowing Orb')
          .setRequired(false);

        const ideasInput = new TextInputBuilder()
          .setCustomId('sr_ideas')
          .setLabel('IDEAS (separated by commas)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('e.g. Betrayal, Cosmic Dread, Cyberpunk Aesthetics')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(questionInput),
          new ActionRowBuilder().addComponents(peopleInput),
          new ActionRowBuilder().addComponents(placesInput),
          new ActionRowBuilder().addComponents(thingsInput),
          new ActionRowBuilder().addComponents(ideasInput)
        );

        // Pass the modal payload directly to the button interaction token lifecycle
        await btnInteraction.showModal(modal);

        // 3. Collect and parse the modal answers
        try {
          const submission = await btnInteraction.awaitModalSubmit({
            filter: (i) => i.customId === 'showrunner_modal' && i.user.id === interaction.user.id,
            time: 300000 // 5 minutes to fill out the text boxes
          });

          const parseList = (inputString) => {
            if (!inputString) return [];
            return inputString
              .split(',')
              .map(item => item.trim())
              .filter(item => item.length > 0);
          };

          const question = submission.fields.getTextInputValue('sr_question');
          const people = parseList(submission.fields.getTextInputValue('sr_people'));
          const places = parseList(submission.fields.getTextInputValue('sr_places'));
          const things = parseList(submission.fields.getTextInputValue('sr_things'));
          const ideas = parseList(submission.fields.getTextInputValue('sr_ideas'));

          let db = {};
          try {
            if (fs.existsSync(dataPath)) {
              const raw = fs.readFileSync(dataPath, 'utf8');
              db = raw.trim() ? JSON.parse(raw) : {};
            }
          } catch (e) {
            db = {};
          }

          // Overwrite the specific channel configuration context block completely
          db[channelId] = {
            question,
            people,
            places,
            things,
            ideas,
            userId: submission.user.id, // Stores the exact Discord User ID snowflake
            updatedBy: submission.user.tag,
            timestamp: new Date().toISOString()
          };

          fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');

          // Clean up the initial button window text view out of the player history panel
          await interaction.editReply({
            content: '💥 Existing episode information overwritten.',
            components: []
          }).catch(() => {});

          // Final verification report back to the orchestrator user reading contents instead of length
          await submission.reply({
            content: `Episode information set: \n Question: "${question}"\nPeople: ${people.join(', ') || 'None'}\nPlaces: ${places.join(', ') || 'None'}\nThings: ${things.join(', ') || 'None'}\nIdeas: ${ideas.join(', ') || 'None'}`,
            ephemeral: true
          });

        } catch (err) {
          if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
            console.log('Showrunner modal entry timed out.');
            await interaction.editReply({
              content: '⏳ Setup timed out while waiting for modal inputs.',
              components: []
            }).catch(() => {});
          } else {
            console.error('An error occurred during showrunner collection:', err);
          }
        }
      }
    });

    btnCollector.on('end', async (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        await interaction.editReply({
          content: '⏳ Confirmation window timed out without changes.',
          components: []
        }).catch(() => {});
      }
    });
  }
};
