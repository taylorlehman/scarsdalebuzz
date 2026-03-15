import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc, FieldValue } from '../lib/firestore.js';

/**
 * @param {import('commander').Command} program
 */
export function registerSuggestionsCommands(program) {
  const sugg = program.command('suggestions').description('Manage suggested services');

  sugg
    .command('list')
    .description('List pending suggestions')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const snap = await db
        .collection('suggested_services')
        .where('status', '==', 'pending')
        .orderBy('suggestedAt', 'desc')
        .get();
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (opts.json) {
        const out = list.map((s) => serializeDoc(s));
        print({ suggestions: out, count: out.length }, true);
        return;
      }

      const rows = list.map((s) => {
        const name = (s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—').slice(0, 28);
        const category = (s.category || (s.categories && s.categories[0]) || '—').slice(0, 20);
        const contact = [s.phone, s.email].filter(Boolean).join(', ') || '—';
        return { name, category, contact };
      });
      print(formatTable(rows, [
        { key: 'name', header: 'Business / Name', maxWidth: 30 },
        { key: 'category', header: 'Category', maxWidth: 22 },
        { key: 'contact', header: 'Contact', maxWidth: 32 },
      ]));
    });

  sugg
    .command('approve <id>')
    .description('Approve suggestion as new service')
    .option('-y, --yes', 'Skip confirmation')
    .option('--sunny-approved', 'Mark as Sunny approved')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      if (!id) {
        printError('Suggestion ID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const suggRef = db.collection('suggested_services').doc(id);
      const suggDoc = await suggRef.get();
      if (!suggDoc.exists) {
        printError('Suggestion not found');
        process.exit(1);
      }
      const data = suggDoc.data();
      const categories = data.categories || (data.category ? [data.category] : []);
      const cats = Array.isArray(categories) ? categories : [categories];

      const payload = {
        businessName: data.businessName || null,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        phone: data.phone || null,
        email: data.email || null,
        categories: cats.length ? cats : ['Other'],
        category: cats[0] || 'Other',
        recommendations: 1,
        sunnyApproved: !!opts.sunnyApproved,
        isTestProvider: false,
        lastRecommended: FieldValue.serverTimestamp(),
        recentRecommenders: [{ uid: data.suggestedBy, timestamp: new Date() }],
      };

      const batch = db.batch();
      const serviceRef = db.collection('services').doc();
      batch.set(serviceRef, payload);
      const recRef = serviceRef.collection('recommendations').doc(data.suggestedBy);
      batch.set(recRef, { uid: data.suggestedBy, timestamp: FieldValue.serverTimestamp() });
      batch.update(suggRef, { status: 'approved' });
      await batch.commit();

      print(opts.json ? { success: true, suggestionId: id, serviceId: serviceRef.id } : `Approved suggestion ${id} as service ${serviceRef.id}`, opts.json);
    });

  sugg
    .command('reject <id>')
    .description('Reject a suggestion')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      if (!id) {
        printError('Suggestion ID is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      await db.collection('suggested_services').doc(id).update({ status: 'rejected' });
      print(opts.json ? { success: true, id } : `Rejected suggestion ${id}`, opts.json);
    });
}
