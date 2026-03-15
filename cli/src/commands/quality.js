import { initFirebase } from '../auth.js';
import { print, printError } from '../lib/output.js';
import { getCategoriesList } from '../lib/firestore.js';

/**
 * @param {import('commander').Command} program
 */
export function registerQualityCommands(program) {
  const qual = program.command('quality').description('Data quality dashboard');

  qual
    .command('dashboard')
    .description('Show data quality overview')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const [servicesSnap, categoriesList] = await Promise.all([
        db.collection('services').get(),
        getCategoriesList(db),
      ]);
      const allServices = servicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const total = allServices.length;
      const missingContact = allServices.filter((s) => !s.phone && !s.email);
      const sunnyApproved = allServices.filter((s) => s.sunnyApproved);
      const missingPct = total > 0 ? Math.round((missingContact.length / total) * 100) : 0;
      const sunnyPct = total > 0 ? Math.round((sunnyApproved.length / total) * 100) : 0;

      const catStats = {};
      categoriesList.forEach((c) => {
        catStats[c] = { name: c, total: 0, withContact: 0 };
      });
      allServices.forEach((s) => {
        const cats = s.categories || (s.category ? [s.category] : []);
        const cat = cats[0] || 'Uncategorized';
        if (!catStats[cat]) catStats[cat] = { name: cat, total: 0, withContact: 0 };
        catStats[cat].total++;
        if (s.phone || s.email) catStats[cat].withContact++;
      });

      const catArray = Object.values(catStats).map((c) => ({
        ...c,
        completeness: c.total > 0 ? (c.withContact / c.total) * 100 : 0,
      }));

      const mostComplete = catArray
        .filter((c) => c.total > 2)
        .sort((a, b) => b.completeness - a.completeness || b.total - a.total)
        .slice(0, 10);
      const leastComplete = catArray
        .filter((c) => c.total > 0)
        .sort((a, b) => a.completeness - b.completeness || b.total - a.total)
        .slice(0, 10);
      const smallest = [...catArray].sort((a, b) => a.total - b.total).slice(0, 5);

      const out = {
        totalServices: total,
        missingContact: { count: missingContact.length, percent: missingPct },
        sunnyApproved: { count: sunnyApproved.length, percent: sunnyPct },
        mostComplete,
        leastComplete,
        smallest,
      };
      print(opts.json ? out : formatDashboard(out), opts.json);
    });
}

function formatDashboard(d) {
  const lines = [
    `Total Services: ${d.totalServices}`,
    `Missing Contact: ${d.missingContact.percent}% (${d.missingContact.count} providers)`,
    `Sunny Approved: ${d.sunnyApproved.percent}% (${d.sunnyApproved.count} providers)`,
    '',
    'Most Complete:',
    ...d.mostComplete.map((c) => `  ${c.name}: ${Math.round(c.completeness)}% (${c.withContact}/${c.total})`),
    '',
    'Least Complete:',
    ...d.leastComplete.map((c) => `  ${c.name}: ${Math.round(c.completeness)}% (${c.withContact}/${c.total})`),
    '',
    'Smallest Categories:',
    ...d.smallest.map((c) => `  ${c.name}: ${c.total}`),
  ];
  return lines.join('\n');
}
