import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';
 
/**
 * @returns {{ projectId: string, clientEmail: string } }
 */
export function readServiceAccountMetadata() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    const err = new Error('GOOGLE_APPLICATION_CREDENTIALS is required for REST transport.');
    err.exitCode = 2;
    throw err;
  }
  const json = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!json.project_id || !json.client_email) {
    const err = new Error('Service account JSON missing project_id or client_email.');
    err.exitCode = 2;
    throw err;
  }
  return { projectId: json.project_id, clientEmail: json.client_email };
}
 
/**
 * Returns an access token using application default credentials/service account.
 * In Cowork VM, this stays HTTPS-only.
 *
 * @param {string[]} scopes
 * @returns {Promise<string>}
 */
export async function getAccessToken(scopes) {
  const auth = new GoogleAuth({ scopes });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    const err = new Error('Failed to acquire Google access token.');
    err.exitCode = 2;
    throw err;
  }
  return token;
}

