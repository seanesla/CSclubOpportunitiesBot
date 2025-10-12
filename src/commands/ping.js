/**
 * Ping command - Health check
 */

import { SlashCommandBuilder } from 'discord.js';
import { checkCommandChannel } from '../utils/channel-check.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check if the bot is responsive');

export async function execute(interaction) {
  // Check if command is used in allowed channel
  const channelCheck = checkCommandChannel(interaction);
  if (!channelCheck.allowed) {
    return interaction.reply({
      content: channelCheck.message,
      ephemeral: true,
    });
  }

  const sent = await interaction.reply({
    content: '🏓 Pinging...',
    fetchReply: true,
  });

  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(interaction.client.ws.ping);

  await interaction.editReply(
    `🏓 Pong!\n` +
    `📊 Roundtrip latency: ${latency}ms\n` +
    `💓 WebSocket heartbeat: ${apiLatency}ms`
  );
}
