/**
 * Force refresh all commands by deleting and re-registering
 * This invalidates Discord's command cache
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function forceRefreshCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Step 1: Delete ALL global commands
    console.log('🗑️  Deleting all global commands to clear cache...');
    await rest.put(
      Routes.applicationCommands(CONFIG.discord.clientId),
      { body: [] }
    );
    console.log('✓ All commands deleted');

    // Step 2: Wait 5 seconds for Discord to process
    console.log('\n⏳ Waiting 5 seconds for cache invalidation...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Re-register all commands
    console.log('\n📝 Re-registering commands...');
    const commandsPath = join(__dirname, '../commands');
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const commands = [];
    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const command = await import(filePath);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`  ✓ ${command.data.name}`);
      }
    }

    const data = await rest.put(
      Routes.applicationCommands(CONFIG.discord.clientId),
      { body: commands }
    );

    console.log(`\n✅ Successfully re-registered ${data.length} commands`);
    console.log('\n⚠️  IMPORTANT: Restart Discord (fully quit and reopen) to see changes!');
    console.log('    Commands should appear within 1-2 minutes after restart.');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

forceRefreshCommands();
