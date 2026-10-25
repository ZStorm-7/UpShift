// Account deletion. The heavy lifting (every Firestore collection, the avatar,
// the RevenueCat record, then the auth user) happens in the `deleteAccount`
// Cloud Function, because the app can't delete other users' references to this
// one or recurse through subcollections. The server only proceeds if the
// login is under five minutes old, so callers must re-enter the password
// (UserContext.reauthenticate) first.

import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export async function deleteMyAccount(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { deleted: boolean }>(functions, 'deleteAccount', { timeout: 300_000 });
  const res = await call({});
  if (!res.data?.deleted) throw new Error('delete-failed');
}
