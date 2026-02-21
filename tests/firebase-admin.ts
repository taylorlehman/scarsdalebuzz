import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

let app: admin.app.App;

export function getAdminApp() {
    if (app) return app;

    const saPath = path.resolve(__dirname, '../scripts/serviceAccountKey.staging.json');

    if (fs.existsSync(saPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        }, 'e2e-tests');
    } else {
        // Fallback or error if not found - though we expect it in staging
        console.warn('Staging service account key not found, attempting default credentials');
        app = admin.initializeApp({}, 'e2e-tests');
    }

    return app;
}

export const db = () => getAdminApp().firestore();
export const auth = () => getAdminApp().auth();
