import { initFirebase } from '../auth.js';
import { print, printError, formatTable } from '../lib/output.js';
import { serializeDoc } from '../lib/firestore.js';

const FIND_CONTACT_PROMPT = (businessName, categories, address) => {
  const catStr = Array.isArray(categories) ? categories.join(', ') : categories || '';
  return `You are a research assistant tasked with finding official contact information for a local business in Scarsdale or Westchester County, NY.

Business: "${businessName}"
Categories: "${catStr}"
Location: "${address || 'Scarsdale area'}"

GOAL:
Find the single BEST phone number and single BEST email address for this business using Google Search.
Verify that the contact info belongs to this specific business.

OUTPUT FORMAT:
Respond with strictly valid JSON:
{
  "phone": { 
    "value": "string (formatted phone number)", 
    "confidence": "High" | "Medium" | "Low",
    "source": "string (URL or description of where found)",
    "verification_text": "string (optional)"
  } | null,
  "email": { 
    "value": "string (email address)", 
    "confidence": "High" | "Medium" | "Low",
    "source": "string (URL or description of where found)",
    "verification_text": "string (optional)"
  } | null
}

RULES:
- Only provide "High" confidence if found on the business's own website or verified Google Business profile.
- Prefer local (914) numbers over 800 numbers.
- If you cannot find a reliable value, return null.`;
};

function extractJson(str) {
  const match = str.match(/```json\n?([\s\S]+?)\n?```/);
  if (match && match[1]) return match[1].trim();
  const brace = str.indexOf('{');
  if (brace >= 0) {
    let depth = 0;
    let end = -1;
    for (let i = brace; i < str.length; i++) {
      if (str[i] === '{') depth++;
      if (str[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end >= 0) return str.slice(brace, end + 1);
  }
  return str;
}

/**
 * @param {import('commander').Command} program
 */
export function registerCleanupCommands(program) {
  const cleanup = program.command('cleanup').description('Data cleanup utilities');

  cleanup
    .command('list')
    .description('List services missing phone number')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const { db } = initFirebase();
      const snap = await db.collection('services').get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => !s.phone);

      if (opts.json) {
        const out = list.map((s) => serializeDoc(s));
        print({ services: out, count: out.length }, true);
        return;
      }

      const rows = list.map((s) => {
        const name = (s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim() || '—').slice(0, 32);
        const cats = s.categories || (s.category ? [s.category] : []);
        const categories = cats.slice(0, 2).join(', ') + (cats.length > 2 ? '…' : '') || '—';
        return { name, categories };
      });
      print(formatTable(rows, [
        { key: 'name', header: 'Service', maxWidth: 34 },
        { key: 'categories', header: 'Categories', maxWidth: 28 },
      ]));
    });

  cleanup
    .command('search-contact <serviceId>')
    .description('Search for contact info for a service (requires GEMINI_API_KEY)')
    .option('--json', 'Output as JSON')
    .action(async (serviceId, opts) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        printError('GEMINI_API_KEY is required for search-contact');
        process.exit(2);
      }
      const { db } = initFirebase();
      const doc = await db.collection('services').doc(serviceId).get();
      if (!doc.exists) {
        printError('Service not found');
        process.exit(1);
      }
      const s = doc.data();
      const name = s.businessName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
      const cats = s.categories || s.category;

      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        tools: [{ googleSearch: {} }],
      });

      const prompt = FIND_CONTACT_PROMPT(name, cats, 'Scarsdale, NY');
      const result = await model.generateContent(prompt);
      const text = (result.response && typeof result.response.text === 'function')
        ? result.response.text()
        : '';
      const cleanJson = extractJson(text);
      let parsed;
      try {
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        printError('Failed to parse AI response');
        if (opts.json) print({ error: 'Parse failed', raw: text }, true);
        else console.error(text);
        process.exit(1);
      }

      if (opts.json) {
        print({ serviceId, phone: parsed.phone, email: parsed.email }, true);
        return;
      }
      const fmt = (x) => (x && x.value ? `${x.value} (${x.confidence || '?'})` : '—');
      const lines = [
        `Service: ${serviceId}`,
        `Phone:  ${fmt(parsed.phone)}`,
        `Email:  ${fmt(parsed.email)}`,
      ];
      print(lines.join('\n'));
    });

  cleanup
    .command('accept-contact <serviceId> <field> <value>')
    .description('Save phone or email to a service (field: phone or email)')
    .option('-y, --yes', 'Skip confirmation')
    .option('--json', 'Output as JSON')
    .action(async (serviceId, field, value, opts) => {
      if (!['phone', 'email'].includes(field)) {
        printError('Field must be phone or email');
        process.exit(1);
      }
      const { db } = initFirebase();
      const ref = db.collection('services').doc(serviceId);
      const doc = await ref.get();
      if (!doc.exists) {
        printError('Service not found');
        process.exit(1);
      }
      await ref.update({ [field]: value });
      print(opts.json ? { success: true, serviceId, [field]: value } : `Updated ${field} for ${serviceId}`, opts.json);
    });
}
