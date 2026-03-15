import { initFirebase } from '../auth.js';
import { print, printError } from '../lib/output.js';
import { serializeDoc } from '../lib/firestore.js';
import admin from 'firebase-admin';

const { FieldValue } = admin.firestore;

function toDate(v) {
  if (!v) return 0;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

function formatUsersTable(users) {
  if (users.length === 0) return 'No users found.';

  const rows = users.map((u) => {
    const name = (u.displayName || '—').slice(0, 28);
    const email = (u.email || '—').slice(0, 36);
    const status = (u.directoryStatus || 'pending') === 'approved'
      ? formatJoined(u.joinedDate || u.createdAt)
      : 'Pending';
    return { name, email, status };
  });

  const col = (arr, key, headerLen) =>
    Math.max(headerLen, ...arr.map((r) => String(r[key]).length)) + 1;
  const wName = Math.min(col(rows, 'name', 4), 30);
  const wEmail = Math.min(col(rows, 'email', 5), 38);
  const wStatus = col(rows, 'status', 6);

  const pad = (s, w) => String(s).slice(0, w - 1).padEnd(w);
  const header = pad('Name', wName) + pad('Email', wEmail) + pad('Status', wStatus);
  const line = '-'.repeat(header.length);

  return [header, line, ...rows.map((r) => pad(r.name, wName) + pad(r.email, wEmail) + pad(r.status, wStatus))].join('\n');
}

function formatJoined(v) {
  if (!v) return '—';
  let d;
  if (typeof v.toDate === 'function') d = v.toDate();
  else if (v instanceof Date) d = v;
  else d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {import('commander').Command} program
 */
export function registerUsersCommands(program) {
  const users = program.command('users').description('User management');

  users
    .command('list')
    .description('List users')
    .option('-q, --search <query>', 'Search by name, email, or uid')
    .option('-s, --status <status>', 'Filter by directoryStatus: pending, approved')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      let snap = db.collection('users').orderBy('displayName');
      const docs = (await snap.get()).docs.map((d) => ({ uid: d.id, ...d.data() }));
      let list = docs;

      if (opts.search) {
        const q = opts.search.toLowerCase();
        list = list.filter((u) => {
          const s = `${u.displayName || ''} ${u.email || ''} ${u.uid}`.toLowerCase();
          return s.includes(q);
        });
      }
      if (opts.status) {
        list = list.filter((u) => (u.directoryStatus || 'pending') === opts.status);
      }

      // Pending first, then by joined/created date (newest first)
      list.sort((a, b) => {
        const statusA = a.directoryStatus || 'pending';
        const statusB = b.directoryStatus || 'pending';
        if (statusA === 'pending' && statusB !== 'pending') return -1;
        if (statusA !== 'pending' && statusB === 'pending') return 1;
        const dateA = toDate(a.joinedDate || a.createdAt);
        const dateB = toDate(b.joinedDate || b.createdAt);
        return dateB - dateA;
      });

      if (opts.json) {
        const out = list.map((u) => serializeDoc(u));
        print({ users: out, count: out.length }, true);
        return;
      }

      print(formatUsersTable(list));
    });

  users
    .command('approve <uid>')
    .description('Approve a pending user')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const ref = db.collection('users').doc(uid);
      const doc = await ref.get();
      if (!doc.exists) {
        printError('User not found');
        process.exit(1);
      }
      await ref.update({
        directoryStatus: 'approved',
        joinedDate: FieldValue.serverTimestamp(),
      });
      print(opts.json ? { success: true, uid } : `Approved user ${uid}`, opts.json);
    });

  users
    .command('reject <uid>')
    .description('Reject and delete a pending user')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { db, auth } = initFirebase();
      const recsSnap = await db.collectionGroup('recommendations').where('uid', '==', uid).get();
      for (const doc of recsSnap.docs) {
        await doc.ref.delete();
        const serviceRef = doc.ref.parent.parent;
        if (serviceRef) {
          const sDoc = await serviceRef.get();
          if (sDoc.exists) {
            const data = sDoc.data();
            const newRecs = Math.max(0, (data.recommendations || 0) - 1);
            const newRecent = (data.recentRecommenders || []).filter((r) => r.uid !== uid);
            await serviceRef.update({ recommendations: newRecs, recentRecommenders: newRecent });
          }
        }
      }
      await db.collection('users').doc(uid).delete();
      try {
        await auth.deleteUser(uid);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
      print(opts.json ? { success: true, uid } : `Rejected and deleted user ${uid}`, opts.json);
    });

  users
    .command('delete <uid>')
    .description('Delete a user (and their recommendations)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { db, auth } = initFirebase();

      const recsSnap = await db.collectionGroup('recommendations').where('uid', '==', uid).get();
      for (const doc of recsSnap.docs) {
        await doc.ref.delete();
        const serviceRef = doc.ref.parent.parent;
        if (serviceRef) {
          const sDoc = await serviceRef.get();
          if (sDoc.exists) {
            const data = sDoc.data();
            const newRecs = Math.max(0, (data.recommendations || 0) - 1);
            const newRecent = (data.recentRecommenders || []).filter((r) => r.uid !== uid);
            await serviceRef.update({ recommendations: newRecs, recentRecommenders: newRecent });
          }
        }
      }
      await db.collection('users').doc(uid).delete();
      try {
        await auth.deleteUser(uid);
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
      print(opts.json ? { success: true, uid } : `Deleted user ${uid}`, opts.json);
    });

  users
    .command('make-admin <uid>')
    .description('Grant admin role to a user')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (uid, opts) => {
      if (!uid) {
        printError('UID is required');
        process.exit(1);
      }
      const { auth, db } = initFirebase();
      await auth.setCustomUserClaims(uid, { admin: true });
      await db.collection('users').doc(uid).set({ isAdmin: true }, { merge: true });
      print(opts.json ? { success: true, uid } : `Admin role granted to ${uid}`, opts.json);
    });
}
