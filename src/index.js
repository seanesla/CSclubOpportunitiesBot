/**
 * SMC CS Opportunities Bot
 * Main entry point
 */

import { CONFIG, validateConfig } from './config/index.js';
import { initDatabase, runMigrations } from './database/client.js';
import { initBot } from './bot/client.js';
import { startScheduler } from './scheduler/index.js';
import { logger } from './utils/logger.js';

/**
 * Graceful shutdown handler
 */
function setupShutdownHandlers(client) {
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    try {
      if (client) {
        client.destroy();
        logger.info('Discord client destroyed');
      }

      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Main application entry point
 */
async function main() {
  try {
    logger.info('='.repeat(60));
    logger.info('SMC CS Opportunities Bot');
    logger.info('Starting up...');
    logger.info('='.repeat(60));

    // 1. Validate configuration
    logger.info('[1/5] Validating configuration...');
    validateConfig();
    logger.info(`Environment: ${CONFIG.bot.env}`);
    logger.info(`Log level: ${CONFIG.bot.logLevel}`);

    // 2. Initialize database
    logger.info('[2/5] Initializing database...');
    await initDatabase();

    // 3. Run migrations
    logger.info('[3/5] Running database migrations...');
    await runMigrations();

    // 4. Initialize Discord bot
    logger.info('[4/5] Initializing Discord bot...');
    const client = await initBot();

    // 5. Start scheduler (real-time watcher only)
    logger.info('[5/5] Starting scheduler...');
    startScheduler(client);
    logger.info(`Real-time watcher scheduled: ${CONFIG.scheduler.realtimeCron}`);

    // Setup graceful shutdown
    setupShutdownHandlers(client);

    logger.info('='.repeat(60));
    logger.info('Bot is fully operational!');
    logger.info('='.repeat(60));
    logger.info(`Logged in as: ${client.user.tag}`);
    logger.info(`Guilds: ${client.guilds.cache.size}`);
    logger.info(`Commands loaded: ${client.commands.size}`);

  } catch (error) {
    logger.error('Fatal error during startup', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Start the bot
main();
