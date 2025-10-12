/**
 * Test command to manually trigger the real-time watcher
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { runRealtimeWatcher } from '../scheduler/realtime-watcher.js';
import { getDatabase } from '../database/client.js';
import { checkCommandChannel } from '../utils/channel-check.js';

export const data = new SlashCommandBuilder()
  .setName('test-realtime')
  .setDescription('Manually check for new GitHub crowdsourced internships');
  // No permission restrictions - anyone can use this for testing

export async function execute(interaction) {
  // Check if command is used in allowed channel
  const channelCheck = checkCommandChannel(interaction);
  if (!channelCheck.allowed) {
    return interaction.reply({
      content: channelCheck.message,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  logger.info('Manual real-time watcher triggered', { user: interaction.user.tag });

  const db = getDatabase();
  const result = await runRealtimeWatcher(db, interaction.client);

  if (result.success) {
    const response = [
      '✅ **Real-time Watcher Completed**',
      '',
      '**Statistics:**',
      `• Fetched: ${result.stats.fetched} opportunities from GitHub repos`,
      `• New: ${result.stats.new} (not in database yet)`,
      `• Posted: ${result.stats.posted} to Discord`,
      `• Errors: ${result.stats.errors}`,
    ].join('\n');

    await interaction.editReply(response);
  } else {
    await interaction.editReply(
      `❌ **Real-time Watcher Failed**\n\n${result.message || 'Unknown error'}`
    );
  }
}
