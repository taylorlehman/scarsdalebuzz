import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc, FieldValue } from '../lib/firestore.js';
import { getDb, fromDoc } from '../lib/db.js';
import crypto from 'crypto';

/**
 * @param {import('commander').Command} program
 */
export function registerSuggestionsCommands(program) {
  const sugg = program.command('suggestions').description('Manage suggested services');

  sugg
    .command('list')
    .description('List pending suggestions')
    .option('--json', 'Output as JSON')
    .action(async function (opts) {
      const { mode, db } = getDb(this);
      let list;
      if (mode === 'rest') {
        const docs = await db.runQuery({
          from: [{ collectionId: 'suggested_services' }],
          where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
          orderBy: [{ field: { fieldPath: 'suggestedAt' }, direction: 'DESCENDING' }],
        });
        list = docs.map((d) => fromDoc(d));
      } else {
        const { db: g } = initFirebase();
        const snap = await g
          .collection('suggested_services')
          .where('status', '==', 'pending')
          .orderBy('suggestedAt', 'desc')
          .get();
        list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }

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
    .action(async function (id, opts) {
      if (!id) {
        printError('Suggestion ID is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let data;
      if (mode === 'rest') {
        const doc = await db.getDoc(`suggested_services/${id}`);
        if (!doc) {
          printError('Suggestion not found');
          process.exit(1);
        }
        data = fromDoc(doc);
      } else {
        const { db: g } = initFirebase();
        const suggRef = g.collection('suggested_services').doc(id);
        const suggDoc = await suggRef.get();
        if (!suggDoc.exists) {
          printError('Suggestion not found');
          process.exit(1);
        }
        data = suggDoc.data();
      }
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
        lastRecommended: mode === 'rest' ? new Date() : FieldValue.serverTimestamp(),
        recentRecommenders: [{ uid: data.suggestedBy, timestamp: new Date() }],
      };

      let serviceId;
      if (mode === 'rest') {
        serviceId = crypto.randomUUID();
        await db.setDoc(`services/${serviceId}`, payload, { merge: false });
        // recommendation doc
        await db.setDoc(`services/${serviceId}/recommendations/${data.suggestedBy}`, { uid: data.suggestedBy, timestamp: new Date() }, { merge: false });
        await db.updateDoc(`suggested_services/${id}`, { status: 'approved' });
      } else {
        const { db: g } = initFirebase();
        const batch = g.batch();
        const serviceRef = g.collection('services').doc();
        serviceId = serviceRef.id;
        batch.set(serviceRef, payload);
        const recRef = serviceRef.collection('recommendations').doc(data.suggestedBy);
        batch.set(recRef, { uid: data.suggestedBy, timestamp: FieldValue.serverTimestamp() });
        const suggRef = g.collection('suggested_services').doc(id);
        batch.update(suggRef, { status: 'approved' });
        await batch.commit();
      }

      print(opts.json ? { success: true, suggestionId: id, serviceId } : `Approved suggestion ${id} as service ${serviceId}`, opts.json);
    });

  sugg
    .command('reject <id>')
    .description('Reject a suggestion')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async function (id, opts) {
      if (!id) {
        printError('Suggestion ID is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      if (mode === 'rest') {
        await db.updateDoc(`suggested_services/${id}`, { status: 'rejected' });
      } else {
        const { db: g } = initFirebase();
        await g.collection('suggested_services').doc(id).update({ status: 'rejected' });
      }
      print(opts.json ? { success: true, id } : `Rejected suggestion ${id}`, opts.json);
    });
}
