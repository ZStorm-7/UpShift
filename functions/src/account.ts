// Account deletion: removes everything we hold about a user, in every store,
// then the auth user itself. Best-effort for the third parties (Cloudinary,
// RevenueCat, Storage) so one outage can't leave the account half-deleted:
// the Firestore data and auth user are always removed.

import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';
import { db } from './store.ts';
import { CLOUD_NAME, avatarPublicId, sign } from './cloudinary.ts';

async function deleteQuery(q: FirebaseFirestore.Query) {
  const snap = await q.get();
  const writer = db.bulkWriter();
  snap.docs.forEach(d => writer.delete(d.ref));
  await writer.close();
}

export async function deleteAllUserData(uid: string, secrets: { cloudinaryKey?: string; cloudinarySecret?: string; revenuecat?: string }) {
  // Firestore: the user's own tree, their public rows, and anything that names them.
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.recursiveDelete(db.doc(`leaderboard/${uid}`));
  await db.recursiveDelete(db.doc(`coachUsage/${uid}`));
  await db.doc(`rateLimits/${uid}`).delete();
  await deleteQuery(db.collection('friendCodes').where('uid', '==', uid));
  await deleteQuery(db.collection('friendRequests').where('fromUid', '==', uid));
  await deleteQuery(db.collection('friendRequests').where('toUid', '==', uid));
  await deleteQuery(db.collection('challenges').where('participants', 'array-contains', uid));
  await deleteQuery(db.collection('coachFeedback').where('uid', '==', uid));
  await deleteQuery(db.collection('onboardingEvents').where('uid', '==', uid));
  // Reactions this user left on other people's rows.
  await deleteQuery(db.collectionGroup('reactions').where('uid', '==', uid));

  // Third parties (best effort).
  try { await getStorage().bucket().file(`profilePhotos/${uid}.jpg`).delete({ ignoreNotFound: true }); }
  catch (e) { logger.warn('delete.storage', { err: String(e) }); }

  if (secrets.cloudinaryKey && secrets.cloudinarySecret) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const params = { public_id: avatarPublicId(uid), timestamp, invalidate: 'true' };
      const body = new URLSearchParams({
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
        api_key: secrets.cloudinaryKey, signature: sign(params, secrets.cloudinarySecret),
      });
      await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, { method: 'POST', body });
    } catch (e) { logger.warn('delete.cloudinary', { err: String(e) }); }
  }

  if (secrets.revenuecat) {
    try {
      await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${secrets.revenuecat}` },
      });
    } catch (e) { logger.warn('delete.revenuecat', { err: String(e) }); }
  }

  await getAuth().deleteUser(uid);
}
