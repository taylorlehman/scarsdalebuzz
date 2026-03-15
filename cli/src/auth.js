import admin from 'firebase-admin';
import { readFileSync } from 'fs';

let _app = null;
let _db = null;
let _auth = null;

function getProjectId() {
  const fromEnv =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.ADMIN_PROJECT_ID;
  if (fromEnv) return fromEnv;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const json = JSON.parse(readFileSync(credPath, 'utf8'));
      if (json.project_id) return json.project_id;
    } catch (_) {
      // ignore
    }
  }
  return undefined;
}

/**
 * Initialize Firebase Admin. Uses GOOGLE_APPLICATION_CREDENTIALS or projectId.
 * @param {{ projectId?: string }} [opts]
 * @returns {{ db: admin.firestore.Firestore, auth: admin.auth.Auth }}
 */
export function initFirebase(opts = {}) {
  if (_app) {
    return { db: _db, auth: _auth };
  }

  const projectId =
    opts.projectId ||
    getProjectId();

  try {
    const credential = admin.credential.applicationDefault();
    _app = admin.initializeApp({
      credential,
      projectId,
    });
  } catch (e) {
    if (e.code === 'auth/credential-object-required') {
      const err = new Error(
        'Firebase credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or run: gcloud auth application-default login'
      );
      err.exitCode = 2;
      throw err;
    }
    if (e.message && e.message.includes('Project Id')) {
      const err = new Error(
        'Firebase project ID not set. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path (project_id is read from it), or set GCLOUD_PROJECT to your Firebase project ID (e.g. scarsdale-buzz-prod).'
      );
      err.exitCode = 2;
      throw err;
    }
    throw e;
  }

  _db = admin.firestore();
  _auth = admin.auth();
  return { db: _db, auth: _auth };
}

/**
 * @returns {{ db: admin.firestore.Firestore, auth: admin.auth.Auth } | null }
 */
export function getFirebase() {
  return _app ? { db: _db, auth: _auth } : null;
}
