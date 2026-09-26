/**
 * Reads directory data from Firestore using the same documents the website
 * uses:
 *   services/{id}                          providers
 *   services/{id}/recommendations/{uid}    a user's saved ("recommended") providers
 *   config/categories      { list: string[] }
 *   config/categoryGroups  { groups: { [group]: string[] } }
 *
 * The directory is small and changes rarely, so shared data is cached in
 * memory briefly to keep per-request Firestore reads low.
 */

const CACHE_TTL_MS = 60_000;

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class FirestoreDirectorySource {
  /** @param {FirebaseFirestore.Firestore} db */
  constructor(db, { ttlMs = CACHE_TTL_MS } = {}) {
    this.db = db;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async #cached(key, load) {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await load();
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  /** @returns {Promise<object[]>} raw service records with `id` */
  getServices() {
    return this.#cached('services', async () => {
      const snap = await this.db.collection('services').get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
  }

  /** @returns {Promise<string[]>} */
  getCategories() {
    return this.#cached('categories', async () => {
      const snap = await this.db.collection('config').doc('categories').get();
      const list = snap.exists ? snap.data().list : [];
      return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : [];
    });
  }

  /** @returns {Promise<Record<string, string[]>>} */
  getCategoryGroups() {
    return this.#cached('categoryGroups', async () => {
      const snap = await this.db.collection('config').doc('categoryGroups').get();
      const groups = snap.exists ? snap.data().groups : {};
      return groups && typeof groups === 'object' ? groups : {};
    });
  }

  /**
   * The user's saved providers, newest first. Mirrors public/recommendations.js.
   * Never cached: it is per-user and should reflect changes immediately.
   * @returns {Promise<{ serviceId: string, savedAt: string | null }[]>}
   */
  async getSavedProviderRefs(uid) {
    const snap = await this.db
      .collectionGroup('recommendations')
      .where('uid', '==', uid)
      .orderBy('timestamp', 'desc')
      .get();
    return snap.docs
      .filter((d) => d.ref.parent?.parent)
      .map((d) => ({ serviceId: d.ref.parent.parent.id, savedAt: toIso(d.data().timestamp) }));
  }
}

/** In-memory source for tests and local development. */
export class MemoryDirectorySource {
  constructor({ services = [], categories = [], categoryGroups = {}, saved = {} } = {}) {
    this.services = services;
    this.categories = categories;
    this.categoryGroups = categoryGroups;
    this.saved = saved;
  }

  async getServices() {
    return this.services;
  }

  async getCategories() {
    return this.categories;
  }

  async getCategoryGroups() {
    return this.categoryGroups;
  }

  async getSavedProviderRefs(uid) {
    return (this.saved[uid] || []).map((r) => ({ serviceId: r.serviceId, savedAt: toIso(r.savedAt) }));
  }
}

export { toIso };
