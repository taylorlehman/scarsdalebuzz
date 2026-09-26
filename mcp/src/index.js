/**
 * Firebase Functions entry point for the "mcp" codebase (see firebase.json).
 * Firebase Hosting rewrites /mcp, /oauth/** and the OAuth /.well-known
 * documents on the website's origin to this function.
 */

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { configFromEnv } from './config.js';
import { createApp } from './app.js';
import { FirebaseIdentity } from './identity.js';
import { FirestoreOAuthStore } from './oauth/store.js';
import { FirestoreDirectorySource } from './directory/source.js';

initializeApp();
const db = getFirestore();

let app;
function getApp() {
  // Built lazily so deploy-time code analysis doesn't need runtime env vars.
  app ??= createApp({
    config: configFromEnv(),
    oauthStore: new FirestoreOAuthStore(db),
    identity: new FirebaseIdentity(getAuth(), db),
    directorySource: new FirestoreDirectorySource(db),
    // Never log request bodies or headers: they carry tokens.
    onError: (err) => logger.error('mcp error', { message: err?.message, stack: err?.stack }),
  });
  return app;
}

export const mcp = onRequest(
  {
    region: 'us-central1',
    invoker: 'public', // authorization is enforced by OAuth, not IAM
    memory: '256MiB',
    timeoutSeconds: 60,
    concurrency: 80,
    maxInstances: 10,
  },
  (req, res) => getApp()(req, res),
);
