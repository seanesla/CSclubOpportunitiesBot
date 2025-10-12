/**
 * Check if bot has applications.commands integration in a guild
 */

import { REST, Routes } from 'discord.js';
import { CONFIG } from '../config/index.js';

const guildId = process.argv[2] || '805918975116181565';

async function checkIntegration() {
  try {
    console.log(`Checking bot integration in guild: ${guildId}\n`);

    const rest = new REST({ version: '10' }).setToken(CONFIG.discord.token);

    // Get guild info
    const guild = await rest.get(Routes.guild(guildId));
    console.log(`Guild: ${guild.name}`);
    console.log();

    // Get bot's member info in the guild
    const member = await rest.get(
      Routes.guildMember(guildId, CONFIG.discord.clientId)
    );
    console.log('Bot is a member of this guild ✓');
    console.log();

    // Try to get application command permissions
    try {
      const commandPermissions = await rest.get(
        Routes.guildApplicationCommandsPermissions(CONFIG.discord.clientId, guildId)
      );
      console.log(`Application commands permissions: ${commandPermissions.length} commands configured`);
    } catch (e) {
      console.log('⚠️ Could not get command permissions (might be normal)');
    }

    console.log();
    console.log('='.repeat(50));
    console.log('DIAGNOSIS:');
    console.log('='.repeat(50));
    console.log();
    console.log('The bot IS in the guild.');
    console.log('But slash commands may not work if the bot was invited');
    console.log('WITHOUT the applications.commands scope.');
    console.log();
    console.log('SOLUTION:');
    console.log('1. Kick the bot from the server');
    console.log('2. Use this EXACT URL to re-invite:');
    console.log();
    console.log('https://discord.com/api/oauth2/authorize?client_id=1427029031194329241&permissions=274878024768&scope=bot%20applications.commands');
    console.log();
    console.log('3. Make SURE you see TWO scopes being requested:');
    console.log('   - bot');
    console.log('   - applications.commands');
    console.log();
    console.log('4. Select your server and authorize');

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 50001) {
      console.error('\n❌ Bot does not have access to this guild!');
      console.error('Make sure the bot is invited to guild:', guildId);
    }
    process.exit(1);
  }
}

checkIntegration();
