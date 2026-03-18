import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { getCategoryGroups, getCategoriesList, FieldValue } from '../lib/firestore.js';
import { getDb, fromDoc } from '../lib/db.js';

/**
 * @param {import('commander').Command} program
 */
export function registerCategoriesCommands(program) {
  const cat = program.command('categories').description('Category management');

  cat
    .command('list')
    .description('List categories')
    .option('-q, --search <query>', 'Search categories')
    .option('--json', 'Output as JSON')
    .action(async function (opts) {
      const { mode, db } = getDb(this);
      let cats, groups;
      if (mode === 'rest') {
        const catDoc = await db.getDoc('config/categories');
        const grpDoc = await db.getDoc('config/categoryGroups');
        cats = (fromDoc(catDoc || {})?.list || []).slice().sort();
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        const [c, g2] = await Promise.all([getCategoriesList(g), getCategoryGroups(g)]);
        cats = c;
        groups = g2.groups;
      }
      let list = cats.map((name) => {
        let group = '-';
        for (const [g, arr] of Object.entries(groups)) {
          if (arr.includes(name)) {
            group = g;
            break;
          }
        }
        return { name, group };
      });
      if (opts.search) {
        const q = opts.search.toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(q));
      }

      if (opts.json) {
        print({ categories: list, count: list.length }, true);
        return;
      }
      print(formatTable(list, [
        { key: 'name', header: 'Category' },
        { key: 'group', header: 'Group' },
      ]));
    });

  cat
    .command('add <name>')
    .description('Add a category')
    .option('-g, --group <group>', 'Assign to group')
    .option('--json', 'Output as JSON')
    .action(async function (name, opts) {
      if (!name?.trim()) {
        printError('Category name is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let cats, groups;
      if (mode === 'rest') {
        const catDoc = await db.getDoc('config/categories');
        const grpDoc = await db.getDoc('config/categoryGroups');
        cats = (fromDoc(catDoc || {})?.list || []).slice().sort();
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        const [c, g2] = await Promise.all([getCategoriesList(g), getCategoryGroups(g)]);
        cats = c;
        groups = g2.groups;
      }
      if (cats.includes(name)) {
        printError('Category already exists');
        process.exit(1);
      }
      const newCats = [...cats, name].sort();
      if (mode === 'rest') await db.setDoc('config/categories', { list: newCats }, { merge: false });
      else {
        const { db: g } = initFirebase();
        await g.collection('config').doc('categories').set({ list: newCats });
      }
      if (opts.group) {
        const g = groups[opts.group] || [];
        g.push(name);
        g.sort();
        groups[opts.group] = g;
        if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
        else {
          const { db: gdb } = initFirebase();
          await gdb.collection('config').doc('categoryGroups').set({ groups });
        }
      }
      print(opts.json ? { success: true, name } : `Added category ${name}`, opts.json);
    });

  cat
    .command('edit <oldName> <newName>')
    .description('Rename a category')
    .option('-g, --group <group>', 'Assign to group (or ungroup if empty)')
    .option('--json', 'Output as JSON')
    .action(async function (oldName, newName, opts) {
      if (!oldName?.trim() || !newName?.trim()) {
        printError('Old and new names are required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let cats, groups;
      if (mode === 'rest') {
        const catDoc = await db.getDoc('config/categories');
        const grpDoc = await db.getDoc('config/categoryGroups');
        cats = (fromDoc(catDoc || {})?.list || []).slice().sort();
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        const [c, g2] = await Promise.all([getCategoriesList(g), getCategoryGroups(g)]);
        cats = c;
        groups = g2.groups;
      }
      if (!cats.includes(oldName)) {
        printError('Category not found');
        process.exit(1);
      }
      if (oldName !== newName && cats.includes(newName)) {
        printError('Target category already exists');
        process.exit(1);
      }

      if (oldName !== newName) {
        if (mode === 'rest') {
          const docs = await db.runQuery({
            from: [{ collectionId: 'services' }],
            where: { fieldFilter: { field: { fieldPath: 'categories' }, op: 'ARRAY_CONTAINS', value: { stringValue: oldName } } },
          });
          for (const doc of docs) {
            const s = fromDoc(doc);
            const catsArr = s.categories || (s.category ? [s.category] : []);
            const newCatsArr = [...new Set(catsArr.map((c) => (c === oldName ? newName : c)))];
            await db.updateDoc(`services/${s.id}`, { categories: newCatsArr });
          }
        } else {
          const { db: g } = initFirebase();
          const snap = await g.collection('services').where('categories', 'array-contains', oldName).get();
          const batchSize = 400;
          let batch = g.batch();
          let i = 0;
          for (const doc of snap.docs) {
            const data = doc.data();
            const catsArr = data.categories || (data.category ? [data.category] : []);
            const newCatsArr = [...new Set(catsArr.map((c) => (c === oldName ? newName : c)))];
            batch.update(doc.ref, { categories: newCatsArr });
            i++;
            if (i % batchSize === 0) {
              await batch.commit();
              batch = g.batch();
            }
          }
          if (i % batchSize !== 0) await batch.commit();
        }

        for (const arr of Object.values(groups)) {
          const idx = arr.indexOf(oldName);
          if (idx !== -1) arr.splice(idx, 1, newName);
        }
        const newList = cats.filter((c) => c !== oldName);
        newList.push(newName);
        newList.sort();
        if (mode === 'rest') {
          await db.setDoc('config/categories', { list: newList }, { merge: false });
          await db.setDoc('config/categoryGroups', { groups }, { merge: false });
        } else {
          const { db: gdb } = initFirebase();
          await gdb.collection('config').doc('categories').set({ list: newList });
          await gdb.collection('config').doc('categoryGroups').set({ groups });
        }
      } else if (opts.group !== undefined) {
        for (const arr of Object.values(groups)) {
          const idx = arr.indexOf(newName);
          if (idx !== -1) arr.splice(idx, 1);
        }
        if (opts.group) {
          groups[opts.group] = groups[opts.group] || [];
          if (!groups[opts.group].includes(newName)) groups[opts.group].push(newName);
          groups[opts.group].sort();
        }
        if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
        else {
          const { db: gdb } = initFirebase();
          await gdb.collection('config').doc('categoryGroups').set({ groups });
        }
      }
      print(opts.json ? { success: true, oldName, newName } : `Updated category ${oldName} -> ${newName}`, opts.json);
    });

  cat
    .command('delete <name>')
    .description('Delete a category')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async function (name, opts) {
      if (!name?.trim()) {
        printError('Category name is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let cats, groups;
      if (mode === 'rest') {
        const catDoc = await db.getDoc('config/categories');
        const grpDoc = await db.getDoc('config/categoryGroups');
        cats = (fromDoc(catDoc || {})?.list || []).slice().sort();
        groups = (fromDoc(grpDoc || {})?.groups || {});
        const docs = await db.runQuery({
          from: [{ collectionId: 'services' }],
          where: { fieldFilter: { field: { fieldPath: 'categories' }, op: 'ARRAY_CONTAINS', value: { stringValue: name } } },
        });
        for (const doc of docs) {
          const s = fromDoc(doc);
          const catsArr = (s.categories || []).filter((c) => c !== name);
          await db.updateDoc(`services/${s.id}`, { categories: catsArr });
        }
      } else {
        const { db: g } = initFirebase();
        const [c, g2] = await Promise.all([getCategoriesList(g), getCategoryGroups(g)]);
        cats = c;
        groups = g2.groups;
        const snap = await g.collection('services').where('categories', 'array-contains', name).get();
        const batch = g.batch();
        for (const doc of snap.docs) {
          batch.update(doc.ref, { categories: FieldValue.arrayRemove(name) });
        }
        await batch.commit();
      }
      const newList = cats.filter((c) => c !== name);
      if (mode === 'rest') await db.setDoc('config/categories', { list: newList }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categories').set({ list: newList });
      }
      for (const arr of Object.values(groups)) {
        const idx = arr.indexOf(name);
        if (idx !== -1) arr.splice(idx, 1);
      }
      if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categoryGroups').set({ groups });
      }
      print(opts.json ? { success: true, name } : `Deleted category ${name}`, opts.json);
    });

  cat
    .command('merge')
    .description('Merge source category into destination and delete source')
    .requiredOption('-s, --source <name>', 'Source category (to be deleted)')
    .requiredOption('-d, --dest <name>', 'Destination category')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async function (opts) {
      const { mode, db } = getDb(this);
      const source = opts.source;
      const dest = opts.dest;
      if (source === dest) {
        printError('Source and destination cannot be the same');
        process.exit(1);
      }
      let cats, groups;
      if (mode === 'rest') {
        const catDoc = await db.getDoc('config/categories');
        const grpDoc = await db.getDoc('config/categoryGroups');
        cats = (fromDoc(catDoc || {})?.list || []).slice().sort();
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        const [c, g2] = await Promise.all([getCategoriesList(g), getCategoryGroups(g)]);
        cats = c;
        groups = g2.groups;
      }
      if (!cats.includes(source)) {
        printError('Source category not found');
        process.exit(1);
      }
      if (!cats.includes(dest)) {
        printError('Destination category not found');
        process.exit(1);
      }

      let moved = 0;
      if (mode === 'rest') {
        const docs = await db.runQuery({
          from: [{ collectionId: 'services' }],
          where: { fieldFilter: { field: { fieldPath: 'categories' }, op: 'ARRAY_CONTAINS', value: { stringValue: source } } },
        });
        moved = docs.length;
        for (const doc of docs) {
          const s = fromDoc(doc);
          const catsArr = s.categories || (s.category ? [s.category] : []);
          const newCatsArr = [...new Set([...catsArr.filter((c) => c !== source), dest])];
          const upd = { categories: newCatsArr };
          if (s.category === source) upd.category = dest;
          await db.updateDoc(`services/${s.id}`, upd);
        }
      } else {
        const { db: g } = initFirebase();
        const snap = await g.collection('services').where('categories', 'array-contains', source).get();
        moved = snap.size;
        const batchSize = 400;
        let batch = g.batch();
        let i = 0;
        for (const doc of snap.docs) {
          const data = doc.data();
          const catsArr = data.categories || (data.category ? [data.category] : []);
          const newCatsArr = [...new Set([...catsArr.filter((c) => c !== source), dest])];
          batch.update(doc.ref, { categories: newCatsArr });
          if (data.category === source) {
            batch.update(doc.ref, { category: dest });
          }
          i++;
          if (i % batchSize === 0) {
            await batch.commit();
            batch = g.batch();
          }
        }
        if (i % batchSize !== 0) await batch.commit();
      }

      const newList = cats.filter((c) => c !== source);
      if (mode === 'rest') await db.setDoc('config/categories', { list: newList }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categories').set({ list: newList });
      }
      for (const arr of Object.values(groups)) {
        const idx = arr.indexOf(source);
        if (idx !== -1) arr.splice(idx, 1);
      }
      if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categoryGroups').set({ groups });
      }
      print(opts.json ? { success: true, source, dest, servicesMoved: moved } : `Merged ${source} into ${dest} (${moved} services)`, opts.json);
    });
}
