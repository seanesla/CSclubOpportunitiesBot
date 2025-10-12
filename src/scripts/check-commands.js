/**
 * Check what commands are actually registered in a guild
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';

const guildId = process.argv[2] || '805918975116181565';

async function checkCommands() {
  try {
    console.log(`Checking commands registered in guild: ${guildId}\n`);

    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Get guild commands
    const guildCommands = await rest.get(
      Routes.applicationGuildCommands(CONFIG.discord.clientId, guildId)
    );

    console.log('Guild Commands (instant):');
    if (guildCommands.length === 0) {
      console.log('  ❌ No guild commands registered');
    } else {
      guildCommands.forEach(cmd => {
        console.log(`  ✓ /${cmd.name} - ${cmd.description}`);
      });
    }

    console.log();

    // Get global commands
    const globalCommands = await rest.get(
      Routes.applicationCommands(CONFIG.discord.clientId)
    );

    console.log('Global Commands (takes up to 1 hour):');
    if (globalCommands.length === 0) {
      console.log('  ❌ No global commands registered');
    } else {
      globalCommands.forEach(cmd => {
        console.log(`  ✓ /${cmd.name} - ${cmd.description}`);
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('TOTAL: ' + (guildCommands.length + globalCommands.length) + ' commands visible to Discord');

  } catch (error) {
    console.error('Error checking commands:', error);
    process.exit(1);
  }
}

checkCommands();
