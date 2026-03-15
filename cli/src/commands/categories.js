import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { getCategoryGroups, getCategoriesList, FieldValue } from '../lib/firestore.js';

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
    .action(async (opts) => {
      const { db } = initFirebase();
      const [cats, { groups }] = await Promise.all([getCategoriesList(db), getCategoryGroups(db)]);
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
    .action(async (name, opts) => {
      if (!name?.trim()) {
        printError('Category name is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const [cats, { groups }] = await Promise.all([getCategoriesList(db), getCategoryGroups(db)]);
      if (cats.includes(name)) {
        printError('Category already exists');
        process.exit(1);
      }
      const newCats = [...cats, name].sort();
      await db.collection('config').doc('categories').set({ list: newCats });
      if (opts.group) {
        const g = groups[opts.group] || [];
        g.push(name);
        g.sort();
        groups[opts.group] = g;
        await db.collection('config').doc('categoryGroups').set({ groups });
      }
      print(opts.json ? { success: true, name } : `Added category ${name}`, opts.json);
    });

  cat
    .command('edit <oldName> <newName>')
    .description('Rename a category')
    .option('-g, --group <group>', 'Assign to group (or ungroup if empty)')
    .option('--json', 'Output as JSON')
    .action(async (oldName, newName, opts) => {
      if (!oldName?.trim() || !newName?.trim()) {
        printError('Old and new names are required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const [cats, { groups }] = await Promise.all([getCategoriesList(db), getCategoryGroups(db)]);
      if (!cats.includes(oldName)) {
        printError('Category not found');
        process.exit(1);
      }
      if (oldName !== newName && cats.includes(newName)) {
        printError('Target category already exists');
        process.exit(1);
      }

      if (oldName !== newName) {
        const snap = await db.collection('services').where('categories', 'array-contains', oldName).get();
        const batchSize = 400;
        let batch = db.batch();
        let i = 0;
        for (const doc of snap.docs) {
          const data = doc.data();
          const catsArr = data.categories || (data.category ? [data.category] : []);
          const newCatsArr = [...new Set(catsArr.map((c) => (c === oldName ? newName : c)))];
          batch.update(doc.ref, { categories: newCatsArr });
          i++;
          if (i % batchSize === 0) {
            await batch.commit();
            batch = db.batch();
          }
        }
        if (i % batchSize !== 0) await batch.commit();

        for (const arr of Object.values(groups)) {
          const idx = arr.indexOf(oldName);
          if (idx !== -1) arr.splice(idx, 1, newName);
        }
        const newList = cats.filter((c) => c !== oldName);
        newList.push(newName);
        newList.sort();
        await db.collection('config').doc('categories').set({ list: newList });
        await db.collection('config').doc('categoryGroups').set({ groups });
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
        await db.collection('config').doc('categoryGroups').set({ groups });
      }
      print(opts.json ? { success: true, oldName, newName } : `Updated category ${oldName} -> ${newName}`, opts.json);
    });

  cat
    .command('delete <name>')
    .description('Delete a category')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (name, opts) => {
      if (!name?.trim()) {
        printError('Category name is required');
        process.exit(1);
      }
      const { db } = initFirebase();
      const [cats, { groups }] = await Promise.all([getCategoriesList(db), getCategoryGroups(db)]);
      const snap = await db.collection('services').where('categories', 'array-contains', name).get();
      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.update(doc.ref, { categories: FieldValue.arrayRemove(name) });
      }
      await batch.commit();
      const newList = cats.filter((c) => c !== name);
      await db.collection('config').doc('categories').set({ list: newList });
      for (const arr of Object.values(groups)) {
        const idx = arr.indexOf(name);
        if (idx !== -1) arr.splice(idx, 1);
      }
      await db.collection('config').doc('categoryGroups').set({ groups });
      print(opts.json ? { success: true, name } : `Deleted category ${name}`, opts.json);
    });

  cat
    .command('merge')
    .description('Merge source category into destination and delete source')
    .requiredOption('-s, --source <name>', 'Source category (to be deleted)')
    .requiredOption('-d, --dest <name>', 'Destination category')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const source = opts.source;
      const dest = opts.dest;
      if (source === dest) {
        printError('Source and destination cannot be the same');
        process.exit(1);
      }
      const [cats, { groups }] = await Promise.all([getCategoriesList(db), getCategoryGroups(db)]);
      if (!cats.includes(source)) {
        printError('Source category not found');
        process.exit(1);
      }
      if (!cats.includes(dest)) {
        printError('Destination category not found');
        process.exit(1);
      }

      const snap = await db.collection('services').where('categories', 'array-contains', source).get();
      const batchSize = 400;
      let batch = db.batch();
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
          batch = db.batch();
        }
      }
      if (i % batchSize !== 0) await batch.commit();

      const newList = cats.filter((c) => c !== source);
      await db.collection('config').doc('categories').set({ list: newList });
      for (const arr of Object.values(groups)) {
        const idx = arr.indexOf(source);
        if (idx !== -1) arr.splice(idx, 1);
      }
      await db.collection('config').doc('categoryGroups').set({ groups });
      print(opts.json ? { success: true, source, dest, servicesMoved: snap.size } : `Merged ${source} into ${dest} (${snap.size} services)`, opts.json);
    });
}
