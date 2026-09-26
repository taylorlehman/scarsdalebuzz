import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startServer,
  pkcePair,
  registerClient,
  authorize,
  tokenRequest,
  obtainTokens,
  fakeIdentity,
} from './helpers.js';

const REDIRECT = 'http://127.0.0.1:33418/callback';

describe('OAuth discovery', () => {
  let srv;
  before(async () => (srv = await startServer()));
  after(() => srv.close());

  test('protected resource metadata points at our authorization server', async () => {
    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const res = await fetch(srv.base + path);
      assert.equal(res.status, 200, path);
      const prm = await res.json();
      assert.equal(prm.resource, `${srv.base}/mcp`);
      assert.deepEqual(prm.authorization_servers, [srv.base]);
      assert.deepEqual(prm.scopes_supported, ['directory:read', 'saved:read']);
    }
  });

  test('authorization server metadata advertises PKCE S256, CIMD, DCR and iss', async () => {
    const as = await (await fetch(`${srv.base}/.well-known/oauth-authorization-server`)).json();
    assert.equal(as.issuer, srv.base);
    assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
    assert.equal(as.client_id_metadata_document_supported, true);
    assert.equal(as.authorization_response_iss_parameter_supported, true);
    assert.equal(as.registration_endpoint, `${srv.base}/oauth/register`);
    assert.ok(as.grant_types_supported.includes('refresh_token'));
  });

  test('/mcp without a token is 401 with a resource_metadata challenge', async () => {
    const res = await fetch(`${srv.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(res.status, 401);
    const challenge = res.headers.get('www-authenticate');
    assert.match(challenge, /^Bearer /);
    assert.ok(challenge.includes(`resource_metadata="${srv.base}/.well-known/oauth-protected-resource/mcp"`));
  });
});

describe('Dynamic client registration', () => {
  let srv;
  before(async () => (srv = await startServer()));
  after(() => srv.close());

  test('registers a public client', async () => {
    const { status, body } = await registerClient(srv.base);
    assert.equal(status, 201);
    assert.match(body.client_id, /^sbz_client_/);
    assert.equal(body.client_secret, undefined);
    assert.equal(body.client_secret_hash, undefined);
  });

  test('issues a secret for confidential clients and never stores it in plaintext', async () => {
    const { status, body } = await registerClient(srv.base, { token_endpoint_auth_method: 'client_secret_post' });
    assert.equal(status, 201);
    assert.match(body.client_secret, /^sbz_cs_/);
    const stored = srv.store.clients.get(body.client_id);
    assert.ok(stored.client_secret_hash);
    assert.ok(!JSON.stringify(stored).includes(body.client_secret));
  });

  test('rejects non-https, non-loopback redirect URIs', async () => {
    for (const uri of ['http://evil.example.com/cb', 'javascript:alert(1)', 'https://ok.example.com/cb#frag']) {
      const { status, body } = await registerClient(srv.base, { redirect_uris: [uri] });
      assert.equal(status, 400, uri);
      assert.equal(body.error, 'invalid_redirect_uri');
    }
  });

  test('rejects unsupported grant types', async () => {
    const { status } = await registerClient(srv.base, { grant_types: ['client_credentials'] });
    assert.equal(status, 400);
  });
});

describe('Authorization code flow', () => {
  let srv;
  before(async () => (srv = await startServer()));
  after(() => srv.close());

  test('happy path issues audience-bound tokens and echoes state + iss', async () => {
    const { body: client } = await registerClient(srv.base);
    const { verifier, challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge });
    assert.equal(redirect.origin + redirect.pathname, REDIRECT);
    assert.equal(redirect.searchParams.get('state'), 'xyz');
    assert.equal(redirect.searchParams.get('iss'), srv.base);
    const code = redirect.searchParams.get('code');
    assert.match(code, /^sbz_ac_/);

    const { status, body, headers } = await tokenRequest(srv.base, {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
      resource: `${srv.base}/mcp`,
    });
    assert.equal(status, 200);
    assert.equal(headers.get('cache-control'), 'no-store');
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.expires_in, 3600);
    assert.equal(body.scope, 'directory:read saved:read');
    assert.match(body.access_token, /^sbz_at_/);
    assert.match(body.refresh_token, /^sbz_rt_/);
  });

  test('loopback redirect URIs may use a different port', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      redirectUri: 'http://127.0.0.1:50000/callback',
    });
    assert.equal(redirect.port, '50000');
  });

  test('unregistered redirect_uri is shown as an error page, never redirected to', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { authRes } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      redirectUri: 'https://attacker.example.com/cb',
    });
    assert.equal(authRes.status, 400);
    assert.equal(authRes.headers.get('location'), null);
    assert.match(authRes.headers.get('content-type'), /text\/html/);
  });

  test('missing PKCE is reported to the client via redirect', async () => {
    const { body: client } = await registerClient(srv.base);
    const res = await fetch(
      `${srv.base}/oauth/authorize?` +
        new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, state: 's1' }),
      { redirect: 'manual' },
    );
    assert.equal(res.status, 303);
    const loc = new URL(res.headers.get('location'));
    assert.equal(loc.searchParams.get('error'), 'invalid_request');
    assert.equal(loc.searchParams.get('state'), 's1');
    assert.equal(loc.searchParams.get('iss'), srv.base);
  });

  test('plain PKCE is rejected', async () => {
    const { body: client } = await registerClient(srv.base);
    const res = await fetch(
      `${srv.base}/oauth/authorize?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: client.client_id,
          redirect_uri: REDIRECT,
          code_challenge: 'a'.repeat(43),
          code_challenge_method: 'plain',
        }),
      { redirect: 'manual' },
    );
    assert.equal(new URL(res.headers.get('location')).searchParams.get('error'), 'invalid_request');
  });

  test('a resource other than this MCP server is rejected', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { authRes } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      resource: 'https://other.example.com/mcp',
    });
    assert.equal(new URL(authRes.headers.get('location')).searchParams.get('error'), 'invalid_target');
  });

  test('unknown scopes are rejected', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { authRes } = await authorize(srv.base, { clientId: client.client_id, challenge, scope: 'admin' });
    assert.equal(new URL(authRes.headers.get('location')).searchParams.get('error'), 'invalid_scope');
  });

  test('wrong PKCE verifier fails', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge });
    const { status, body } = await tokenRequest(srv.base, {
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      code_verifier: pkcePair().verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_grant');
  });

  test('a code cannot be redeemed by a different client', async () => {
    const { body: client } = await registerClient(srv.base);
    const { body: other } = await registerClient(srv.base);
    const { verifier, challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge });
    const { body } = await tokenRequest(srv.base, {
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: other.client_id,
    });
    assert.equal(body.error, 'invalid_grant');
  });

  test('replaying a code fails and revokes tokens already issued from it', async () => {
    const { body: client } = await registerClient(srv.base);
    const { verifier, challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge });
    const params = {
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: client.client_id,
    };
    const first = await tokenRequest(srv.base, params);
    assert.equal(first.status, 200);
    const replay = await tokenRequest(srv.base, params);
    assert.equal(replay.body.error, 'invalid_grant');

    const res = await mcpToolsList(srv.base, first.body.access_token);
    assert.equal(res.status, 401);
  });

  test('confidential clients must authenticate', async () => {
    const { body: client } = await registerClient(srv.base, { token_endpoint_auth_method: 'client_secret_basic' });
    const { verifier, challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge });
    const params = {
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    };
    const noAuth = await tokenRequest(srv.base, { ...params, client_id: client.client_id });
    assert.equal(noAuth.status, 401);
    assert.equal(noAuth.body.error, 'invalid_client');

    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
    // The failed attempt above did not consume the code (auth happens first).
    const ok = await tokenRequest(srv.base, params, { authorization: `Basic ${basic}` });
    assert.equal(ok.status, 200);
  });
});

describe('Consent', () => {
  let srv;
  before(async () => (srv = await startServer({ identity: fakeIdentity({ approved: ['user-approved'] }) })));
  after(() => srv.close());

  test('consent page names the client and the redirect host, and cannot be framed', async () => {
    const { body: client } = await registerClient(srv.base, { client_name: '<script>Evil</script>' });
    const { challenge } = pkcePair();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const authRes = await fetch(`${srv.base}/oauth/authorize?${params}`, { redirect: 'manual' });
    const page = await fetch(new URL(authRes.headers.get('location'), srv.base));
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(html.includes('&lt;script&gt;Evil&lt;/script&gt;'));
    assert.ok(!html.includes('<script>Evil'));
    assert.ok(html.includes('http://127.0.0.1:33418'));
    assert.ok(html.includes('running on\n       your own computer') || html.includes('your own computer'));
  });

  test('users pending directory approval cannot authorize', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      idToken: 'idtoken:user-pending',
    });
    assert.equal(redirect.searchParams.get('error'), 'access_denied');
    assert.equal(redirect.searchParams.get('code'), null);
  });

  test('denying returns access_denied', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId: client.client_id, challenge, decision: 'deny' });
    assert.equal(redirect.searchParams.get('error'), 'access_denied');
  });

  test('an invalid Firebase ID token is rejected without consuming the request', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { consentRes, body, requestId } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      idToken: 'forged',
    });
    assert.equal(consentRes.status, 401);
    assert.equal(body.error, 'login_required');
    assert.ok(await srv.store.getRequest(requestId));
  });

  test('cross-origin consent submissions are rejected', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { consentRes } = await authorize(srv.base, {
      clientId: client.client_id,
      challenge,
      origin: 'https://attacker.example.com',
    });
    assert.equal(consentRes.status, 403);
  });

  test('a consent request can only be used once', async () => {
    const { body: client } = await registerClient(srv.base);
    const { challenge } = pkcePair();
    const { requestId } = await authorize(srv.base, { clientId: client.client_id, challenge });
    const again = await fetch(`${srv.base}/oauth/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: srv.base },
      body: JSON.stringify({ request: requestId, idToken: 'idtoken:user-approved', decision: 'approve' }),
    });
    assert.equal(again.status, 400);
  });
});

describe('Refresh tokens', () => {
  let srv;
  before(async () => (srv = await startServer()));
  after(() => srv.close());

  test('rotate on use; replaying an old refresh token revokes the grant', async () => {
    const { client, tokens } = await obtainTokens(srv.base);
    const first = await tokenRequest(srv.base, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    });
    assert.equal(first.status, 200);
    assert.notEqual(first.body.refresh_token, tokens.refresh_token);

    const replay = await tokenRequest(srv.base, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    });
    assert.equal(replay.body.error, 'invalid_grant');

    // The whole grant is gone, including tokens issued by the legitimate refresh.
    const again = await tokenRequest(srv.base, {
      grant_type: 'refresh_token',
      refresh_token: first.body.refresh_token,
      client_id: client.client_id,
    });
    assert.equal(again.body.error, 'invalid_grant');
    assert.equal((await mcpToolsList(srv.base, first.body.access_token)).status, 401);
  });

  test('can narrow but not widen scope', async () => {
    const { client, tokens } = await obtainTokens(srv.base, { scope: 'directory:read' });
    const widen = await tokenRequest(srv.base, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      scope: 'directory:read saved:read',
    });
    assert.equal(widen.body.error, 'invalid_scope');
  });

  test('refresh fails once the account is disabled', async () => {
    const { client, tokens } = await obtainTokens(srv.base, { idToken: 'idtoken:user-other' });
    srv.identity.disabledSet.add('user-other');
    const res = await tokenRequest(srv.base, {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    });
    assert.equal(res.body.error, 'invalid_grant');
  });

  test('revocation of a refresh token revokes its access tokens', async () => {
    const { client, tokens } = await obtainTokens(srv.base);
    const res = await fetch(`${srv.base}/oauth/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.refresh_token, client_id: client.client_id }),
    });
    assert.equal(res.status, 200);
    assert.equal((await mcpToolsList(srv.base, tokens.access_token)).status, 401);
  });
});

describe('Resource server token checks', () => {
  let srv;
  before(async () => (srv = await startServer({ identity: fakeIdentity({ approved: ['user-approved'] }) })));
  after(() => srv.close());

  test('rejects tokens issued for another resource', async () => {
    const { tokens } = await obtainTokens(srv.base);
    for (const record of srv.store.tokens.values()) record.resource = 'https://other.example.com/mcp';
    assert.equal((await mcpToolsList(srv.base, tokens.access_token)).status, 401);
  });

  test('rejects expired tokens', async () => {
    const { tokens } = await obtainTokens(srv.base);
    for (const record of srv.store.tokens.values()) record.expireAt = new Date(Date.now() - 1000);
    assert.equal((await mcpToolsList(srv.base, tokens.access_token)).status, 401);
  });

  test('rejects tokens once the user loses directory approval', async () => {
    const { tokens } = await obtainTokens(srv.base);
    assert.equal((await mcpToolsList(srv.base, tokens.access_token)).status, 200);
    srv.identity.approvedSet.delete('user-approved');
    assert.equal((await mcpToolsList(srv.base, tokens.access_token)).status, 401);
    srv.identity.approvedSet.add('user-approved');
  });

  test('rejects Firebase ID tokens and other foreign bearer tokens', async () => {
    assert.equal((await mcpToolsList(srv.base, 'idtoken:user-approved')).status, 401);
    assert.equal((await mcpToolsList(srv.base, 'sbz_at_madeup')).status, 401);
  });

  test('tokens are stored hashed', async () => {
    const { tokens } = await obtainTokens(srv.base);
    const dump = JSON.stringify([...srv.store.tokens.entries()]);
    assert.ok(!dump.includes(tokens.access_token));
    assert.ok(!dump.includes(tokens.refresh_token));
  });
});

describe('Client ID Metadata Documents', () => {
  const clientId = 'https://client.example.com/oauth/metadata.json';
  let srv;
  before(async () => {
    srv = await startServer({
      metadataDocs: {
        [clientId]: {
          client_id: clientId,
          client_name: 'Example Desktop',
          redirect_uris: [REDIRECT],
          grant_types: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_method: 'none',
        },
        'https://client.example.com/mismatch.json': {
          client_id: 'https://elsewhere.example.com/metadata.json',
          client_name: 'Mismatch',
          redirect_uris: [REDIRECT],
        },
      },
    });
  });
  after(() => srv.close());

  test('a URL client_id works end to end without registration', async () => {
    const { verifier, challenge } = pkcePair();
    const { redirect } = await authorize(srv.base, { clientId, challenge });
    const { status } = await tokenRequest(srv.base, {
      grant_type: 'authorization_code',
      code: redirect.searchParams.get('code'),
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: clientId,
    });
    assert.equal(status, 200);
  });

  test('the consent page shows the verified publisher domain', async () => {
    const { challenge } = pkcePair();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const authRes = await fetch(`${srv.base}/oauth/authorize?${params}`, { redirect: 'manual' });
    const html = await (await fetch(new URL(authRes.headers.get('location'), srv.base))).text();
    assert.ok(html.includes('client.example.com'));
  });

  test('a document whose client_id does not match its URL is rejected', async () => {
    const { challenge } = pkcePair();
    const { authRes } = await authorize(srv.base, {
      clientId: 'https://client.example.com/mismatch.json',
      challenge,
    });
    assert.equal(authRes.status, 400);
  });

  test('redirect URIs are validated against the document', async () => {
    const { challenge } = pkcePair();
    const { authRes } = await authorize(srv.base, {
      clientId,
      challenge,
      redirectUri: 'https://attacker.example.com/cb',
    });
    assert.equal(authRes.status, 400);
  });
});

async function mcpToolsList(base, accessToken) {
  return fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    }),
  });
}
