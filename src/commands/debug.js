/**
 * Debug command to check system status
 * Shows configuration, database stats, and API connectivity
 */

import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/index.js';
import { getDatabase } from '../database/client.js';
import { getStats } from '../database/queries.js';
import { checkCommandChannel } from '../utils/channel-check.js';

export const data = new SlashCommandBuilder()
  .setName('debug')
  .setDescription('Show system debug information');

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

  try {
    const db = getDatabase();

    // Get database stats
    const dbStats = await getStats(db);

    // Check configuration
    const configStatus = {
      discord: !!CONFIG.discord.token && !!CONFIG.discord.clientId,
      database: !!CONFIG.database.url && !!CONFIG.database.authToken,
      digestChannel: !!CONFIG.discord.digestChannelId,
      userEmail: !!CONFIG.userEmail,
      usajobs: !!CONFIG.usajobs.apiKey,
    };

    // Count watchlist companies
    const watchlistCount = {
      greenhouse: CONFIG.watchlist?.greenhouse?.length || 0,
      lever: CONFIG.watchlist?.lever?.length || 0,
      ashby: CONFIG.watchlist?.ashby?.length || 0,
    };

    const response = [
      '🔍 **System Debug Information**',
      '',
      '**Configuration Status:**',
      `${configStatus.discord ? '✅' : '❌'} Discord API`,
      `${configStatus.database ? '✅' : '❌'} Turso Database`,
      `${configStatus.digestChannel ? '✅' : '⚠️'} Digest Channel (${CONFIG.discord.digestChannelId || 'not set'})`,
      `${configStatus.userEmail ? '✅' : '⚠️'} User Email`,
      `${configStatus.usajobs ? '✅' : '⚠️'} USAJOBS API`,
      '',
      '**Watchlist:**',
      `• Greenhouse: ${watchlistCount.greenhouse} companies`,
      `• Lever: ${watchlistCount.lever} companies`,
      `• Ashby: ${watchlistCount.ashby} companies`,
      '',
      '**Database Statistics:**',
      `• Total Opportunities: ${dbStats.totalOpportunities}`,
      `• Posted: ${dbStats.posted}`,
      `• Unposted: ${dbStats.unposted}`,
      `• California: ${dbStats.california}`,
      `• Last Fetch: ${dbStats.lastFetch || 'Never'}`,
      '',
      '**Scheduler:**',
      `• Cron: ${CONFIG.scheduler.realtimeCron}`,
      `• Timezone: America/Los_Angeles (PST/PDT)`,
      '',
      '**SMC Location:**',
      `• Lat: ${CONFIG.smc.latitude}`,
      `• Lon: ${CONFIG.smc.longitude}`,
      '',
      '**Rate Limits:**',
      `• Default: ${CONFIG.rateLimits.defaultDelay}ms`,
      `• Geocoding: ${CONFIG.rateLimits.geocodingDelay}ms`,
    ].join('\n');

    await interaction.editReply(response);

  } catch (error) {
    logger.error('Debug command failed', {
      error: error.message,
      stack: error.stack,
    });

    await interaction.editReply({
      content: `❌ **Debug Failed**\n\nError: ${error.message}`,
    });
  }
}
