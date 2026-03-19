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
        const getJson = (cmd) => Boolean(cmd?.opts?.().json);
        const useJson = getJson(this) || getJson(this.parent) || getJson(this.parent?.parent) || Boolean(opts.json);
        const { mode, db } = getDb(this);
        if (mode === 'rest') {
          await db.getDoc('config/categories');
        } else {
          const { db: g } = initFirebase();
          await g.collection('config').doc('categories').get();
        }
        const out = { ok: true, message: 'Connected' };
        print(useJson ? out : 'Connected to Firebase', useJson);
      } catch (e) {
        printError(e.message || 'Connection failed');
        const getJson = (cmd) => Boolean(cmd?.opts?.().json);
        const useJson = getJson(this) || getJson(this.parent) || getJson(this.parent?.parent) || Boolean(opts.json);
        if (useJson) print({ ok: false, error: e.message }, true);
        process.exit(2);
      }
    });
  program.addCommand(auth);
}
