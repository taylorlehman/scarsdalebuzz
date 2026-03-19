import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { getCategoryGroups, getCategoriesList } from '../lib/firestore.js';
import { getDb, fromDoc } from '../lib/db.js';
import { getJsonFlag } from '../lib/flags.js';

/**
 * @param {import('commander').Command} program
 */
export function registerGroupsCommands(program) {
  const grp = program.command('groups').description('Category group management');

  grp
    .command('list')
    .description('List category groups')
    .option('-q, --search <query>', 'Search groups')
    .option('--json', 'Output as JSON')
    .action(async function (opts) {
      const { mode, db } = getDb(this);
      const useJson = getJsonFlag(this, opts);
      let groups;
      if (mode === 'rest') {
        const grpDoc = await db.getDoc('config/categoryGroups');
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        groups = (await getCategoryGroups(g)).groups;
      }
      let list = Object.entries(groups).map(([name, cats]) => ({ name, categories: cats }));
      if (opts.search) {
        const q = opts.search.toLowerCase();
        list = list.filter((g) => g.name.toLowerCase().includes(q));
      }

      if (useJson) {
        print({ groups: list, count: list.length }, true);
        return;
      }

      const rows = list.map((g) => ({
        name: g.name,
        count: String((g.categories || []).length),
      }));
      print(formatTable(rows, [
        { key: 'name', header: 'Group' },
        { key: 'count', header: 'Categories' },
      ]));
    });

  grp
    .command('add <name>')
    .description('Add a group')
    .option('-c, --categories <cats>', 'Comma-separated category names')
    .option('--json', 'Output as JSON')
    .action(async function (name, opts) {
      if (!name?.trim()) {
        printError('Group name is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let groups;
      if (mode === 'rest') {
        const grpDoc = await db.getDoc('config/categoryGroups');
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        groups = (await getCategoryGroups(g)).groups;
      }
      if (groups[name]) {
        printError('Group already exists');
        process.exit(1);
      }
      const categories = opts.categories ? opts.categories.split(',').map((c) => c.trim()).filter(Boolean) : [];
      groups[name] = [...new Set(categories)].sort();
      if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categoryGroups').set({ groups });
      }

      const cats = mode === 'rest'
        ? ((fromDoc(await db.getDoc('config/categories') || {})?.list) || []).slice().sort()
        : await getCategoriesList(initFirebase().db);
      const union = [...new Set([...cats, ...groups[name]])].sort();
      if (mode === 'rest') await db.setDoc('config/categories', { list: union }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categories').set({ list: union });
      }

      print(opts.json ? { success: true, name } : `Added group ${name}`, opts.json);
    });

  grp
    .command('edit <name>')
    .description('Edit a group')
    .option('-n, --new-name <name>', 'Rename group')
    .option('-c, --categories <cats>', 'Comma-separated category names (replaces)')
    .option('--json', 'Output as JSON')
    .action(async function (name, opts) {
      if (!name?.trim()) {
        printError('Group name is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let groups;
      if (mode === 'rest') {
        const grpDoc = await db.getDoc('config/categoryGroups');
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        groups = (await getCategoryGroups(g)).groups;
      }
      if (!groups[name]) {
        printError('Group not found');
        process.exit(1);
      }
      const newName = opts.newName?.trim();
      const categories = opts.categories ? opts.categories.split(',').map((c) => c.trim()).filter(Boolean) : groups[name];

      if (newName && newName !== name) {
        if (groups[newName]) {
          printError('Target group name already exists');
          process.exit(1);
        }
        groups[newName] = [...new Set(categories)].sort();
        delete groups[name];
      } else {
        groups[name] = [...new Set(categories)].sort();
      }
      if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categoryGroups').set({ groups });
      }

      const existingCats = mode === 'rest'
        ? ((fromDoc(await db.getDoc('config/categories') || {})?.list) || []).slice().sort()
        : await getCategoriesList(initFirebase().db);
      const allCats = new Set(existingCats);
      Object.values(groups).flat().forEach((c) => allCats.add(c));
      if (mode === 'rest') await db.setDoc('config/categories', { list: [...allCats].sort() }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categories').set({ list: [...allCats].sort() });
      }

      print(opts.json ? { success: true, name: newName || name } : `Updated group ${name}`, opts.json);
    });

  grp
    .command('delete <name>')
    .description('Delete a group (must have no categories)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async function (name, opts) {
      if (!name?.trim()) {
        printError('Group name is required');
        process.exit(1);
      }
      const { mode, db } = getDb(this);
      let groups;
      if (mode === 'rest') {
        const grpDoc = await db.getDoc('config/categoryGroups');
        groups = (fromDoc(grpDoc || {})?.groups || {});
      } else {
        const { db: g } = initFirebase();
        groups = (await getCategoryGroups(g)).groups;
      }
      if (!groups[name]) {
        printError('Group not found');
        process.exit(1);
      }
      if ((groups[name] || []).length > 0) {
        printError('Cannot delete group with categories. Remove categories first.');
        process.exit(1);
      }
      delete groups[name];
      if (mode === 'rest') await db.setDoc('config/categoryGroups', { groups }, { merge: false });
      else {
        const { db: gdb } = initFirebase();
        await gdb.collection('config').doc('categoryGroups').set({ groups });
      }
      print(opts.json ? { success: true, name } : `Deleted group ${name}`, opts.json);
    });
}
