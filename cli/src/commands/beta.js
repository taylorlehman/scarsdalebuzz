import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc } from '../lib/firestore.js';

/**
 * @param {import('commander').Command} program
 */
export function registerBetaCommands(program) {
  const beta = program.command('beta').description('Sunny Beta access management');

  beta
    .command('list')
    .description('List beta applicants')
    .option('-q, --search <query>', 'Search by name or email')
    .option('-s, --status <status>', 'Filter: pending, approved, rejected')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const snap = await db.collection('users').orderBy('displayName').get();
      let list = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.sunnyBetaStatus); // Has applied

      if (opts.search) {
        const q = opts.search.toLowerCase();
        list = list.filter((u) => {
          const s = `${u.displayName || ''} ${u.email || ''} ${u.uid}`.toLowerCase();
          return s.includes(q);
        });
      }
      if (opts.status) {
        list = list.filter((u) => (u.sunnyBetaStatus || 'none') === opts.status);
      }

      if (opts.json) {
        const out = list.map((u) => serializeDoc(u));
        print({ applicants: out, count: out.length }, true);
        return;
      }

      const rows = list.map((u) => ({
        name: (u.displayName || '—').slice(0, 28),
        email: (u.email || '—').slice(0, 36),
        status: (u.sunnyBetaStatus || 'none').charAt(0).toUpperCase() + (u.sunnyBetaStatus || 'none').slice(1),
      }));
      print(formatTable(rows, [
        { key: 'name', header: 'Name', maxWidth: 30 },
        { key: 'email', header: 'Email', maxWidth: 38 },
        { key: 'status', header: 'Status' },
      ]));
    });

  beta
    .command('admit <uid>')
    .description('Admit user to Sunny Beta')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      await db.collection('users').doc(uid).update({ sunnyBetaStatus: 'approved' });
      print(opts.json ? { success: true, uid } : `Admitted ${uid} to Sunny Beta`, opts.json);
    });

  beta
    .command('kick <uid>')
    .description('Remove user from Sunny Beta')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      await db.collection('users').doc(uid).update({ sunnyBetaStatus: 'rejected' });
      print(opts.json ? { success: true, uid } : `Removed ${uid} from Sunny Beta`, opts.json);
    });
}
