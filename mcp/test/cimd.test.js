import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIdUrlProblem, isPublicAddress, createCimdResolver } from '../src/oauth/cimd.js';

test('non-public addresses are blocked (SSRF)', () => {
  for (const [addr, family] of [
    ['127.0.0.1', 4],
    ['10.1.2.3', 4],
    ['172.20.0.1', 4],
    ['192.168.1.1', 4],
    ['169.254.169.254', 4], // cloud metadata service
    ['100.64.0.1', 4],
    ['0.0.0.0', 4],
    ['::1', 6],
    ['fe80::1', 6],
    ['fd00::1', 6],
    ['::ffff:127.0.0.1', 6],
    ['::ffff:169.254.169.254', 6],
  ]) {
    assert.equal(isPublicAddress(addr, family), false, addr);
  }
  assert.equal(isPublicAddress('8.8.8.8', 4), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111', 6), true);
});

test('client_id URLs must be https on 443 with a path and a DNS name', () => {
  assert.equal(clientIdUrlProblem('https://app.example.com/client.json'), null);
  for (const bad of [
    'http://app.example.com/client.json',
    'https://app.example.com/',
    'https://app.example.com:8443/client.json',
    'https://user:pw@app.example.com/client.json',
    'https://app.example.com/client.json#x',
    'https://app.example.com/a/../client.json',
    'https://127.0.0.1/client.json',
    'https://[::1]/client.json',
  ]) {
    assert.ok(clientIdUrlProblem(bad), bad);
  }
});

test('metadata documents must be well-formed and cannot carry secrets', async () => {
  const url = 'https://app.example.com/client.json';
  const base = { client_id: url, client_name: 'App', redirect_uris: ['https://app.example.com/cb'] };
  const resolverFor = (doc) => createCimdResolver({ fetchDocument: async () => ({ body: JSON.stringify(doc) }) });

  const client = await resolverFor(base)(url);
  assert.equal(client.token_endpoint_auth_method, 'none');

  for (const doc of [
    { ...base, client_name: undefined },
    { ...base, client_secret: 'x' },
    { ...base, redirect_uris: ['http://evil.example.com/cb'] },
    { ...base, token_endpoint_auth_method: 'client_secret_post' },
  ]) {
    await assert.rejects(resolverFor(doc)(url));
  }
});

test("accepts Claude's metadata document, ignoring grant types we don't support", async () => {
  // Verbatim from https://claude.ai/oauth/mcp-oauth-client-metadata (2026-09-26).
  const url = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
  const doc = {
    client_id: url,
    client_name: 'Claude',
    client_uri: 'https://claude.ai',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
  const resolve = createCimdResolver({ fetchDocument: async () => ({ body: JSON.stringify(doc) }) });
  const client = await resolve(url);
  assert.deepEqual(client.grant_types, ['authorization_code', 'refresh_token']);
  assert.deepEqual(client.redirect_uris, ['https://claude.ai/api/mcp/auth_callback']);
});

test('documents are cached per Cache-Control', async () => {
  const url = 'https://app.example.com/client.json';
  let fetches = 0;
  const resolve = createCimdResolver({
    fetchDocument: async () => {
      fetches += 1;
      return {
        body: JSON.stringify({ client_id: url, client_name: 'App', redirect_uris: ['https://app.example.com/cb'] }),
        cacheControl: 'max-age=600',
      };
    },
  });
  await resolve(url);
  await resolve(url);
  assert.equal(fetches, 1);
});
