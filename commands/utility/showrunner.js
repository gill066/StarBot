const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  ActionRowBuilder, 
  TextInputStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('showrunner')
    .setDescription('Set up the showrunner prompt details for this channel.'),

  async execute(interaction) {
    const dataPath = path.join(__dirname, '..', '..', 'showrunner_data.json');
    const channelId = interaction.channelId;

    // 1. Build the Modal
    const modal = new ModalBuilder()
      .setCustomId('showrunner_modal')
      .setTitle('Showrunner Setup');

    // 2. Define the 5 inputs (Max allowed by Discord)
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

    // Modals require each input component to live in its own unique Action Row
    modal.addComponents(
      new ActionRowBuilder().addComponents(questionInput),
      new ActionRowBuilder().addComponents(peopleInput),
      new ActionRowBuilder().addComponents(placesInput),
      new ActionRowBuilder().addComponents(thingsInput),
      new ActionRowBuilder().addComponents(ideasInput)
    );

    // Present the modal to the user
    await interaction.showModal(modal);

    // 3. Collect and process the submitted modal data
    try {
      const submission = await interaction.awaitModalSubmit({
        filter: (i) => i.customId === 'showrunner_modal' && i.user.id === interaction.user.id,
        time: 300000 // 5 minutes to fill out
      });

      // Helper function to split by comma, trim spaces, and strip empty strings
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

      // Read current DB file safely
      let db = {};
      try {
        if (fs.existsSync(dataPath)) {
          const raw = fs.readFileSync(dataPath, 'utf8');
          db = raw.trim() ? JSON.parse(raw) : {};
        }
      } catch (e) {
        db = {};
      }

      // Overwrite the existing entry for this specific channel ID
      db[channelId] = {
        question,
        people,
        places,
        things,
        ideas,
        updatedBy: submission.user.tag,
        timestamp: new Date().toISOString()
      };

      // Save database structural adjustments back to disk
      fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');

      // Send ephemeral confirmation
      await submission.reply({
        content: `Episode set\n* Question: "${question}"\n* Tracked components: ${people.length} People, ${places.length} Places, ${things.length} Things, ${ideas.length} Ideas.`,
        ephemeral: true
      });

    } catch (err) {
      // Catch layout framework execution issues or processing timeouts safely
      if (err.code === 'INTERACTION_COLLECTOR_ERROR') {
        console.log('Showrunner modal entry timed out.');
      } else {
        console.error('An error occurred during showrunner collection:', err);
      }
    }
  }
};