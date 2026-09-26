/**
 * The website's identity model, reused for MCP authorization:
 *  - Users sign in with Firebase Auth (Facebook or Google).
 *  - Directory access additionally requires `users/{uid}.directoryStatus === 'approved'`
 *    (the same gate public/directory/directory.js applies).
 */
export class FirebaseIdentity {
  /**
   * @param {import('firebase-admin/auth').Auth} auth
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(auth, db) {
    this.auth = auth;
    this.db = db;
  }

  /** Verifies a Firebase ID token minted by the Web SDK on the consent page. */
  async verifyIdToken(idToken) {
    const decoded = await this.auth.verifyIdToken(idToken, /* checkRevoked */ true);
    return {
      uid: decoded.uid,
      name: decoded.name || null,
      email: decoded.email || null,
    };
  }

  async getMembership(uid) {
    const snap = await this.db.collection('users').doc(uid).get();
    const status = snap.exists ? snap.data().directoryStatus || 'pending' : 'missing';
    return { approved: status === 'approved', status };
  }

  async isAccountActive(uid) {
    try {
      const user = await this.auth.getUser(uid);
      return !user.disabled;
    } catch {
      return false;
    }
  }
}
