async function replySafely(interaction, payload) {
  if (!interaction || typeof interaction.reply !== 'function') {
    return null;
  }

  if (interaction.replied || interaction.deferred) {
    if (typeof interaction.followUp === 'function') {
      return interaction.followUp(payload);
    }
  }

  return interaction.reply(payload);
}

module.exports = {
  replySafely,
};
