import admin from 'firebase-admin';

const { FieldValue } = admin.firestore;

/**
 * @param {admin.firestore.Firestore} db
 * @returns {Promise<{ groups: Record<string, string[]> }>}
 */
export async function getCategoryGroups(db) {
  const d = await db.collection('config').doc('categoryGroups').get();
  const data = d.exists ? d.data() : {};
  return { groups: data?.groups || {} };
}

/**
 * @param {admin.firestore.Firestore} db
 * @returns {Promise<string[]>}
 */
export async function getCategoriesList(db) {
  const d = await db.collection('config').doc('categories').get();
  const data = d.exists ? d.data() : {};
  const list = Array.isArray(data?.list) ? data.list : [];
  return [...list].sort();
}

/**
 * @param {object} doc - Firestore document
 * @returns {object} - Serializable object (converts Timestamps)
 */
export function serializeDoc(doc) {
  const out = { ...doc };
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    }
  }
  return out;
}

export { FieldValue };
