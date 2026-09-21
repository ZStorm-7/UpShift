// Forgot-password PIN flow — thin client wrapper around the two callable
// Cloud Functions in functions/src/index.ts (requestPasswordResetPin,
// verifyPinAndResetPassword). Changing another (signed-out) account's
// password can only happen server-side via the Admin SDK, which is why
// this isn't just a Firestore write from the client — see that file's own
// comment for the full reasoning.

import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

/** Emails a 6-digit reset code to `email`, if an account exists for it.
 * Always resolves (never reveals whether the address has an account) —
 * a rejection here means a real problem (rate-limited, network down),
 * not "no such account". */
export async function requestPasswordResetPin(email: string): Promise<void> {
  const call = httpsCallable(functions, 'requestPasswordResetPin');
  await call({ email });
}

/** Verifies the emailed PIN and, if it matches, sets `newPassword` on the
 * account and sends a "your password was changed" confirmation email.
 * Throws (with a human-readable `.message`) on a wrong/expired code. */
export async function verifyPinAndResetPassword(
  email: string,
  pin: string,
  newPassword: string
): Promise<void> {
  const call = httpsCallable(functions, 'verifyPinAndResetPassword');
  await call({ email, pin, newPassword });
}
