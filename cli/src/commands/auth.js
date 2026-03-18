import { Command } from 'commander';
import { initFirebase } from '../auth.js';
import { print, printError } from '../lib/output.js';
import { getDb } from '../lib/db.js';

/**
 * @param {import('commander').Command} program
 */
export function registerAuthCommands(program) {
  const auth = new Command('auth').description('Authentication status');
  auth
    .command('status')
    .description('Verify Firebase Admin connection')
    .option('--json', 'Output as JSON')
    .action(async function (opts) {
      try {
        const { mode, db } = getDb(this);
        if (mode === 'rest') {
          await db.getDoc('config/categories');
        } else {
          const { db: g } = initFirebase();
          await g.collection('config').doc('categories').get();
        }
        const out = { ok: true, message: 'Connected' };
        print(opts.json ? out : 'Connected to Firebase', opts.json);
      } catch (e) {
        printError(e.message || 'Connection failed');
        if (opts.json) print({ ok: false, error: e.message }, true);
        process.exit(2);
      }
    });
  program.addCommand(auth);
}
