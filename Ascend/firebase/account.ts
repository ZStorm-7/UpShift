// Account deletion — thin client wrapper around the deleteAccount Cloud
// Function in functions/src/index.ts. See that function's own comment for
// why this has to be server-side (recursive Firestore delete, deleting the
// Auth user without a recent-login requirement, and bypassing the
// leaderboard collection's delete-on-write-rule landmine).

import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

/** Permanently deletes the CALLER's own account — profile, day logs, weight
 * history, quests, streak, sessions, leaderboard row, friend requests, and
 * challenges — then deletes the underlying Firebase Auth user. Irreversible.
 * Throws (with a human-readable `.message`) on failure; nothing is deleted
 * from the client's own state until this resolves, so the caller should
 * treat a thrown error as "nothing happened, safe to retry" rather than
 * partial cleanup. */
export async function deleteAccount(): Promise<void> {
  const call = httpsCallable(functions, 'deleteAccount');
  await call();
}
