/**
 * Scheduler for periodic tasks
 * Real-time watcher only - no digest job
 */

import cron from 'node-cron';
import { CONFIG } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { runRealtimeWatcher } from './realtime-watcher.js';
import { getDatabase } from '../database/client.js';

/**
 * Start all scheduled tasks
 * @param {Client} client - Discord client
 */
export function startScheduler(client) {
  // Schedule real-time GitHub watcher (every 15 minutes)
  const realtimeTask = cron.schedule(
    CONFIG.scheduler.realtimeCron,
    async () => {
      logger.info('[CRON] Real-time watcher triggered');
      try {
        const db = getDatabase();
        const result = await runRealtimeWatcher(db, client);

        if (result.success) {
          if (result.stats.posted > 0) {
            logger.info('[CRON] Real-time watcher posted new opportunities', {
              stats: result.stats,
            });
          } else {
            logger.debug('[CRON] Real-time watcher found no new opportunities');
          }
        } else {
          logger.warn('[CRON] Real-time watcher completed with issues', {
            stats: result.stats,
            message: result.message,
          });
        }
      } catch (error) {
        logger.error('[CRON] Real-time watcher failed', {
          error: error.message,
          stack: error.stack,
        });
      }
    },
    {
      scheduled: true,
      timezone: 'America/Los_Angeles', // PST/PDT
    }
  );

  logger.info('✓ Real-time watcher scheduled', { cron: CONFIG.scheduler.realtimeCron });

  return {
    realtimeTask,
  };
}

