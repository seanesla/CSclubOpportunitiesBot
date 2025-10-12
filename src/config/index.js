/**
 * Configuration loader for SMC CS Opportunities Bot
 * Loads configuration from environment variables and YAML files
 */

import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

/**
 * Load YAML configuration file
 * @param {string} filename
 * @returns {object}
 */
function loadYaml(filename) {
  try {
    const filePath = join(projectRoot, 'config', filename);
    const fileContents = readFileSync(filePath, 'utf8');
    return parse(fileContents);
  } catch (error) {
    console.warn(`Warning: Could not load ${filename}:`, error.message);
    return {};
  }
}

// Load YAML configurations
const sourcesConfig = loadYaml('sources.yaml');
const watchlistConfig = loadYaml('watchlist.yaml');
const prestigeConfig = loadYaml('prestige_hackathons.yaml');

/**
 * Bot configuration object
 */
export const CONFIG = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID, // Optional: for guild-specific commands
    digestChannelId: process.env.DIGEST_CHANNEL_ID,
    realtimeChannelId: process.env.REALTIME_CHANNEL_ID || process.env.DIGEST_CHANNEL_ID, // Defaults to digest channel
    commandsChannelId: process.env.COMMANDS_CHANNEL_ID || process.env.DIGEST_CHANNEL_ID, // Where bot commands work
  },

  // Turso Database
  database: {
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },

  // USAJOBS API
  usajobs: {
    apiKey: process.env.USAJOBS_API_KEY,
    userAgent: process.env.USAJOBS_USER_AGENT,
  },

  // Nominatim (Geocoding)
  nominatim: {
    userAgent: process.env.NOMINATIM_USER_AGENT || 'SMC-CS-Opportunities-Bot/1.0',
  },

  // Contact information (for API User-Agent headers)
  userEmail: process.env.USER_EMAIL || process.env.USAJOBS_USER_AGENT,

  // Bot behavior
  bot: {
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // Rate limiting
  rateLimits: {
    defaultDelay: parseInt(process.env.RATE_LIMIT_DELAY_MS) || 1000,
    geocodingDelay: parseInt(process.env.GEOCODING_DELAY_MS) || 1200,
    discordPostDelay: parseInt(process.env.DISCORD_POST_DELAY_MS) || 1000, // Delay between Discord posts
    githubRequestDelay: parseInt(process.env.GITHUB_REQUEST_DELAY_MS) || 2000, // Delay between GitHub repo fetches
  },

  // Scheduling
  scheduler: {
    realtimeCron: process.env.REALTIME_CRON_SCHEDULE || '*/15 * * * *', // Every 15 minutes
  },

  // SMC Location (Santa Monica College)
  smc: {
    name: sourcesConfig.smc?.name || 'Santa Monica College',
    address: sourcesConfig.smc?.address || '1900 Pico Blvd, Santa Monica, CA 90405',
    latitude: parseFloat(process.env.SMC_LATITUDE) || sourcesConfig.smc?.latitude || 34.0168,
    longitude: parseFloat(process.env.SMC_LONGITUDE) || sourcesConfig.smc?.longitude || -118.4695,
  },

  // California geographic bounds
  california: {
    north: parseFloat(process.env.CA_NORTH_BOUND) || 42.0,
    south: parseFloat(process.env.CA_SOUTH_BOUND) || 32.5,
    east: parseFloat(process.env.CA_EAST_BOUND) || -114.1,
    west: parseFloat(process.env.CA_WEST_BOUND) || -124.4,
  },

  // Posting configuration
  posting: {
    minOpportunities: parseInt(process.env.MIN_OPPORTUNITIES_PER_POST) ||
      sourcesConfig.posting?.min_opportunities || 5,
    maxOpportunities: parseInt(process.env.MAX_OPPORTUNITIES_PER_POST) ||
      sourcesConfig.posting?.max_opportunities || 8,
    frequencyDays: sourcesConfig.posting?.frequency_days || 3,
  },

  // Scoring weights
  scoring: {
    locationWeight: sourcesConfig.scoring?.location_weight || 35,
    recencyWeight: sourcesConfig.scoring?.recency_weight || 30,
    brandWeight: sourcesConfig.scoring?.brand_weight || 20,
    keywordsWeight: sourcesConfig.scoring?.keywords_weight || 15,
  },

  // Brand companies (for scoring)
  brandCompanies: sourcesConfig.brand_companies || {},

  // Watchlists (companies to fetch from)
  watchlist: {
    greenhouse: watchlistConfig.greenhouse || [],
    lever: watchlistConfig.lever || [],
    ashby: watchlistConfig.ashby || [],
  },

  // Prestigious hackathons (allowed nationally)
  prestigeHackathons: {
    whitelisted: prestigeConfig.whitelisted || [],
    localSoCal: prestigeConfig.local_socal || [],
  },

  // GitHub crowdsourced repositories
  github: {
    fetchTimeoutMs: parseInt(process.env.GITHUB_FETCH_TIMEOUT_MS) || 15000, // 15 seconds
    maxRetries: parseInt(process.env.GITHUB_MAX_RETRIES) || 3,
    retryDelayMs: parseInt(process.env.GITHUB_RETRY_DELAY_MS) || 1000, // Initial retry delay (exponential backoff)
    repositories: [
      {
        name: 'Summer2026-Internships',
        url: 'https://raw.githubusercontent.com/vanshb03/Summer2026-Internships/dev/.github/scripts/listings.json',
        season: 'Summer 2026',
      },
      // Add more repos here as they become available
    ],
  },
};

/**
 * Validate required configuration
 * @throws {Error} if required config is missing
 */
export function validateConfig() {
  const required = [
    { path: 'discord.token', value: CONFIG.discord.token },
    { path: 'discord.clientId', value: CONFIG.discord.clientId },
    { path: 'database.url', value: CONFIG.database.url },
    { path: 'database.authToken', value: CONFIG.database.authToken },
  ];

  const missing = required.filter(({ value }) => !value);

  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration: ${missing.map(({ path }) => path).join(', ')}`
    );
  }

  // Warn about optional but recommended configs
  const recommended = [
    { path: 'usajobs.apiKey', value: CONFIG.usajobs.apiKey, name: 'USAJOBS API' },
    { path: 'discord.digestChannelId', value: CONFIG.discord.digestChannelId, name: 'Digest channel' },
    { path: 'userEmail', value: CONFIG.userEmail, name: 'User email (for API User-Agent headers)' },
  ];

  recommended
    .filter(({ value }) => !value)
    .forEach(({ name }) => {
      console.warn(`Warning: ${name} not configured. Some features may not work.`); // console.warn is intentional here — logger depends on config
    });
}

/**
 * Get configuration value by path
 * @param {string} path - Dot-separated path (e.g., 'discord.token')
 * @returns {any}
 */
export function getConfig(path) {
  return path.split('.').reduce((obj, key) => obj?.[key], CONFIG);
}

export default CONFIG;
