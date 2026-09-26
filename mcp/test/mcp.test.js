import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport, UnauthorizedError } from '@modelcontextprotocol/client';
import { startServer, obtainTokens } from './helpers.js';

const REDIRECT = 'http://127.0.0.1:33418/callback';

/** Minimal in-memory OAuthClientProvider, like a desktop MCP client would implement. */
class TestOAuthProvider {
  constructor({ clientMetadataUrl, scope } = {}) {
    this.clientMetadataUrl = clientMetadataUrl;
    this.scope = scope;
    this.authorizationUrl = null;
  }
  get redirectUrl() {
    return REDIRECT;
  }
  get clientMetadata() {
    return {
      client_name: 'SDK Test Client',
      redirect_uris: [REDIRECT],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(this.scope ? { scope: this.scope } : {}),
    };
  }
  clientInformation() {
    return this._client;
  }
  saveClientInformation(info) {
    this._client = info;
  }
  tokens() {
    return this._tokens;
  }
  saveTokens(tokens) {
    this._tokens = tokens;
  }
  redirectToAuthorization(url) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(v) {
    this._verifier = v;
  }
  codeVerifier() {
    return this._verifier;
  }
  saveDiscoveryState(state) {
    this._discovery = state;
  }
  discoveryState() {
    return this._discovery;
  }
}

/** Plays the user's part: follow the authorization URL and approve on the consent page. */
async function approveInBrowser(base, authorizationUrl, idToken = 'idtoken:user-approved') {
  const authRes = await fetch(authorizationUrl, { redirect: 'manual' });
  assert.equal(authRes.status, 303, await authRes.clone().text());
  const consentUrl = new URL(authRes.headers.get('location'), base);
  const requestId = consentUrl.searchParams.get('request');
  const res = await fetch(`${base}/oauth/consent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ request: requestId, idToken, decision: 'approve' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  return new URL(body.redirect_to);
}

async function connectWithOAuth(base, provider) {
  const url = new URL(`${base}/mcp`);
  const first = new StreamableHTTPClientTransport(url, { authProvider: provider });
  const probe = new Client({ name: 'sdk-test', version: '1.0.0' });
  await assert.rejects(probe.connect(first), (err) => err instanceof UnauthorizedError);
  assert.ok(provider.authorizationUrl, 'client should have been sent to the authorization endpoint');

  const callback = await approveInBrowser(base, provider.authorizationUrl);
  await first.finishAuth(callback.searchParams);

  const client = new Client({ name: 'sdk-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(url, { authProvider: provider }));
  return client;
}

describe('MCP over OAuth with the official SDK client', () => {
  const metadataUrl = 'https://client.example.com/mcp-client.json';
  let srv;
  before(async () => {
    srv = await startServer({
      metadataDocs: {
        [metadataUrl]: {
          client_id: metadataUrl,
          client_name: 'CIMD Test Client',
          redirect_uris: [REDIRECT],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
        },
      },
    });
  });
  after(() => srv.close());

  test('discovers, registers (DCR), authorizes and lists tools', async () => {
    const provider = new TestOAuthProvider();
    const client = await connectWithOAuth(srv.base, provider);
    assert.match(provider._client.client_id, /^sbz_client_/);

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name),
      [
        'search_providers',
        'get_provider',
        'list_providers_in_category',
        'list_categories',
        'list_category_groups',
        'list_saved_providers',
      ],
    );
    for (const tool of tools) {
      assert.equal(tool.annotations.readOnlyHint, true, tool.name);
      assert.ok(tool.outputSchema, `${tool.name} has an outputSchema`);
      assert.ok(tool.title, `${tool.name} has a title`);
    }
    await client.close();
  });

  test('authorizes with a Client ID Metadata Document (no registration)', async () => {
    const provider = new TestOAuthProvider({ clientMetadataUrl: metadataUrl });
    const client = await connectWithOAuth(srv.base, provider);
    assert.equal(provider._client.client_id, metadataUrl);
    const result = await client.callTool({ name: 'list_category_groups', arguments: {} });
    assert.equal(result.isError, undefined);
    await client.close();
  });

  describe('tools', () => {
    let client;
    before(async () => {
      client = await connectWithOAuth(srv.base, new TestOAuthProvider());
    });
    after(() => client.close());

    const call = async (name, args = {}) => client.callTool({ name, arguments: args });

    test('search_providers finds by partial name, with typos, and hides test providers', async () => {
      let r = await call('search_providers', { query: 'joes plumbing' });
      assert.equal(r.structuredContent.providers[0].id, 'svc-joes');
      assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);

      r = await call('search_providers', { query: 'Drian Masters' }); // typo
      assert.equal(r.structuredContent.providers[0].id, 'svc-drain');

      r = await call('search_providers', { query: 'maria gonzalez' }); // individual, no business name
      assert.equal(r.structuredContent.providers[0].name, 'Maria Gonzalez');

      r = await call('search_providers', { query: 'plumbing' });
      assert.ok(!r.structuredContent.providers.some((p) => p.id === 'svc-test'));

      r = await call('search_providers', { query: 'zzzz nothing' });
      assert.equal(r.structuredContent.totalMatches, 0);
    });

    test('provider info never leaks other members’ identities', async () => {
      const r = await call('get_provider', { provider_id: 'svc-joes' });
      const p = r.structuredContent.provider;
      assert.equal(p.phone, '(914) 555-0101');
      assert.equal(p.contactName, 'Joe Russo');
      assert.equal(p.recommendationCount, 12);
      assert.equal(p.lastRecommendedAt, '2026-08-01T12:00:00.000Z');
      assert.ok(!JSON.stringify(r).includes('someone-else'));
    });

    test('get_provider with an unknown id is a tool error, not a protocol error', async () => {
      const r = await call('get_provider', { provider_id: 'nope' });
      assert.equal(r.isError, true);
      assert.match(r.content[0].text, /No provider found/);
    });

    test('list_providers_in_category matches case-insensitively, sorts and paginates', async () => {
      let r = await call('list_providers_in_category', { category: 'plumbers', limit: 1 });
      const page1 = r.structuredContent;
      assert.equal(page1.category, 'Plumbers');
      assert.equal(page1.totalProviders, 2); // test provider excluded
      assert.equal(page1.providers[0].id, 'svc-joes'); // most recommended first
      assert.ok(page1.nextCursor);

      r = await call('list_providers_in_category', { category: 'Plumbers', limit: 1, cursor: page1.nextCursor });
      assert.equal(r.structuredContent.providers[0].id, 'svc-drain');
      assert.equal(r.structuredContent.nextCursor, undefined);

      r = await call('list_providers_in_category', { category: 'House Cleaning' }); // legacy `category` field
      assert.equal(r.structuredContent.providers[0].id, 'svc-maria');
    });

    test('unknown categories suggest alternatives', async () => {
      const r = await call('list_providers_in_category', { category: 'Plumber' });
      assert.equal(r.isError, true);
      assert.match(r.content[0].text, /Did you mean: Plumbers/);
    });

    test('list_categories includes group and counts, and filters by group', async () => {
      let r = await call('list_categories');
      const plumbers = r.structuredContent.categories.find((c) => c.name === 'Plumbers');
      assert.deepEqual(plumbers, { name: 'Plumbers', group: 'Home Services', providerCount: 2 });
      assert.ok(r.structuredContent.categories.some((c) => c.name === 'Electricians' && c.providerCount === 0));

      r = await call('list_categories', { group: 'household' });
      assert.deepEqual(r.structuredContent.categories.map((c) => c.name), ['House Cleaning']);

      r = await call('list_categories', { group: 'Nope' });
      assert.equal(r.isError, true);
    });

    test('list_category_groups lists groups and ungrouped categories', async () => {
      const r = await call('list_category_groups');
      assert.deepEqual(r.structuredContent.groups, [
        { name: 'Home Services', categories: ['Electricians', 'HVAC', 'Plumbers'] },
        { name: 'Household', categories: ['House Cleaning'] },
      ]);
      assert.deepEqual(r.structuredContent.ungroupedCategories, ['Tutors']);
    });

    test('list_saved_providers returns only the signed-in user’s saved providers', async () => {
      const r = await call('list_saved_providers');
      assert.deepEqual(
        r.structuredContent.providers.map((p) => p.id),
        ['svc-maria', 'svc-joes'], // newest first; deleted provider skipped; other user's excluded
      );
      assert.equal(r.structuredContent.providers[0].savedAt, '2026-09-01T00:00:00.000Z');
    });

    test('invalid arguments are rejected', async () => {
      const r = await call('search_providers', { query: '' }).catch((err) => ({ thrown: err }));
      assert.ok(r.thrown || r.isError);
    });
  });
});

describe('Scopes and legacy (2025-era) clients', () => {
  let srv;
  before(async () => (srv = await startServer()));
  after(() => srv.close());

  async function legacyCall(token, name, args = {}) {
    return fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } }),
    });
  }

  test('a 2025-era client can initialize and call tools statelessly', async () => {
    const { tokens } = await obtainTokens(srv.base);
    const init = await fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } },
      }),
    });
    assert.equal(init.status, 200);
    const initBody = await readJsonRpc(init);
    assert.equal(initBody.result.serverInfo.name, 'scarsdale-buzz');
    assert.deepEqual(
      initBody.result.serverInfo.icons.map((i) => i.src),
      [`${srv.base}/images/logos/bee-icon-192.png`, `${srv.base}/images/logos/bee-icon-512.png`],
    );
    assert.ok(initBody.result.instructions);

    const res = await legacyCall(tokens.access_token, 'search_providers', { query: 'tutor' });
    assert.equal(res.status, 200);
    const body = await readJsonRpc(res);
    assert.equal(body.result.structuredContent.providers[0].id, 'svc-tutor');
  });

  test('a token without saved:read gets a 403 scope challenge for saved providers only', async () => {
    const { tokens } = await obtainTokens(srv.base, { scope: 'directory:read' });

    const ok = await legacyCall(tokens.access_token, 'list_categories');
    assert.equal(ok.status, 200);

    const denied = await legacyCall(tokens.access_token, 'list_saved_providers');
    assert.equal(denied.status, 403);
    const challenge = denied.headers.get('www-authenticate');
    assert.match(challenge, /error="insufficient_scope"/);
    assert.match(challenge, /scope="saved:read"/);
    assert.match(challenge, /resource_metadata=/);
  });

  test('browser requests from foreign origins are refused', async () => {
    const { tokens } = await obtainTokens(srv.base);
    const res = await fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${tokens.access_token}`,
        origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 403);
  });
});

/** Reads a JSON-RPC response from either a JSON body or a single-event SSE body. */
async function readJsonRpc(res) {
  const text = await res.text();
  if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    return JSON.parse(data);
  }
  return JSON.parse(text);
}
