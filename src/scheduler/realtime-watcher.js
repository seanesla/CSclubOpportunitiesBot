/**
 * Real-time watcher for GitHub crowdsourced repos
 * Polls every 15 minutes and posts new internships immediately
 */

import { logger } from '../utils/logger.js';
import { CONFIG } from '../config/index.js';
import { fetchFromGitHubRepos } from '../fetchers/github-repos.js';
import { geocodeWithCache } from '../processors/geocoder.js';
import { scoreOpportunities } from '../processors/scorer.js';
import {
  upsertOpportunity,
  getExistingOpportunitiesBySourceIds,
  markAsPosted,
  getUnpostedOpportunities,
} from '../database/queries.js';
import { createOpportunityEmbed } from '../discord/embeds.js';

/**
 * Send Discord message with retry logic for rate limiting
 * @param {object} channel - Discord channel
 * @param {object} messageOptions - Message options (embeds, content, etc.)
 * @param {number} attempt - Current attempt number
 * @returns {Promise<Message>} Sent message
 */
async function sendWithRetry(channel, messageOptions, attempt = 1) {
  const MAX_RETRIES = 3;
  const BASE_DELAY = 2000; // 2 seconds

  try {
    return await channel.send(messageOptions);
  } catch (error) {
    // Check if it's a rate limit error (429)
    // NOTE: 50013 is "Missing Permissions" - a permanent error, NOT a rate limit!
    if (error.status === 429 || error.message?.includes('rate limit')) {
      if (attempt >= MAX_RETRIES) {
        logger.error('Discord rate limit: max retries exceeded', {
          attempt,
          error: error.message,
        });
        throw error;
      }

      // Extract retry-after from error if available, otherwise use exponential backoff
      const retryAfter = error.retryAfter || (BASE_DELAY * Math.pow(2, attempt - 1));
      logger.warn(`Discord rate limited, retrying in ${retryAfter}ms`, {
        attempt,
        maxRetries: MAX_RETRIES,
      });

      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return sendWithRetry(channel, messageOptions, attempt + 1);
    }

    // Other errors: don't retry
    // Log detailed error information for debugging
    logger.error('Discord send error (not retrying)', {
      errorCode: error.code,
      errorStatus: error.status,
      errorMessage: error.message,
      httpStatus: error.httpStatus,
    });
    throw error;
  }
}

/**
 * Run real-time watcher job
 * Checks for new GitHub crowdsourced internships and posts immediately
 * @param {object} db - Database client
 * @param {object} discordClient - Discord client
 * @returns {Promise<object>} Job result
 */
export async function runRealtimeWatcher(db, discordClient) {
  logger.info('Running real-time GitHub watcher');

  const stats = {
    fetched: 0,
    new: 0,
    posted: 0,
    errors: 0,
  };

  try {
    // Fetch from GitHub repos
    const result = await fetchFromGitHubRepos();

    if (!result.success || !result.data) {
      logger.warn('Failed to fetch from GitHub repos');
      return { success: false, stats, message: 'Fetch failed' };
    }

    stats.fetched = result.data.length;
    logger.info(`Fetched ${stats.fetched} opportunities from GitHub repos`);

    // Check which ones are NEW (not in database yet) using batch query to avoid N+1
    const newOpportunities = [];

    if (result.data.length > 0) {
      try {
        // Batch query: get all existing opportunities in one SQL query
        const sourceIds = result.data.map(opp => opp.source_id);
        const source = result.data[0].source; // All opportunities have same source

        const existingMap = await getExistingOpportunitiesBySourceIds(db, source, sourceIds);

        // Filter to only NEW opportunities (not in database)
        for (const opp of result.data) {
          if (!existingMap.has(opp.source_id)) {
            // NEW internship!
            newOpportunities.push(opp);
          }
        }

        logger.debug(`Filtered ${newOpportunities.length} new opportunities out of ${result.data.length} total`);

      } catch (error) {
        logger.error('Error checking for existing opportunities', { error: error.message });
        stats.errors++;
        return { success: false, stats, message: 'Failed to check existing opportunities' };
      }
    }

    stats.new = newOpportunities.length;

    if (newOpportunities.length === 0) {
      logger.info('No new opportunities found');
      return { success: true, stats, message: 'No new opportunities' };
    }

    logger.info(`Found ${newOpportunities.length} NEW opportunities!`);

    // Geocode new opportunities
    // Note: Multi-location strings are now parsed before geocoding
    const geocoded = [];
    for (const opp of newOpportunities) {
      try {
        const geoResult = await geocodeWithCache(opp.location_text, db);

        if (geoResult) {
          opp.lat = geoResult.lat;
          opp.lon = geoResult.lon;
          opp.is_california = geoResult.is_california;
          opp.distance_km = geoResult.distance_km;
          geocoded.push(opp);
        } else {
          // Geocoding failed - log for investigation
          logger.warn(`Geocoding failed for "${opp.title}" at "${opp.location_text}"`);
        }
      } catch (error) {
        logger.error(`Geocoding exception for ${opp.title}`, { error: error.message });
      }
    }

    // Score opportunities
    const scored = scoreOpportunities(geocoded);

    // Save to database and capture the returned IDs
    // IMPORTANT: Check if returned ID already posted (handles hash collision duplicates)
    const savedOpportunities = [];
    for (const opp of scored) {
      try {
        const savedId = await upsertOpportunity(db, opp);
        opp.id = savedId; // Capture the ID for later use in markAsPosted

        // Check if this ID was already posted (handles same-source hash collisions)
        // When GitHub has duplicate UUIDs for same job, upsertOpportunity returns existing ID
        const alreadyPosted = await db.execute({
          sql: 'SELECT id FROM posts WHERE opportunity_id = ? LIMIT 1',
          args: [savedId],
        });

        if (alreadyPosted.rows.length > 0) {
          logger.info(`Skipping already-posted opportunity (hash collision): ${opp.title} at ${opp.company}`, {
            returnedId: savedId,
            sourceId: opp.source_id,
          });
          continue; // Skip - don't add to savedOpportunities
        }

        savedOpportunities.push(opp);
      } catch (error) {
        logger.error(`Failed to save opportunity: ${opp.title}`, { error: error.message });
        stats.errors++;
        // Don't add to savedOpportunities if save failed
      }
    }

    // Check total unposted opportunities across all runs (accumulation logic)
    const BATCH_SIZE = 10;

    logger.info(`Checking total unposted opportunities in database`);
    const allUnposted = await getUnpostedOpportunities(db, 100); // Get up to 100 unposted

    logger.info(`Total unposted opportunities: ${allUnposted.length}`);

    if (allUnposted.length < BATCH_SIZE) {
      logger.info(`Only ${allUnposted.length} unposted opportunities in database. Waiting until ${BATCH_SIZE} accumulate before posting.`);
      return {
        success: true,
        stats,
        message: `${allUnposted.length} unposted opportunities waiting (need ${BATCH_SIZE} to post)`,
      };
    }

    // We have enough! Post in batches of 10
    const channelId = CONFIG.discord.realtimeChannelId;

    if (!channelId) {
      logger.error('Discord realtime channel ID not configured (set REALTIME_CHANNEL_ID or DIGEST_CHANNEL_ID)');
      return { success: false, stats, message: 'No channel configured' };
    }

    logger.info(`Attempting to post to Discord channel: ${channelId}`);

    try {
      const channel = await discordClient.channels.fetch(channelId);

      if (!channel) {
        logger.error(`Discord channel not found: ${channelId}`);
        return { success: false, stats, message: 'Channel not found' };
      }

      // Process in batches of 10 (allUnposted is already sorted by score DESC)
      for (let i = 0; i < allUnposted.length; i += BATCH_SIZE) {
        const batch = allUnposted.slice(i, i + BATCH_SIZE);

        // Only post if we have exactly BATCH_SIZE opportunities
        if (batch.length < BATCH_SIZE) {
          logger.info(`Remaining ${batch.length} opportunities in batch (less than ${BATCH_SIZE}). Will wait for more to accumulate.`);
          break;
        }

        try {
          // Create embeds for the batch (Discord allows max 10 embeds per message)
          const embeds = batch.map(opp => createOpportunityEmbed(opp));

          // Create introductory text
          const content = `🎓 **${batch.length} New Internship Opportunities**\n\nSorted by relevance:`;

          // Send batch message with retry logic for rate limits
          const sentMessage = await sendWithRetry(channel, { content, embeds });

          // Mark all opportunities in batch as posted
          for (const opp of batch) {
            await markAsPosted(db, opp.id, sentMessage.id, channelId);
            stats.posted++;
          }

          logger.info(`Posted batch of ${batch.length} opportunities`, {
            messageId: sentMessage.id,
            companies: batch.map(o => o.company).join(', '),
          });

          // Rate limit: wait between batch posts
          await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimits.discordPostDelay));

        } catch (error) {
          logger.error(`Failed to post batch of opportunities`, { error: error.message });
          stats.errors++;
        }
      }

      logger.info(`Real-time watcher posted ${stats.posted} new opportunities in batches of ${BATCH_SIZE}`);

      return {
        success: true,
        stats,
        message: `Posted ${stats.posted} new opportunities in batches of ${BATCH_SIZE}`,
      };

    } catch (error) {
      logger.error('Failed to post to Discord', { error: error.message });
      return { success: false, stats, message: error.message };
    }

  } catch (error) {
    logger.error('Real-time watcher failed', { error: error.message, stack: error.stack });
    return {
      success: false,
      stats,
      message: error.message,
      error: error.stack,
    };
  }
}
