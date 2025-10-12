/**
 * Turso Database Client
 * Manages connection and queries to Turso (libSQL) database
 */

import { createClient } from '@libsql/client';
import { CONFIG } from '../config/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Initialize database connection
 * @returns {Promise<object>} Database client
 */
export async function initDatabase() {
  if (db) {
    return db;
  }

  try {
    db = createClient({
      url: CONFIG.database.url,
      authToken: CONFIG.database.authToken,
    });

    console.log('✓ Connected to Turso database');
    return db;
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Get database client instance
 * @returns {object} Database client
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Run database migrations (create tables)
 * @returns {Promise<void>}
 */
export async function runMigrations() {
  const db = getDatabase();
  const schemaPath = join(__dirname, 'schema.sql');

  try {
    const schema = readFileSync(schemaPath, 'utf8');

    // Remove comments and split by semicolons
    const statements = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))  // Remove comment lines
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${statements.length} migration statements...`);

    for (const statement of statements) {
      try {
        await db.execute(statement);
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists')) {
          throw err;
        }
      }
    }

    console.log('✓ Database migrations completed');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Get database statistics
 * @returns {Promise<object>} Statistics
 */
export async function getStats() {
  const db = getDatabase();

  const [
    { rows: [opportunitiesCount] },
    { rows: [postsCount] },
    { rows: [sourcesCount] },
    { rows: [geocodeCacheCount] },
    { rows: typeBreakdown },
    { rows: [postingStats] },
  ] = await Promise.all([
    db.execute('SELECT COUNT(*) as count FROM opportunities'),
    db.execute('SELECT COUNT(*) as count FROM posts'),
    db.execute('SELECT COUNT(*) as count FROM sources'),
    db.execute('SELECT COUNT(*) as count FROM geocode_cache'),
    db.execute(`
      SELECT type, COUNT(*) as count
      FROM opportunities
      GROUP BY type
    `),
    db.execute(`
      SELECT
        COUNT(DISTINCT o.id) as total,
        COUNT(DISTINCT p.opportunity_id) as posted
      FROM opportunities o
      LEFT JOIN posts p ON o.id = p.opportunity_id
    `),
  ]);

  return {
    opportunities: opportunitiesCount.count,
    posts: postsCount.count,
    sources: sourcesCount.count,
    geocodeCache: geocodeCacheCount.count,
    byType: Object.fromEntries(typeBreakdown.map(r => [r.type, r.count])),
    posted: postingStats.posted,
    unposted: postingStats.total - postingStats.posted,
  };
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
export async function closeDatabase() {
  if (db) {
    // libSQL doesn't require explicit close, but we'll set to null
    db = null;
    console.log('✓ Database connection closed');
  }
}

export default {
  init: initDatabase,
  get: getDatabase,
  runMigrations,
  getStats,
  close: closeDatabase,
};
