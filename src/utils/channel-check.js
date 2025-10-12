/**
 * Channel restriction utility
 * Ensures commands only work in allowed channels
 */

import { CONFIG } from '../config/index.js';

/**
 * Check if interaction is in the allowed commands channel
 * @param {Interaction} interaction - Discord interaction
 * @returns {Object} { allowed: boolean, message: string }
 */
export function checkCommandChannel(interaction) {
  const allowedChannelId = CONFIG.discord.commandsChannelId;

  // If no channel restriction configured, allow everywhere
  if (!allowedChannelId) {
    return { allowed: true };
  }

  // Check if current channel matches
  if (interaction.channelId === allowedChannelId) {
    return { allowed: true };
  }

  // Not in allowed channel
  return {
    allowed: false,
    message: `❌ This command can only be used in <#${allowedChannelId}>`,
  };
}
