import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc, FieldValue } from '../lib/firestore.js';

/**
 * @param {import('commander').Command} program
 */
export function registerServicesCommands(program) {
  const svc = program.command('services').description('Service/provider management');

  svc
    .command('list')
    .description('List services')
    .option('-q, --search <query>', 'Search by name, category, phone, email')
    .option('-c, --category <name>', 'Filter by category')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const snap = await db.collection('services').get();
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (opts.search) {
        const q = opts.search.toLowerCase();
        list = list.filter((s) => {
          const cats = s.categories || (s.category ? [s.category] : []);
          const catStr = cats.join(' ');
          const name = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`;
          return [name, catStr, s.phone, s.email, s.firstName, s.lastName]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q));
        });
      }
      if (opts.category) {
        list = list.filter((s) => {
          const cats = s.categories || (s.category ? [s.category] : []);
          return cats.includes(opts.category);
        });
      }

      if (opts.json) {
        const out = list.map((s) => serializeDoc(s));
        print({ services: out, count: out.length }, true);
        return;
      }

      const rows = list.map((s) => {
        const name = (s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—').slice(0, 28);
        const cats = s.categories || (s.category ? [s.category] : []);
        const categories = cats.slice(0, 2).join(', ') + (cats.length > 2 ? '…' : '');
        return {
          name,
          categories: categories.slice(0, 24),
          recs: String(s.recommendations ?? 0),
        };
      });
      print(formatTable(rows, [
        { key: 'name', header: 'Name', maxWidth: 30 },
        { key: 'categories', header: 'Categories', maxWidth: 26 },
        { key: 'recs', header: 'Recs' },
      ]));
    });

  svc
    .command('get <id>')
    .description('Get a single service by ID')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      if (!id) {
        printError('Service ID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const doc = await db.collection('services').doc(id).get();
      if (!doc.exists) {
        printError('Service not found');
        process.exit(1);
      }
      if (opts.json) {
        print(serializeDoc({ id: doc.id, ...doc.data() }), true);
        return;
      }
      const d = doc.data();
      const lines = [
        `Name:       ${d.businessName || [d.firstName, d.lastName].filter(Boolean).join(' ') || '—'}`,
        `Phone:      ${d.phone || '—'}`,
        `Email:      ${d.email || '—'}`,
        `Categories: ${(d.categories || (d.category ? [d.category] : [])).join(', ') || '—'}`,
        `Recs:       ${d.recommendations ?? 0}`,
        `Sunny:      ${d.sunnyApproved ? 'Yes' : 'No'}`,
        `Test:       ${d.isTestProvider ? 'Yes' : 'No'}`,
      ];
      print(lines.join('\n'));
    });

  svc
    .command('add')
    .description('Add a new service')
    .requiredOption('-n, --name <name>', 'Business name')
    .option('-f, --firstName <name>', 'First name (for individuals)')
    .option('-l, --lastName <name>', 'Last name')
    .option('-p, --phone <phone>', 'Phone number')
    .option('-e, --email <email>', 'Email')
    .requiredOption('-c, --categories <cats>', 'Comma-separated categories')
    .option('--sunny-approved', 'Mark as Sunny approved')
    .option('--test-provider', 'Mark as test provider')
    .option('--recs <n>', 'Recommendation count', '0')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const categories = opts.categories.split(',').map((c) => c.trim()).filter(Boolean);
      if (categories.length === 0) {
        printError('At least one category is required');
        process.exit(1);
      }
      const payload = {
        businessName: opts.name || null,
        firstName: opts.firstName || null,
        lastName: opts.lastName || null,
        phone: opts.phone || null,
        email: opts.email || null,
        categories,
        category: categories[0],
        sunnyApproved: !!opts.sunnyApproved,
        isTestProvider: !!opts.testProvider,
        recommendations: parseInt(opts.recs, 10) || 0,
      };
      const ref = await db.collection('services').add(payload);
      print(opts.json ? { success: true, id: ref.id } : `Created service ${ref.id}`, opts.json);
    });

  svc
    .command('edit <id>')
    .description('Edit an existing service')
    .option('-n, --name <name>', 'Business name')
    .option('-f, --firstName <name>', 'First name')
    .option('-l, --lastName <name>', 'Last name')
    .option('-p, --phone <phone>', 'Phone')
    .option('-e, --email <email>', 'Email')
    .option('-c, --categories <cats>', 'Comma-separated categories')
    .option('--sunny-approved', 'Mark as Sunny approved')
    .option('--no-sunny-approved', 'Unmark Sunny approved')
    .option('--test-provider', 'Mark as test provider')
    .option('--no-test-provider', 'Unmark test provider')
    .option('--recs <n>', 'Recommendation count')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      if (!id) {
        printError('Service ID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const ref = db.collection('services').doc(id);
      const doc = await ref.get();
      if (!doc.exists) {
        printError('Service not found');
        process.exit(1);
      }
      const updates = {};
      if (opts.name !== undefined) updates.businessName = opts.name || null;
      if (opts.firstName !== undefined) updates.firstName = opts.firstName || null;
      if (opts.lastName !== undefined) updates.lastName = opts.lastName || null;
      if (opts.phone !== undefined) updates.phone = opts.phone || null;
      if (opts.email !== undefined) updates.email = opts.email || null;
      if (opts.categories !== undefined) {
        const cats = opts.categories.split(',').map((c) => c.trim()).filter(Boolean);
        updates.categories = cats;
        updates.category = cats[0] || null;
      }
      if (opts.sunnyApproved !== undefined) updates.sunnyApproved = opts.sunnyApproved;
      if (opts.testProvider !== undefined) updates.isTestProvider = opts.testProvider;
      if (opts.recs !== undefined) updates.recommendations = parseInt(opts.recs, 10) || 0;

      if (Object.keys(updates).length === 0) {
        printError('No updates specified');
        process.exit(1);
      }
      await ref.update(updates);
      print(opts.json ? { success: true, id } : `Updated service ${id}`, opts.json);
    });

  svc
    .command('delete <id>')
    .description('Delete a service')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      if (!id) {
        printError('Service ID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const ref = db.collection('services').doc(id);
      const recsSnap = await ref.collection('recommendations').get();
      const batch = db.batch();
      recsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await ref.delete();
      print(opts.json ? { success: true, id } : `Deleted service ${id}`, opts.json);
    });
}
