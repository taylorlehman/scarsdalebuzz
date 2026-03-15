import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerUsersCommands } from './commands/users.js';
import { registerBetaCommands } from './commands/beta.js';
import { registerServicesCommands } from './commands/services.js';
import { registerSuggestionsCommands } from './commands/suggestions.js';
import { registerCategoriesCommands } from './commands/categories.js';
import { registerGroupsCommands } from './commands/groups.js';
import { registerQualityCommands } from './commands/quality.js';
import { registerCleanupCommands } from './commands/cleanup.js';

/**
 * @param {string[]} argv - Full process.argv (Commander expects node, script, ...)
 * @returns {Promise<void>}
 */
export async function runCli(argv) {
  const program = new Command();

  program
    .name('sbadmin')
    .description('Scarsdale Buzz admin CLI - manage users, services, categories, and more')
    .version('1.0.0')
    .option('--json', 'Output as JSON (global)')
    .option('-y, --yes', 'Skip confirmations (global)');

  registerAuthCommands(program);
  registerUsersCommands(program);
  registerBetaCommands(program);
  registerServicesCommands(program);
  registerSuggestionsCommands(program);
  registerCategoriesCommands(program);
  registerGroupsCommands(program);
  registerQualityCommands(program);
  registerCleanupCommands(program);

  await program.parseAsync(argv, { from: 'node' });
}
