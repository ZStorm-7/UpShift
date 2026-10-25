// The free trial's start date is decided here, not by the app. A modified app
// could write any date to its own Firestore document, so the date lives in
// `trials/{uid}`, which only the Admin SDK can write.
//
// To stop "delete the account, sign up again, get a fresh trial", the first
// start is also recorded under a hash of the normalised email, and that record
// is NOT removed when the account is. This is a speed bump, not a wall: someone
// with a new email address gets a new trial, as with any trial without a payment method.

import { createHash } from 'node:crypto';

export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Lower-case, drop "+tag", and for Gmail drop dots, so plus-addresses and dotted variants are one person. */
export function normalizeEmail(email: string): string {
  const [rawLocal = '', rawDomain = ''] = email.trim().toLowerCase().split('@');
  const domain = rawDomain === 'googlemail.com' ? 'gmail.com' : rawDomain;
  let local = rawLocal.split('+')[0];
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export function trialClaimId(email: string): string {
  return createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

/**
 * Which start date wins. An earlier claim for the same email beats everything (that person
 * already used their trial). Otherwise a date the old app wrote is honoured only if it is in
 * the past, so it can only ever shorten a trial; a date in the future is ignored.
 */
export function resolveTrialStart(opts: { now: number; claim?: number | null; legacy?: unknown }): number {
  const { now, claim } = opts;
  if (typeof claim === 'number' && Number.isFinite(claim) && claim <= now) return claim;
  const legacy = Number(opts.legacy);
  if (Number.isFinite(legacy) && legacy > 0 && legacy <= now) return legacy;
  return now;
}
