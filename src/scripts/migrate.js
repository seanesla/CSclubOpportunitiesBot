/**
 * Run database migrations
 * Creates all necessary tables in Turso
 */

import { initDatabase, runMigrations } from '../database/client.js';

async function migrate() {
  try {
    console.log('Initializing database connection...');
    await initDatabase();

    console.log('Running migrations...');
    await runMigrations();

    console.log('\n✓ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
