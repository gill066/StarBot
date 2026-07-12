const { MessageFlags } = require('discord.js');

async function replySafely(interaction, payload) {
  if (!interaction || typeof interaction.reply !== 'function') {
    return null;
  }

  let safePayload = payload;
  if (safePayload && typeof safePayload === 'object' && safePayload.ephemeral === true) {
    safePayload = {
      ...safePayload,
      flags: MessageFlags.Ephemeral,
    };
    delete safePayload.ephemeral;
  }

  try {
    if (interaction.replied || interaction.deferred) {
      if (typeof interaction.followUp === 'function') {
        return interaction.followUp(safePayload);
      }
    }

    return interaction.reply(safePayload);
  } catch (error) {
    if (error?.code === 40060 || error?.code === 10062) {
      return null;
    }
    throw error;
  }
}

module.exports = {
  replySafely,
};
