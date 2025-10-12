/**
 * Discord embed formatter for opportunities
 * Formats opportunities as rich Discord embeds
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Create Discord embed for an opportunity
 * @param {object} opportunity - Opportunity object
 * @returns {EmbedBuilder} Discord embed
 */
export function createOpportunityEmbed(opportunity) {
  const embed = new EmbedBuilder()
    .setTitle(opportunity.title)
    .setURL(opportunity.url)
    .setColor(getEmbedColor(opportunity))
    .setDescription(opportunity.description_preview || 'No description available')
    .setTimestamp(opportunity.posted_at ? new Date(opportunity.posted_at) : new Date());

  // Company and location
  let locationText = opportunity.location_text || 'Location not specified';
  if (opportunity.distance_km) {
    const distanceMiles = Math.round(opportunity.distance_km * 0.621371);
    locationText += ` (${distanceMiles} miles from SMC)`;
  }

  embed.addFields(
    { name: 'Company', value: opportunity.company, inline: true },
    { name: 'Location', value: locationText, inline: true },
    { name: 'Type', value: formatType(opportunity), inline: true }
  );

  // Skills (if any)
  if (opportunity.skills && opportunity.skills.length > 0) {
    const skillsText = opportunity.skills.slice(0, 10).join(', ');
    embed.addFields({
      name: 'Skills',
      value: skillsText.length > 1024 ? skillsText.slice(0, 1021) + '...' : skillsText,
      inline: false,
    });
  }

  // Compensation (if available)
  if (opportunity.compensation) {
    embed.addFields({
      name: 'Compensation',
      value: opportunity.compensation,
      inline: true,
    });
  }

  // CC-friendly indicator
  if (opportunity.cc_friendly) {
    embed.addFields({
      name: '✅ Community College Friendly',
      value: 'No 4-year degree requirement mentioned',
      inline: false,
    });
  } else if (opportunity.cc_exclusion_reason) {
    embed.addFields({
      name: '⚠️ Requirements',
      value: opportunity.cc_exclusion_reason,
      inline: false,
    });
  }

  // Footer with score
  if (opportunity.score) {
    embed.setFooter({ text: `Score: ${opportunity.score}/100 • ${opportunity.source}` });
  } else {
    embed.setFooter({ text: opportunity.source });
  }

  return embed;
}

/**
 * Get embed color based on opportunity type and score
 * @param {object} opportunity
 * @returns {number} Color hex code
 */
function getEmbedColor(opportunity) {
  // High score: Green
  if (opportunity.score >= 80) {
    return 0x00ff00; // Bright green
  }

  // Medium-high score: Blue
  if (opportunity.score >= 60) {
    return 0x0099ff; // Blue
  }

  // Medium score: Yellow
  if (opportunity.score >= 40) {
    return 0xffaa00; // Orange/yellow
  }

  // Low score: Gray
  return 0x888888; // Gray
}

/**
 * Format opportunity type for display
 * @param {object} opportunity
 * @returns {string}
 */
function formatType(opportunity) {
  const type = opportunity.type || 'Unknown';
  const workplaceType = opportunity.workplace_type || '';

  if (workplaceType === 'remote') {
    return `${capitalize(type)} (Remote)`;
  } else if (workplaceType === 'hybrid') {
    return `${capitalize(type)} (Hybrid)`;
  } else {
    return capitalize(type);
  }
}

/**
 * Capitalize first letter
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

