/**
 * Persistence for the OAuth authorization server.
 *
 * Every record carries an `expireAt` Date; Firestore TTL policies on that field
 * (see firestore.indexes.json) garbage-collect expired documents, and readers
 * treat anything past `expireAt` as absent. Codes and tokens are keyed by the
 * SHA-256 of their value, so a database leak does not leak usable credentials.
 *
 * The collections are only reachable through the Admin SDK: firestore.rules
 * falls through to the default deny for them.
 */

export const COLLECTIONS = Object.freeze({
  clients: 'mcp_oauth_clients',
  requests: 'mcp_oauth_requests',
  codes: 'mcp_oauth_codes',
  tokens: 'mcp_oauth_tokens',
});

function isLive(record, now = Date.now()) {
  return !!record && toMillis(record.expireAt) > now;
}

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  return new Date(value).getTime();
}

/**
 * Normalizes Firestore Timestamps to Dates so callers see one shape.
 * @param {FirebaseFirestore.DocumentSnapshot} snap
 */
function fromSnap(snap) {
  if (!snap.exists) return null;
  const data = snap.data();
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toDate === 'function') data[k] = v.toDate();
  }
  return data;
}

export class FirestoreOAuthStore {
  /** @param {FirebaseFirestore.Firestore} db */
  constructor(db) {
    this.db = db;
  }

  async getClient(clientId) {
    return fromSnap(await this.db.collection(COLLECTIONS.clients).doc(clientId).get());
  }

  async createClient(client) {
    await this.db.collection(COLLECTIONS.clients).doc(client.client_id).create(client);
  }

  async putRequest(id, request) {
    await this.db.collection(COLLECTIONS.requests).doc(id).set(request);
  }

  async getRequest(id) {
    const record = fromSnap(await this.db.collection(COLLECTIONS.requests).doc(id).get());
    return isLive(record) ? record : null;
  }

  /** Atomically reads and deletes a pending authorization request. */
  async takeRequest(id) {
    const ref = this.db.collection(COLLECTIONS.requests).doc(id);
    return this.db.runTransaction(async (tx) => {
      const record = fromSnap(await tx.get(ref));
      if (!record) return null;
      tx.delete(ref);
      return isLive(record) ? record : null;
    });
  }

  async putCode(hash, code) {
    await this.db.collection(COLLECTIONS.codes).doc(hash).create(code);
  }

  async consumeCode(hash) {
    return this.#consume(this.db.collection(COLLECTIONS.codes).doc(hash));
  }

  async putToken(hash, token) {
    await this.db.collection(COLLECTIONS.tokens).doc(hash).create(token);
  }

  async getToken(hash) {
    const record = fromSnap(await this.db.collection(COLLECTIONS.tokens).doc(hash).get());
    return isLive(record) ? record : null;
  }

  async consumeRefreshToken(hash) {
    return this.#consume(this.db.collection(COLLECTIONS.tokens).doc(hash));
  }

  async deleteToken(hash) {
    await this.db.collection(COLLECTIONS.tokens).doc(hash).delete();
  }

  /** Revokes every token descended from one authorization (used on replay detection). */
  async revokeGrant(grantId) {
    const snap = await this.db.collection(COLLECTIONS.tokens).where('grantId', '==', grantId).get();
    const writer = this.db.bulkWriter();
    snap.docs.forEach((d) => writer.delete(d.ref));
    await writer.close();
  }

  /**
   * Marks a single-use record as used and returns it. A second consumer gets
   * `{ reused: true }` so the caller can treat it as a replay.
   * @returns {Promise<{ record: object, reused: boolean } | null>}
   */
  async #consume(ref) {
    return this.db.runTransaction(async (tx) => {
      const record = fromSnap(await tx.get(ref));
      if (!isLive(record)) return null;
      if (record.usedAt) return { record, reused: true };
      tx.update(ref, { usedAt: new Date() });
      return { record, reused: false };
    });
  }
}

/** In-memory implementation with identical semantics, for tests and local dev. */
export class MemoryOAuthStore {
  clients = new Map();
  requests = new Map();
  codes = new Map();
  tokens = new Map();

  async getClient(clientId) {
    return structuredClone(this.clients.get(clientId) ?? null);
  }

  async createClient(client) {
    if (this.clients.has(client.client_id)) throw new Error('client exists');
    this.clients.set(client.client_id, structuredClone(client));
  }

  async putRequest(id, request) {
    this.requests.set(id, structuredClone(request));
  }

  async getRequest(id) {
    const record = this.requests.get(id);
    return isLive(record) ? structuredClone(record) : null;
  }

  async takeRequest(id) {
    const record = this.requests.get(id);
    this.requests.delete(id);
    return isLive(record) ? structuredClone(record) : null;
  }

  async putCode(hash, code) {
    this.codes.set(hash, structuredClone(code));
  }

  async consumeCode(hash) {
    return this.#consume(this.codes, hash);
  }

  async putToken(hash, token) {
    this.tokens.set(hash, structuredClone(token));
  }

  async getToken(hash) {
    const record = this.tokens.get(hash);
    return isLive(record) ? structuredClone(record) : null;
  }

  async consumeRefreshToken(hash) {
    return this.#consume(this.tokens, hash);
  }

  async deleteToken(hash) {
    this.tokens.delete(hash);
  }

  async revokeGrant(grantId) {
    for (const [hash, token] of this.tokens) {
      if (token.grantId === grantId) this.tokens.delete(hash);
    }
  }

  #consume(map, hash) {
    const record = map.get(hash);
    if (!isLive(record)) return null;
    if (record.usedAt) return { record: structuredClone(record), reused: true };
    record.usedAt = new Date();
    return { record: structuredClone(record), reused: false };
  }
}
