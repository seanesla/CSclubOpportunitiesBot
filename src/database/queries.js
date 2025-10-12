/**
 * Database query functions for opportunities, posts, and caching
 */

import { logger } from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Generate opportunity ID from source and source_id
 * @param {string} source - Source type (e.g., 'github-crowdsource')
 * @param {string} sourceId - Source-specific ID
 * @returns {string} Safe, collision-resistant ID
 */
export function generateOpportunityId(source, sourceId) {
  // Sanitize source_id to remove any control characters that could cause collisions
  const sanitizedSourceId = sourceId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  // Use ::: as delimiter (unlikely to appear in source names)
  return `${source}:::${sanitizedSourceId}`;
}

/**
 * Generate deduplication hash for an opportunity
 * @param {object} opportunity - Opportunity object
 * @returns {string} SHA-256 hash
 */
export function generateHash(opportunity) {
  const { title, company, location_text } = opportunity;
  const normalized = `${company}|${normalizeTitle(title)}|${normalizeLocation(location_text)}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Normalize title for deduplication
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/intern(ship)?|co-op|summer|fall|spring|winter|2024|2025|2026/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize location for deduplication
 * @param {string} location
 * @returns {string}
 */
function normalizeLocation(location) {
  return (location || '')
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .trim();
}

/**
 * Insert or update an opportunity
 * @param {object} db - Database client
 * @param {object} opportunity - Opportunity object
 * @returns {Promise<string>} Opportunity ID
 */
export async function upsertOpportunity(db, opportunity) {
  // Generate hash if not provided
  if (!opportunity.hash) {
    opportunity.hash = generateHash(opportunity);
  }

  // Generate ID if not provided using shared function
  const id = opportunity.id || generateOpportunityId(opportunity.source, opportunity.source_id);

  // Convert skills array to JSON string
  const skillsJson = Array.isArray(opportunity.skills)
    ? JSON.stringify(opportunity.skills)
    : opportunity.skills;

  try {
    const now = new Date().toISOString();

    // Step 1: Check for exact match by source+source_id (legitimate refresh/update)
    const exactMatch = await db.execute({
      sql: `SELECT id, first_seen, source_id FROM opportunities
            WHERE source = ? AND source_id = ?
            LIMIT 1`,
      args: [opportunity.source, opportunity.source_id],
    });

    if (exactMatch.rows.length > 0) {
      // Exact match - update existing opportunity
      const existingId = exactMatch.rows[0].id;
      const firstSeen = exactMatch.rows[0].first_seen;

      await db.execute({
        sql: `UPDATE opportunities SET
          title = ?, company = ?, type = ?, workplace_type = ?,
          location_text = ?, lat = ?, lon = ?, distance_km = ?, is_california = ?,
          url = ?, deadline = ?, posted_at = ?,
          description_raw = ?, description_preview = ?, skills = ?, compensation = ?,
          cc_friendly = ?, cc_exclusion_reason = ?,
          last_seen = ?, hash = ?, score = ?
          WHERE id = ?`,
        args: [
          opportunity.title,
          opportunity.company,
          opportunity.type,
          opportunity.workplace_type,
          opportunity.location_text,
          opportunity.lat,
          opportunity.lon,
          opportunity.distance_km,
          opportunity.is_california ? 1 : 0,
          opportunity.url,
          opportunity.deadline,
          opportunity.posted_at,
          opportunity.description_raw,
          opportunity.description_preview,
          skillsJson,
          opportunity.compensation,
          opportunity.cc_friendly ? 1 : 0,
          opportunity.cc_exclusion_reason,
          now,
          opportunity.hash,
          opportunity.score,
          existingId,
        ],
      });

      logger.debug(`Updated opportunity (exact match): ${existingId}`);
      return existingId;
    }

    // Step 2: Check for hash collision (same content, different source or source_id)
    const hashMatch = await db.execute({
      sql: `SELECT id, source, source_id FROM opportunities WHERE hash = ? LIMIT 1`,
      args: [opportunity.hash],
    });

    if (hashMatch.rows.length > 0) {
      const existingId = hashMatch.rows[0].id;
      const existingSource = hashMatch.rows[0].source;
      const existingSourceId = hashMatch.rows[0].source_id;

      // Check if same source but different source_id (GitHub data quality issue)
      if (existingSource === opportunity.source && existingSourceId !== opportunity.source_id) {
        // HASH COLLISION DETECTED - Same source, different UUID
        logger.warn('Hash collision detected - same source has duplicate UUIDs for identical content', {
          existingId,
          existingSourceId,
          newSourceId: opportunity.source_id,
          source: opportunity.source,
          title: opportunity.title,
          company: opportunity.company,
          hash: opportunity.hash,
        });

        // Return existing ID WITHOUT updating source_id (preserve first-seen UUID)
        // This prevents duplicate posts while maintaining data integrity
        return existingId;
      }

      // Different source with same hash - legitimate cross-source duplicate
      logger.info('Cross-source duplicate detected - preserving original data, updating last_seen only', {
        existingId,
        existingSource,
        newSource: opportunity.source,
        title: opportunity.title,
        company: opportunity.company,
      });

      // Update ONLY last_seen timestamp (preserve original source's data)
      // This prevents data corruption from overwriting URLs, descriptions, etc.
      await db.execute({
        sql: `UPDATE opportunities SET last_seen = ? WHERE id = ?`,
        args: [now, existingId],
      });

      logger.debug(`Updated last_seen for cross-source match: ${existingId}`);
      return existingId;
    }

    // Step 3: No match - insert new opportunity
    await db.execute({
      sql: `INSERT INTO opportunities (
        id, source, source_id, title, company, type, workplace_type,
        location_text, lat, lon, distance_km, is_california,
        url, deadline, posted_at,
        description_raw, description_preview, skills, compensation,
        cc_friendly, cc_exclusion_reason,
        first_seen, last_seen, hash, score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        opportunity.source,
        opportunity.source_id,
        opportunity.title,
        opportunity.company,
        opportunity.type,
        opportunity.workplace_type,
        opportunity.location_text,
        opportunity.lat,
        opportunity.lon,
        opportunity.distance_km,
        opportunity.is_california ? 1 : 0,
        opportunity.url,
        opportunity.deadline,
        opportunity.posted_at,
        opportunity.description_raw,
        opportunity.description_preview,
        skillsJson,
        opportunity.compensation,
        opportunity.cc_friendly ? 1 : 0,
        opportunity.cc_exclusion_reason,
        now,
        now,
        opportunity.hash,
        opportunity.score,
      ],
    });

    logger.debug(`Inserted new opportunity: ${id}`);
    return id;
  } catch (error) {
    logger.error('Failed to upsert opportunity', {
      opportunityId: id,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get opportunity by source and source_id
 * @param {object} db - Database client
 * @param {string} source - Source type
 * @param {string} sourceId - Source-specific ID
 * @returns {Promise<object|null>} Opportunity or null if not found
 */
export async function getOpportunityBySourceId(db, source, sourceId) {
  // Input validation
  if (!source || typeof source !== 'string') {
    throw new Error('source must be a non-empty string');
  }

  if (!sourceId || typeof sourceId !== 'string') {
    throw new Error('sourceId must be a non-empty string');
  }

  if (!db) {
    throw new Error('db client is required');
  }

  try {
    const result = await db.execute({
      sql: `SELECT * FROM opportunities WHERE source = ? AND source_id = ? LIMIT 1`,
      args: [source, sourceId],
    });

    if (result.rows.length > 0) {
      return parseOpportunityRow(result.rows[0]);
    }

    return null;
  } catch (error) {
    logger.error('Failed to get opportunity by source ID', {
      source,
      sourceId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get existing opportunities by source and source_ids (batch query to avoid N+1)
 * @param {object} db - Database client
 * @param {string} source - Source type
 * @param {Array<string>} sourceIds - Array of source-specific IDs
 * @returns {Promise<Map<string, object>>} Map of sourceId -> opportunity
 */
export async function getExistingOpportunitiesBySourceIds(db, source, sourceIds) {
  // Input validation
  if (!source || typeof source !== 'string') {
    throw new Error('source must be a non-empty string');
  }

  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new Error('sourceIds must be a non-empty array');
  }

  if (!db) {
    throw new Error('db client is required');
  }

  // Validate all sourceIds are strings
  if (!sourceIds.every(id => typeof id === 'string' && id.length > 0)) {
    throw new Error('all sourceIds must be non-empty strings');
  }

  try {
    // Build SQL with parameterized IN clause
    const placeholders = sourceIds.map(() => '?').join(',');
    const sql = `SELECT * FROM opportunities WHERE source = ? AND source_id IN (${placeholders})`;
    const args = [source, ...sourceIds];

    const result = await db.execute({ sql, args });

    // Convert to Map for O(1) lookup
    const existingMap = new Map();
    for (const row of result.rows) {
      const parsed = parseOpportunityRow(row);
      existingMap.set(row.source_id, parsed);
    }

    logger.debug(`Batch query found ${existingMap.size} existing opportunities out of ${sourceIds.length}`);

    return existingMap;
  } catch (error) {
    logger.error('Failed to get existing opportunities by source IDs', {
      source,
      sourceIdsCount: sourceIds.length,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get unposted opportunities ordered by score
 * @param {object} db - Database client
 * @param {number} limit - Maximum number to return
 * @returns {Promise<Array>} Array of opportunities
 */
export async function getUnpostedOpportunities(db, limit = 10) {
  try {
    const result = await db.execute({
      sql: `SELECT o.*
            FROM opportunities o
            LEFT JOIN posts p ON o.id = p.opportunity_id
            WHERE p.id IS NULL
              AND o.is_california = 1
              AND o.score > 0
            ORDER BY o.score DESC
            LIMIT ?`,
      args: [limit],
    });

    return result.rows.map(parseOpportunityRow);
  } catch (error) {
    logger.error('Failed to get unposted opportunities', { error: error.message });
    throw error;
  }
}

/**
 * Mark opportunity as posted
 * @param {object} db - Database client
 * @param {string} opportunityId - Opportunity ID
 * @param {string} discordMessageId - Discord message ID
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<void>}
 */
export async function markAsPosted(db, opportunityId, discordMessageId, channelId) {
  try {
    await db.execute({
      sql: `INSERT INTO posts (opportunity_id, discord_message_id, channel_id)
            VALUES (?, ?, ?)`,
      args: [opportunityId, discordMessageId, channelId],
    });

    logger.info(`Marked opportunity as posted: ${opportunityId}`);
  } catch (error) {
    // Handle UNIQUE constraint violation gracefully (duplicate post prevented by DB)
    if (error.message?.includes('UNIQUE constraint')) {
      logger.info(`Opportunity already posted (prevented by UNIQUE constraint): ${opportunityId}`, {
        channelId,
        discordMessageId,
      });
      return; // Not an error - database prevented duplicate
    }

    // Other errors are real failures
    logger.error('Failed to mark opportunity as posted', {
      opportunityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get opportunity statistics
 * @param {object} db - Database client
 * @returns {Promise<object>} Statistics object
 */
export async function getStats(db) {
  try {
    const [total, posted, unposted, california, lastFetch] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM opportunities'),
      db.execute('SELECT COUNT(DISTINCT opportunity_id) as count FROM posts'),
      db.execute(`
        SELECT COUNT(*) as count FROM opportunities o
        LEFT JOIN posts p ON o.id = p.opportunity_id
        WHERE p.id IS NULL
      `),
      db.execute('SELECT COUNT(*) as count FROM opportunities WHERE is_california = 1'),
      db.execute('SELECT MAX(last_fetched) as last FROM sources'),
    ]);

    return {
      totalOpportunities: total.rows[0].count,
      posted: posted.rows[0].count,
      unposted: unposted.rows[0].count,
      california: california.rows[0].count,
      lastFetch: lastFetch.rows[0].last,
    };
  } catch (error) {
    logger.error('Failed to get stats', { error: error.message });
    throw error;
  }
}

/**
 * Find duplicate opportunities by hash
 * @param {object} db - Database client
 * @param {string} hash - Opportunity hash
 * @returns {Promise<object|null>} Existing opportunity or null
 */
export async function findDuplicateByHash(db, hash) {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM opportunities WHERE hash = ? LIMIT 1',
      args: [hash],
    });

    if (result.rows.length > 0) {
      return parseOpportunityRow(result.rows[0]);
    }

    return null;
  } catch (error) {
    logger.error('Failed to find duplicate', { error: error.message });
    throw error;
  }
}

/**
 * Update source fetch record
 * @param {object} db - Database client
 * @param {string} sourceType - Source type (greenhouse, lever, etc.)
 * @param {string} sourceKey - Source key (company identifier)
 * @param {number} successCount - Number of opportunities found
 * @param {string|null} errorMessage - Error message if failed
 * @returns {Promise<void>}
 */
export async function updateSourceFetch(db, sourceType, sourceKey, successCount, errorMessage = null) {
  try {
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO sources (source_type, source_key, last_fetched, fetch_count, last_success_count, last_error)
            VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(source_type, source_key) DO UPDATE SET
              last_fetched = ?,
              fetch_count = fetch_count + 1,
              last_success_count = ?,
              last_error = ?`,
      args: [
        sourceType,
        sourceKey,
        now,
        successCount,
        errorMessage,
        now,
        successCount,
        errorMessage,
      ],
    });
  } catch (error) {
    logger.error('Failed to update source fetch record', {
      sourceType,
      sourceKey,
      error: error.message,
    });
    // Don't throw - this is non-critical
  }
}

/**
 * Clean up old opportunities
 * @param {object} db - Database client
 * @param {number} retentionDays - Number of days to retain
 * @returns {Promise<number>} Number of deleted opportunities
 */
export async function cleanupOldOpportunities(db, retentionDays = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    const result = await db.execute({
      sql: `DELETE FROM opportunities
            WHERE last_seen < ?
            AND id NOT IN (SELECT opportunity_id FROM posts)`,
      args: [cutoffIso],
    });

    const deleted = result.rowsAffected || 0;
    logger.info(`Cleaned up ${deleted} old opportunities (older than ${retentionDays} days)`);
    return deleted;
  } catch (error) {
    logger.error('Failed to cleanup old opportunities', { error: error.message });
    throw error;
  }
}

/**
 * Parse database row into opportunity object
 * @param {object} row - Database row
 * @returns {object} Parsed opportunity
 */
function parseOpportunityRow(row) {
  let skills = [];
  if (row.skills) {
    try {
      skills = JSON.parse(row.skills);
    } catch (error) {
      logger.warn('Failed to parse skills JSON', { skills: row.skills, error: error.message });
      skills = [];
    }
  }

  return {
    ...row,
    is_california: row.is_california === 1,
    cc_friendly: row.cc_friendly === 1,
    skills,
  };
}
