import crypto from 'node:crypto';
import { buildConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { MemoryOAuthStore } from '../src/oauth/store.js';
import { MemoryDirectorySource } from '../src/directory/source.js';
import { createCimdResolver } from '../src/oauth/cimd.js';
import { sampleDirectory } from './fixtures.js';

/** Firebase identity double: ID tokens are "idtoken:<uid>". */
export function fakeIdentity({ approved = ['user-approved', 'user-other'], disabled = [] } = {}) {
  const approvedSet = new Set(approved);
  return {
    approvedSet,
    disabledSet: new Set(disabled),
    async verifyIdToken(idToken) {
      if (!idToken?.startsWith('idtoken:')) throw new Error('bad token');
      const uid = idToken.slice('idtoken:'.length);
      return { uid, name: `Name ${uid}`, email: `${uid}@example.com` };
    },
    async getMembership(uid) {
      return approvedSet.has(uid) ? { approved: true, status: 'approved' } : { approved: false, status: 'pending' };
    },
    async isAccountActive(uid) {
      return !this.disabledSet.has(uid);
    },
  };
}

/** Starts the app on an ephemeral localhost port. */
export async function startServer({ metadataDocs = {}, identity = fakeIdentity() } = {}) {
  const store = new MemoryOAuthStore();
  const errors = [];
  let config;
  const resolveUrlClient = createCimdResolver({
    fetchDocument: async (url) => {
      if (!(url in metadataDocs)) throw new Error('HTTP 404');
      return { body: JSON.stringify(metadataDocs[url]) };
    },
  });

  // Bind first so the config can embed the real port.
  const { default: express } = await import('express');
  const outer = express();
  const server = await new Promise((resolve) => {
    const s = outer.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  config = buildConfig({ publicUrl: `http://127.0.0.1:${port}`, allowInsecureLocalhost: true });
  const app = createApp({
    config,
    oauthStore: store,
    identity,
    directorySource: new MemoryDirectorySource(sampleDirectory()),
    resolveUrlClient,
    onError: (err) => errors.push(err),
  });
  outer.use(app);

  return {
    base: config.origin,
    config,
    store,
    identity,
    errors,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function registerClient(base, overrides = {}) {
  const res = await fetch(`${base}/oauth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test Client',
      redirect_uris: ['http://127.0.0.1:33418/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      ...overrides,
    }),
  });
  return { status: res.status, body: await res.json() };
}

/**
 * Drives /authorize → consent page → decision, as a browser + user would.
 * @returns {Promise<URL>} the client redirect URL
 */
export async function authorize(base, {
  clientId,
  redirectUri = 'http://127.0.0.1:33418/callback',
  challenge,
  scope,
  resource = `${base}/mcp`,
  state = 'xyz',
  idToken = 'idtoken:user-approved',
  decision = 'approve',
  origin = base,
}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    resource,
  });
  if (scope) params.set('scope', scope);

  const authRes = await fetch(`${base}/oauth/authorize?${params}`, { redirect: 'manual' });
  const location = authRes.headers.get('location');
  if (authRes.status !== 303 || !location?.startsWith('/oauth/consent')) {
    return { authRes, location };
  }
  const requestId = new URL(location, base).searchParams.get('request');

  const consentRes = await fetch(`${base}/oauth/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ request: requestId, idToken, decision }),
  });
  const body = await consentRes.json();
  return { requestId, consentRes, body, redirect: body.redirect_to ? new URL(body.redirect_to) : null };
}

export async function tokenRequest(base, params, headers = {}) {
  const res = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(params),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

/** Full happy path: register, authorize, exchange. Returns tokens and client. */
export async function obtainTokens(base, { scope, idToken } = {}) {
  const { body: client } = await registerClient(base);
  const { verifier, challenge } = pkcePair();
  const { redirect } = await authorize(base, { clientId: client.client_id, challenge, scope, idToken });
  const { body: tokens } = await tokenRequest(base, {
    grant_type: 'authorization_code',
    code: redirect.searchParams.get('code'),
    code_verifier: verifier,
    redirect_uri: 'http://127.0.0.1:33418/callback',
    client_id: client.client_id,
    resource: `${base}/mcp`,
  });
  return { client, tokens };
}
