/**
 * Stats command - Show bot statistics
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStats } from '../database/client.js';
import { checkCommandChannel } from '../utils/channel-check.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Show bot statistics and database info');

export async function execute(interaction) {
  // Check if command is used in allowed channel
  const channelCheck = checkCommandChannel(interaction);
  if (!channelCheck.allowed) {
    return interaction.reply({
      content: channelCheck.message,
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  try {
    const stats = await getStats();

    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('📊 SMC CS Opportunities Bot Statistics')
      .addFields(
        {
          name: '💼 Total Opportunities',
          value: stats.opportunities.toString(),
          inline: true,
        },
        {
          name: '📬 Posted',
          value: stats.posted.toString(),
          inline: true,
        },
        {
          name: '🆕 Unposted',
          value: stats.unposted.toString(),
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
        },
        {
          name: '📁 By Type',
          value: Object.entries(stats.byType)
            .map(([type, count]) => `• ${type}: ${count}`)
            .join('\n') || 'No data yet',
          inline: false,
        },
        {
          name: '🗄️ Cache & Tracking',
          value:
            `• Geocode cache: ${stats.geocodeCache} locations\n` +
            `• API sources: ${stats.sources} tracked`,
          inline: false,
        }
      )
      .setFooter({
        text: 'Bot running on Oracle Cloud + Turso',
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error fetching stats:', error);
    await interaction.editReply({
      content: '❌ Error fetching statistics. Check logs.',
      ephemeral: true,
    });
  }
}
