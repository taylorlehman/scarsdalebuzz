import { getAccessToken, readServiceAccountMetadata } from './restAuth.js';
 
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
 
function encodePathSegment(s) {
  return encodeURIComponent(s).replace(/%2F/g, '/');
}
 
/**
 * Firestore REST client for HTTPS-only environments.
 * Supports basic doc CRUD and structured queries needed by sbadmin.
 */
export class FirestoreRestClient {
  /**
   * @param {{ projectId?: string }} [opts]
   */
  constructor(opts = {}) {
    const meta = readServiceAccountMetadata();
    this.projectId = opts.projectId || process.env.GCLOUD_PROJECT || meta.projectId;
    this.baseUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }
 
  async _headers() {
    const token = await getAccessToken([FIRESTORE_SCOPE]);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
 
  /**
   * @param {string} docPath e.g. users/UID or services/ID
   */
  async getDoc(docPath) {
    const url = `${this.baseUrl}/${encodePathSegment(docPath)}`;
    const res = await fetch(url, { headers: await this._headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw await this._error(res);
    return await res.json();
  }
 
  /**
   * Overwrite or merge document.
   * @param {string} docPath
   * @param {object} data plain JS object
   * @param {{ merge?: boolean }} [opts]
   */
  async setDoc(docPath, data, opts = {}) {
    const url = `${this.baseUrl}/${encodePathSegment(docPath)}`;
    const body = JSON.stringify({ fields: toFields(data) });
    const merge = opts.merge ?? false;
    const params = merge ? `?currentDocument.exists=true&updateMask.fieldPaths=${encodeURIComponent(Object.keys(data).join(','))}` : '';
    const res = await fetch(url + params, {
      method: 'PATCH',
      headers: await this._headers(),
      body,
    });
    if (!res.ok) throw await this._error(res);
    return await res.json();
  }
 
  /**
   * Update fields on an existing doc.
   * @param {string} docPath
   * @param {object} data
   */
  async updateDoc(docPath, data) {
    // Use PATCH with updateMask
    const url = `${this.baseUrl}/${encodePathSegment(docPath)}`;
    const mask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&');
    const res = await fetch(`${url}?${mask}`, {
      method: 'PATCH',
      headers: await this._headers(),
      body: JSON.stringify({ fields: toFields(data) }),
    });
    if (!res.ok) throw await this._error(res);
    return await res.json();
  }
 
  async deleteDoc(docPath) {
    const url = `${this.baseUrl}/${encodePathSegment(docPath)}`;
    const res = await fetch(url, { method: 'DELETE', headers: await this._headers() });
    if (res.status === 404) return true;
    if (!res.ok) throw await this._error(res);
    return true;
  }
 
  /**
   * Run a structured query.
   * @param {object} structuredQuery Firestore StructuredQuery JSON
   * @returns {Promise<object[]>} array of document JSONs
   */
  async runQuery(structuredQuery) {
    const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: await this._headers(),
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw await this._error(res);
    const json = await res.json();
    // Each entry may have { document } or { readTime } only
    return json.map((r) => r.document).filter(Boolean);
  }
 
  async _error(res) {
    let text;
    try {
      text = await res.text();
    } catch {
      text = `${res.status} ${res.statusText}`;
    }
    const err = new Error(text || `${res.status} ${res.statusText}`);
    err.exitCode = res.status === 403 ? 2 : 1;
    return err;
  }
}
 
// ---- Firestore value conversions ----
 
function toFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = toValue(v);
  }
  return fields;
}
 
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } };
  return { stringValue: String(v) };
}
 
export function fromDoc(docJson) {
  if (!docJson) return null;
  const name = docJson.name || '';
  const parts = name.split('/documents/')[1] || '';
  const id = parts.split('/').pop();
  return { id, ...fromFields(docJson.fields || {}) };
}
 
function fromFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields)) {
    out[k] = fromValue(val);
  }
  return out;
}
 
function fromValue(val) {
  if ('nullValue' in val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return new Date(val.timestampValue);
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue);
  if ('mapValue' in val) return fromFields(val.mapValue.fields || {});
  return undefined;
}

