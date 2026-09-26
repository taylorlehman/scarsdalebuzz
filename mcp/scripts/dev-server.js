#!/usr/bin/env node
/**
 * Local development server with in-memory data and a fake sign-in, for trying
 * the full OAuth + MCP flow with the MCP Inspector or any MCP client:
 *
 *   npm run dev
 *   npx @modelcontextprotocol/inspector   # connect to http://localhost:8787/mcp
 *
 * Nothing here touches Firebase. Do not deploy this file's configuration.
 */

import { buildConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { MemoryOAuthStore } from '../src/oauth/store.js';
import { MemoryDirectorySource } from '../src/directory/source.js';
import { sampleDirectory } from '../test/fixtures.js';

const port = Number(process.env.PORT || 8787);
const config = buildConfig({ publicUrl: `http://localhost:${port}`, allowInsecureLocalhost: true });

const devIdentity = {
  async verifyIdToken(idToken) {
    if (!idToken.startsWith('dev:')) throw new Error('invalid dev token');
    return { uid: idToken.slice(4), name: 'Local Dev User', email: 'dev@example.com' };
  },
  async getMembership() {
    return { approved: true, status: 'approved' };
  },
  async isAccountActive() {
    return true;
  },
};

const app = createApp({
  config,
  oauthStore: new MemoryOAuthStore(),
  identity: devIdentity,
  directorySource: new MemoryDirectorySource(sampleDirectory()),
  devSignIn: true,
});

app.listen(port, 'localhost', () => {
  console.log(`Scarsdale Buzz MCP dev server: ${config.resourceUrl}`);
});
