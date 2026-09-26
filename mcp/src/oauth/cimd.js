/**
 * OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document).
 *
 * A client identifies itself with an https URL; we fetch the JSON document at
 * that URL and treat it as the client's registration. Fetching attacker-chosen
 * URLs from our backend is an SSRF vector, so the fetch is locked down: https
 * on 443 only, every resolved address must be public, no redirects, a short
 * timeout and a small size cap.
 */

import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { ClientMetadataError, validateClientMetadata } from './clientMetadata.js';

const MAX_DOCUMENT_BYTES = 5 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_SECONDS = 5 * 60;
const MAX_CACHE_SECONDS = 24 * 60 * 60;
const MAX_CACHE_ENTRIES = 500;

const blockList = new net.BlockList();
for (const [addr, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) {
  blockList.addSubnet(addr, prefix, 'ipv4');
}
// IPv4-mapped IPv6 (::ffff:0:0/96) is handled in isPublicAddress: listing it
// here would make BlockList match every IPv4 address.
for (const [addr, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) {
  blockList.addSubnet(addr, prefix, 'ipv6');
}

export function isPublicAddress(address, family) {
  const type = family === 6 || family === 'IPv6' ? 'ipv6' : 'ipv4';
  if (type === 'ipv6') {
    // Check IPv4-mapped addresses against the IPv4 rules too.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blockList.check(mapped[1], 'ipv4');
  }
  return !blockList.check(address, type);
}

/** Returns true when a client_id looks like a metadata-document URL. */
export function isUrlClientId(clientId) {
  return typeof clientId === 'string' && clientId.startsWith('https://');
}

/** @returns {string|null} a problem description, or null when acceptable. */
export function clientIdUrlProblem(clientId) {
  let url;
  try {
    url = new URL(clientId);
  } catch {
    return 'client_id is not a valid URL';
  }
  if (url.protocol !== 'https:') return 'client_id URL must use https';
  if (url.port && url.port !== '443') return 'client_id URL must use the default https port';
  if (url.username || url.password) return 'client_id URL must not contain credentials';
  if (url.hash) return 'client_id URL must not contain a fragment';
  if (url.pathname === '/' || url.pathname === '') return 'client_id URL must contain a path';
  // Check the raw string: URL parsing silently resolves "." and ".." segments.
  const rawPath = clientId.slice(url.origin.length).split(/[?#]/)[0];
  if (/(^|\/)\.\.?(\/|$)/.test(rawPath)) return 'client_id URL must not contain dot segments';
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) return 'client_id URL must use a DNS name';
  return null;
}

/** DNS lookup that refuses to connect to non-public addresses (defeats DNS rebinding too). */
function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family }];
    const blocked = list.find((a) => !isPublicAddress(a.address, a.family));
    if (blocked || list.length === 0) {
      return callback(new Error(`Refusing to fetch client metadata from non-public address for ${hostname}`));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

/**
 * Fetches a metadata document with SSRF protections.
 * @returns {Promise<{ body: string, cacheControl: string | undefined }>}
 */
export function fetchMetadataDocument(clientId) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      clientId,
      {
        lookup: publicOnlyLookup,
        timeout: FETCH_TIMEOUT_MS,
        headers: { accept: 'application/json', 'user-agent': 'ScarsdaleBuzz-MCP-OAuth/1.0' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Client metadata fetch returned HTTP ${res.statusCode}`));
        }
        let size = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_DOCUMENT_BYTES) {
            req.destroy(new Error('Client metadata document is too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ body: Buffer.concat(chunks).toString('utf8'), cacheControl: res.headers['cache-control'] }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Client metadata fetch timed out')));
    req.on('error', reject);
  });
}

function cacheSeconds(cacheControl) {
  if (!cacheControl) return DEFAULT_CACHE_SECONDS;
  if (/no-store|no-cache/i.test(cacheControl)) return 0;
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match) return DEFAULT_CACHE_SECONDS;
  return Math.min(Number(match[1]), MAX_CACHE_SECONDS);
}

/**
 * @param {object} [options]
 * @param {(clientId: string) => Promise<{ body: string, cacheControl?: string }>} [options.fetchDocument]
 */
export function createCimdResolver({ fetchDocument = fetchMetadataDocument, now = Date.now } = {}) {
  const cache = new Map();

  /** @returns {Promise<object>} a normalized client record */
  return async function resolveUrlClient(clientId) {
    const cached = cache.get(clientId);
    if (cached && cached.expiresAt > now()) return cached.client;

    const problem = clientIdUrlProblem(clientId);
    if (problem) throw new ClientMetadataError('invalid_client', problem);

    let doc;
    let cacheControl;
    try {
      const fetched = await fetchDocument(clientId);
      cacheControl = fetched.cacheControl;
      doc = JSON.parse(fetched.body);
    } catch (err) {
      throw new ClientMetadataError('invalid_client', `Could not load client metadata document: ${err.message}`);
    }

    if (!doc || typeof doc !== 'object' || doc.client_id !== clientId) {
      throw new ClientMetadataError('invalid_client', 'client_id in the metadata document does not match its URL');
    }
    if (typeof doc.client_name !== 'string' || !doc.client_name.trim()) {
      throw new ClientMetadataError('invalid_client', 'Client metadata document must include client_name');
    }
    if ('client_secret' in doc || 'client_secret_expires_at' in doc) {
      throw new ClientMetadataError('invalid_client', 'Client metadata documents must not contain a client secret');
    }

    let normalized;
    try {
      normalized = validateClientMetadata(doc, { allowedAuthMethods: ['none'], defaultAuthMethod: 'none' });
    } catch (err) {
      throw new ClientMetadataError('invalid_client', err.message);
    }
    const client = { ...normalized, client_id: clientId, source: 'metadata_document' };

    const ttl = cacheSeconds(cacheControl);
    if (ttl > 0) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(clientId, { client, expiresAt: now() + ttl * 1000 });
    }
    return client;
  };
}
