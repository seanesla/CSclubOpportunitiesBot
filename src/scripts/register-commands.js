/**
 * Register slash commands with Discord
 * Run this once after creating new commands or updating existing ones
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function registerCommands() {
  try {
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

    console.log(`\nRegistering ${commands.length} command(s) with Discord...`);

    // Create REST client
    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Register commands globally
    const data = await rest.put(
      Routes.applicationCommands(CONFIG.discord.clientId),
      { body: commands }
    );

    console.log(`✓ Successfully registered ${data.length} application commands globally`);
    console.log('\nRegistered commands:');
    data.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
}

registerCommands();
