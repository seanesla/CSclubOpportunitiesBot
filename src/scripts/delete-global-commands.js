/**
 * Delete all global commands
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';

async function deleteGlobalCommands() {
  try {
    console.log('Deleting all global commands...');

    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Delete all global commands by setting to empty array
    await rest.put(
      Routes.applicationCommands(CONFIG.discord.clientId),
      { body: [] }
    );

    console.log('✓ Successfully deleted all global commands');
    console.log('✓ Only guild commands will remain');

  } catch (error) {
    console.error('Error deleting global commands:', error);
    process.exit(1);
  }
}

deleteGlobalCommands();
