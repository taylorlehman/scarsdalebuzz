import { initFirebase } from '../auth.js';
import { FirestoreRestClient, fromDoc } from './firestoreRest.js';
 
/**
 * Returns { mode, db } where db is either firebase-admin Firestore or REST client.
 *
 * @param {import('commander').Command} cmd
 */
export function getDb(cmd) {
  const transport = (cmd?.optsWithGlobals?.()?.transport || cmd?.opts?.()?.transport || process.env.SBADMIN_TRANSPORT || 'grpc').toLowerCase();
  if (transport === 'rest') {
    const rest = new FirestoreRestClient();
    return { mode: 'rest', db: rest };
  }
  const { db } = initFirebase();
  return { mode: 'grpc', db };
}
 
export { fromDoc };

