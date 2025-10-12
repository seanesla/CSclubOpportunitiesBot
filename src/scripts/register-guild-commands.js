/**
 * Register slash commands to a specific guild (instant, for testing)
 * Global commands can take up to 1 hour to appear
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function registerGuildCommands() {
  try {
    // Get guild ID from environment or prompt
    const guildId = process.env.DISCORD_GUILD_ID || process.argv[2];

    if (!guildId) {
      console.error('❌ Error: Guild ID required');
      console.log('\nUsage:');
      console.log('  DISCORD_GUILD_ID=your_guild_id npm run register-guild-commands');
      console.log('  OR');
      console.log('  npm run register-guild-commands your_guild_id');
      console.log('\nTo get your guild ID:');
      console.log('  1. Enable Developer Mode in Discord (Settings > Advanced)');
      console.log('  2. Right-click your server name');
      console.log('  3. Click "Copy Server ID"');
      process.exit(1);
    }

    console.log(`Registering commands to guild: ${guildId}`);
    console.log('Loading command definitions...');

    // Load all command files
    const commandsPath = join(__dirname, '../commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commands = [];
    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = await import(filePath);

      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✓ Loaded: ${command.data.name}`);
      }
    }

    console.log(`\nRegistering ${commands.length} command(s) to guild...`);

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Register commands to specific guild (instant)
    const data = await rest.put(
      Routes.applicationGuildCommands(CONFIG.discord.clientId, guildId),
      { body: commands }
    );

    console.log(`✓ Successfully registered ${data.length} commands to guild`);
    console.log('✓ Commands should appear INSTANTLY in your server!');
    console.log('\nRegistered commands:');
    data.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

  } catch (error) {
    console.error('Error registering guild commands:', error);

    if (error.code === 50001) {
      console.error('\n❌ Missing Access: Bot is not in the guild or lacks permissions');
    } else if (error.code === 10004) {
      console.error('\n❌ Unknown Guild: Invalid guild ID');
    }

    process.exit(1);
  }
}

registerGuildCommands();
