import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc } from '../lib/firestore.js';
import { getDb, fromDoc } from '../lib/db.js';

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
    .action(async function (opts) {
      const { mode, db } = getDb(this);
      let list;
      if (mode === 'rest') {
        const docs = await db.runQuery({
          from: [{ collectionId: 'users' }],
          orderBy: [{ field: { fieldPath: 'displayName' }, direction: 'ASCENDING' }],
        });
        list = docs.map((d) => {
          const u = fromDoc(d);
          return { uid: u.id, ...u };
        }).filter((u) => u.sunnyBetaStatus);
      } else {
        const { db: g } = initFirebase();
        const snap = await g.collection('users').orderBy('displayName').get();
        list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u) => u.sunnyBetaStatus); // Has applied
      }

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
    .action(async function (uid, opts) {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      if (mode === 'rest') await db.updateDoc(`users/${uid}`, { sunnyBetaStatus: 'approved' });
      else {
        const { db: g } = initFirebase();
        await g.collection('users').doc(uid).update({ sunnyBetaStatus: 'approved' });
      }
      print(opts.json ? { success: true, uid } : `Admitted ${uid} to Sunny Beta`, opts.json);
    });

  beta
    .command('kick <uid>')
    .description('Remove user from Sunny Beta')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async function (uid, opts) {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      if (mode === 'rest') await db.updateDoc(`users/${uid}`, { sunnyBetaStatus: 'rejected' });
      else {
        const { db: g } = initFirebase();
        await g.collection('users').doc(uid).update({ sunnyBetaStatus: 'rejected' });
      }
      print(opts.json ? { success: true, uid } : `Removed ${uid} from Sunny Beta`, opts.json);
    });
}
