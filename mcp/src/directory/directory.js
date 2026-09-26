/**
 * Directory queries backing the MCP tools. Pure logic over a directory source
 * (see source.js), so it can be tested without Firestore.
 */

import { toIso } from './source.js';

/** A user-facing problem the model can correct (e.g. unknown category). */
export class DirectoryError extends Error {}

const STOPWORDS = new Set(['the', 'and', 'of', 'inc', 'llc', 'co', 'corp', 'company', 'ltd']);

export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text) {
  const all = normalize(text).split(' ').filter(Boolean);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  return meaningful.length ? meaningful : all;
}

/** Edit distance counting adjacent transpositions as one edit ("drian" → "drain"). */
export function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** How closely a single query token matches a single name token (0..1). */
function tokenSimilarity(q, n) {
  if (q === n) return 1;
  if (n.startsWith(q) && q.length >= 2) return 0.85;
  const allowed = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0;
  if (allowed && editDistance(q, n, allowed) <= allowed) return 0.7;
  return 0;
}

/**
 * Scores how well `query` matches `name` (0-100). Handles exact names,
 * prefixes, substrings, word order and small typos.
 */
export function scoreName(query, name) {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.startsWith(q)) return 92;
  if (` ${n} `.includes(` ${q} `)) return 88;
  if (n.includes(q) && q.length >= 3) return 80;
  if (q.replace(/ /g, '') === n.replace(/ /g, '')) return 95;

  const qTokens = tokens(q);
  const nTokens = tokens(n);
  if (!qTokens.length || !nTokens.length) return 0;
  const sims = qTokens.map((qt) => Math.max(...nTokens.map((nt) => tokenSimilarity(qt, nt))));
  const matched = sims.filter((s) => s > 0).length;
  if (matched === 0) return 0;
  const avg = sims.reduce((a, b) => a + b, 0) / qTokens.length;
  if (matched === qTokens.length) return Math.round(45 + 30 * avg);
  // Partial matches only count when most of the query matched.
  return matched / qTokens.length >= 0.5 ? Math.round(40 * avg) : 0;
}

const MIN_SEARCH_SCORE = 40;

function categoriesOf(raw) {
  if (Array.isArray(raw.categories)) return raw.categories.filter((c) => typeof c === 'string' && c);
  return typeof raw.category === 'string' && raw.category ? [raw.category] : [];
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export class DirectoryService {
  /**
   * @param {import('./source.js').FirestoreDirectorySource} source
   * @param {{ origin: string }} options
   */
  constructor(source, { origin }) {
    this.source = source;
    this.origin = origin;
  }

  categoryUrl(category) {
    return `${this.origin}/directory/category/${encodeURIComponent(category)}`;
  }

  /** Public shape of a provider. Deliberately omits other members' identities (recentRecommenders). */
  toProvider(raw) {
    const businessName = nonEmpty(raw.businessName);
    const personName = nonEmpty([raw.firstName, raw.lastName].filter(Boolean).join(' '));
    const categories = categoriesOf(raw);
    return {
      id: raw.id,
      name: businessName || personName || 'Unnamed provider',
      businessName,
      contactName: businessName ? personName : null,
      phone: nonEmpty(raw.phone),
      email: nonEmpty(raw.email),
      categories,
      recommendationCount: Math.max(0, Number(raw.recommendations) || 0),
      lastRecommendedAt: toIso(raw.lastRecommended),
      sunnyApproved: raw.sunnyApproved === true,
      directoryUrl: categories.length ? this.categoryUrl(categories[0]) : `${this.origin}/directory/`,
    };
  }

  /** Visible providers, matching what the website lists (test providers hidden). */
  async #providers() {
    const services = await this.source.getServices();
    return services.filter((s) => !s.isTestProvider).map((s) => this.toProvider(s));
  }

  async searchProviders(query, limit) {
    if (!normalize(query)) throw new DirectoryError('Please provide a provider name to search for.');
    const providers = await this.#providers();
    const scored = providers
      .map((p) => ({
        provider: p,
        score: Math.max(scoreName(query, p.name), p.contactName ? scoreName(query, p.contactName) - 5 : 0),
      }))
      .filter((r) => r.score >= MIN_SEARCH_SCORE)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.provider.recommendationCount - a.provider.recommendationCount ||
          a.provider.name.localeCompare(b.provider.name),
      );
    return {
      query,
      totalMatches: scored.length,
      providers: scored.slice(0, limit).map((r) => r.provider),
    };
  }

  async getProvider(id) {
    const provider = (await this.#providers()).find((p) => p.id === id);
    if (!provider) throw new DirectoryError(`No provider found with id "${id}". Use search_providers to find one.`);
    return provider;
  }

  /** All category names: the configured list plus any in use by providers. */
  async #allCategories() {
    const [configured, providers] = await Promise.all([this.source.getCategories(), this.#providers()]);
    const counts = new Map(configured.map((c) => [c, 0]));
    for (const p of providers) for (const c of p.categories) counts.set(c, (counts.get(c) || 0) + 1);
    return counts;
  }

  async #groupOf() {
    const groups = await this.source.getCategoryGroups();
    const groupOf = new Map();
    for (const [group, cats] of Object.entries(groups)) {
      if (Array.isArray(cats)) for (const c of cats) if (!groupOf.has(c)) groupOf.set(c, group);
    }
    return { groups, groupOf };
  }

  async resolveCategory(input) {
    const counts = await this.#allCategories();
    const wanted = normalize(input);
    const names = [...counts.keys()];
    const exact = names.find((c) => normalize(c) === wanted);
    if (exact) return exact;

    const suggestions = names
      .map((c) => ({ c, s: scoreName(input, c) }))
      .filter((r) => r.s >= MIN_SEARCH_SCORE)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((r) => r.c);
    throw new DirectoryError(
      `Unknown category "${input}".` +
        (suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '') +
        ' Use list_categories to see all categories.',
    );
  }

  async listProvidersInCategory(categoryInput, { cursor, limit }) {
    const category = await this.resolveCategory(categoryInput);
    let offset = 0;
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded || decoded.category !== category) {
        throw new DirectoryError('Invalid cursor. Call list_providers_in_category again without a cursor.');
      }
      offset = decoded.offset;
    }

    const all = (await this.#providers())
      .filter((p) => p.categories.includes(category))
      .sort((a, b) => b.recommendationCount - a.recommendationCount || a.name.localeCompare(b.name));
    const page = all.slice(offset, offset + limit);
    const next = offset + limit < all.length ? encodeCursor({ category, offset: offset + limit }) : undefined;

    return {
      category,
      categoryUrl: this.categoryUrl(category),
      totalProviders: all.length,
      providers: page,
      ...(next ? { nextCursor: next } : {}),
    };
  }

  async listCategories({ group } = {}) {
    const [counts, { groups, groupOf }] = await Promise.all([this.#allCategories(), this.#groupOf()]);
    let categories = [...counts.entries()].map(([name, providerCount]) => ({
      name,
      group: groupOf.get(name) ?? null,
      providerCount,
    }));

    if (group !== undefined) {
      const match = Object.keys(groups).find((g) => normalize(g) === normalize(group));
      if (!match) {
        throw new DirectoryError(
          `Unknown category group "${group}". Available groups: ${Object.keys(groups).sort().join(', ')}.`,
        );
      }
      categories = categories.filter((c) => c.group === match);
    }

    categories.sort((a, b) => a.name.localeCompare(b.name));
    return { totalCategories: categories.length, categories };
  }

  async listCategoryGroups() {
    const [counts, { groups, groupOf }] = await Promise.all([this.#allCategories(), this.#groupOf()]);
    const result = Object.entries(groups)
      .map(([name, cats]) => ({
        name,
        categories: (Array.isArray(cats) ? [...cats] : []).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const ungroupedCategories = [...counts.keys()].filter((c) => !groupOf.has(c)).sort((a, b) => a.localeCompare(b));
    return { totalGroups: result.length, groups: result, ungroupedCategories };
  }

  async listSavedProviders(uid) {
    const [refs, providers] = await Promise.all([this.source.getSavedProviderRefs(uid), this.#providers()]);
    const byId = new Map(providers.map((p) => [p.id, p]));
    const saved = refs
      .filter((r) => byId.has(r.serviceId))
      .map((r) => ({ ...byId.get(r.serviceId), savedAt: r.savedAt }));
    return { totalSaved: saved.length, providers: saved };
  }
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify({ c: value.category, o: value.offset })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const { c, o } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof c !== 'string' || !Number.isInteger(o) || o < 0) return null;
    return { category: c, offset: o };
  } catch {
    return null;
  }
}
