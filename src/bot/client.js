/**
 * Discord Bot Client
 * Initializes and manages the Discord bot connection
 */

import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { CONFIG } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create and configure Discord client
 * @returns {Client} Configured Discord client
 */
export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  // Create a collection to store commands
  client.commands = new Collection();

  return client;
}

/**
 * Load all slash commands from commands directory
 * @param {Client} client - Discord client
 * @returns {Promise<void>}
 */
export async function loadCommands(client) {
  const commandsPath = join(__dirname, '../commands');
  const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`);
    } else {
      logger.warn(`Command at ${file} is missing required "data" or "execute" property`);
    }
  }
}

/**
 * Set up event handlers
 * @param {Client} client - Discord client
 */
export function setupEventHandlers(client) {
  // Ready event - fires when bot connects
  client.once(Events.ClientReady, readyClient => {
    logger.info(`Discord bot logged in as ${readyClient.user.tag}`);
    logger.info(`Bot is in ${readyClient.guilds.cache.size} guilds`);
  });

  // Interaction Create - fires when someone uses a slash command
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}`, { error: error.message, stack: error.stack });

      const errorMessage = {
        content: 'There was an error executing this command!',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  });

  // Error handling
  client.on(Events.Error, error => {
    logger.error('Discord client error', { error: error.message });
  });

  client.on(Events.Warn, warning => {
    logger.warn('Discord client warning', { warning });
  });

  // Reconnection handling
  client.on(Events.ShardReconnecting, () => {
    logger.info('Discord client reconnecting...');
  });

  client.on(Events.ShardResume, () => {
    logger.info('Discord client resumed connection');
  });
}

/**
 * Initialize and start the Discord bot
 * @returns {Promise<Client>} Logged in Discord client
 */
export async function initBot() {
  try {
    const client = createClient();

    // Load commands
    await loadCommands(client);

    // Setup event handlers
    setupEventHandlers(client);

    // Login to Discord
    await client.login(CONFIG.discord.token);

    return client;
  } catch (error) {
    logger.error('Failed to initialize Discord bot', { error: error.message });
    throw error;
  }
}
