// Cloud Functions for UpShift.
//
// Requires the Blaze (pay-as-you-go) plan — Cloud Functions cannot deploy on
// Firebase's free Spark plan at all, regardless of what they do once
// deployed. The free-tier quota within Blaze (2M invocations/month, per
// https://firebase.google.com/pricing) comfortably covers this app's scale,
// so in practice this should cost $0/month, but a billing account has to be
// on file.
//
// onNewMessage below is the one function in this codebase: it fires on
// every new conversations/{conversationId}/messages/{messageId} document
// (see firebase/messages.ts's sendMessage on the client) and delivers a
// real push notification to the recipient via Expo's push service — the
// one thing the client-only app could never do on its own, since a push to
// a closed app needs a server reacting to the write, not a device watching
// for it.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createHash, randomInt } from 'crypto';

initializeApp();
const db = getFirestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
};

export const onNewMessage = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.data() as { senderId?: string; text?: string; deleted?: boolean };
    // deleted is never true on create (see firestore.rules — create requires
    // deleted == false), but checked anyway since this function runs on
    // every create regardless of what the rule already enforced.
    if (!message.senderId || message.deleted) return;

    // Conversation ids are always "<uidA>_<uidB>" sorted — see
    // firebase/messages.ts's conversationIdFor — so the recipient is
    // whichever half of the id isn't the sender, no extra read needed to
    // find them.
    const conversationId = event.params.conversationId;
    const uids = conversationId.split('_');
    const recipientUid = uids.find((u) => u !== message.senderId);
    if (!recipientUid) return;

    // Second, server-side check that the recipient hasn't blocked the
    // sender. firestore.rules already refuses this write at the source, so
    // this only matters if a rule change or a race ever let one through —
    // cheap insurance against ever pushing a blocked sender's message.
    const socialSnap = await db.doc(`users/${recipientUid}/meta/social`).get();
    const blockedUids: string[] = socialSnap.exists ? socialSnap.data()?.blockedUids ?? [] : [];
    if (blockedUids.includes(message.senderId)) return;

    // One push per signed-in DEVICE, not per account — see
    // services/notifications.ts's registerPushToken for why tokens are
    // stored per-device rather than as a single field on the profile.
    const deviceTokensSnap = await db
      .collection(`users/${recipientUid}/meta/pushTokens/devices`)
      .get();
    if (deviceTokensSnap.empty) return;

    // The sender's PUBLIC name — same source (the leaderboard row) the app
    // itself reads for anything shown to other users, never the private
    // profile doc, which this function has no reason to touch.
    const leaderboardSnap = await db.doc(`leaderboard/${message.senderId}`).get();
    const displayName = leaderboardSnap.exists
      ? (leaderboardSnap.data()?.displayName as string | undefined)
      : undefined;
    const senderName = displayName?.split(' ')[0] || 'A friend';

    const body = (message.text || 'Sent you a message').slice(0, 120);

    const messages = deviceTokensSnap.docs
      .map((d) => d.data()?.expoPushToken as string | undefined)
      .filter((token): token is string => !!token)
      .map((to) => ({
        to,
        title: senderName,
        body,
        sound: 'default',
        data: { conversationId, type: 'new_message' },
      }));
    if (messages.length === 0) return;

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = (await response.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null;
    const tickets = result?.data ?? [];

    // A dead token (app uninstalled, or superseded by a new one for the same
    // device) gets cleaned up so future sends don't keep failing against it
    // — matched back to its device doc by array position, since Expo
    // returns tickets in the same order the messages were sent.
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status !== 'error') return;
        logger.warn('Expo push send failed', ticket);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await deviceTokensSnap.docs[i]?.ref.delete().catch(() => {});
        }
      })
    );
  }
);

/* ------------------------------------------------------------------ *
 * Forgot-password PIN reset
 *
 * Firebase Auth's client SDK has no "reset by PIN" primitive — only
 * sendPasswordResetEmail's link-based flow, or a signed-in user's own
 * updatePassword. Changing a DIFFERENT (signed-out) user's password
 * requires the Admin SDK, which only runs server-side — hence these two
 * callables rather than anything client-only.
 *
 * requestPasswordResetPin generates a 6-digit code, stores its hash (never
 * the plain code) in `passwordResets/{uid}` — a top-level collection with
 * no matching allow rule in firestore.rules, so it's already unreachable
 * from any client and needed no rules change — and emails it via Resend.
 * verifyPinAndResetPassword checks that hash, then uses
 * admin.auth().updateUser to actually change the password, something no
 * client-side call could ever do for an account the caller isn't signed
 * into.
 *
 * Both callables respond the same way whether or not the email address is
 * a real account, specifically to avoid letting this endpoint be used to
 * test which emails have UpShift accounts.
 * ------------------------------------------------------------------ */

// Stored as a Firebase Functions secret (`firebase functions:secrets:set
// RESEND_API_KEY`), never committed — see resend.com for the account/API
// key and https://resend.com/domains for verifying a sending domain.
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

// resend.dev is Resend's shared sandbox sender — it works with zero setup
// but is rate-limited and meant for testing only. Swap this for an address
// on a domain verified in the Resend dashboard (e.g.
// 'UpShift <noreply@upshift.app>') before relying on this in production.
const FROM_EMAIL = 'UpShift <onboarding@resend.dev>';

const PIN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PIN_ATTEMPTS = 5;
const MIN_RESEND_INTERVAL_MS = 60 * 1000; // 1 minute between requested codes

function hashPin(uid: string, pin: string): string {
  // Domain-separated by uid (not a secret, but stops the same 6-digit code
  // hashing identically across two different accounts) plus expiry/attempt
  // limits below — proportionate for a short-lived, rate-limited code, not
  // a long-term credential.
  return createHash('sha256').update(`${uid}:${pin}`).digest('hex');
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    if (!res.ok) {
      logger.error('Resend send failed', { status: res.status, body: await res.text().catch(() => '') });
    }
  } catch (err) {
    // Best-effort — a failed send shouldn't surface as a crash to the
    // caller (see the "respond the same either way" note above).
    logger.error('Resend send threw', err);
  }
}

function pinEmailHtml(pin: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your UpShift password</h2>
      <p>Enter this code in the app to continue resetting your password. It expires in 10 minutes.</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">${pin}</p>
      <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>
  `;
}

function passwordChangedEmailHtml(): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Your UpShift password was changed</h2>
      <p>This is a confirmation that your account's password was just changed.</p>
      <p>If you made this change, no action is needed. If you didn't, please contact us immediately at hello@upshift.app.</p>
    </div>
  `;
}

export const requestPasswordResetPin = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!email) throw new HttpsError('invalid-argument', 'Enter your email address.');

  let uid: string;
  try {
    uid = (await getAuth().getUserByEmail(email)).uid;
  } catch {
    // No account with that email — respond as if it worked, so this can't
    // be used to enumerate registered addresses.
    return { success: true };
  }

  const resetDocRef = db.doc(`passwordResets/${uid}`);
  const existing = await resetDocRef.get();
  if (existing.exists) {
    const createdAt = existing.data()?.createdAt as number | undefined;
    if (createdAt && Date.now() - createdAt < MIN_RESEND_INTERVAL_MS) {
      throw new HttpsError('resource-exhausted', 'Please wait a moment before requesting another code.');
    }
  }

  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await resetDocRef.set({
    pinHash: hashPin(uid, pin),
    expiresAt: Date.now() + PIN_TTL_MS,
    attempts: 0,
    createdAt: Date.now(),
  });

  await sendEmail(email, 'Your UpShift password reset code', pinEmailHtml(pin));
  return { success: true };
});

export const verifyPinAndResetPassword = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  const pin = String(request.data?.pin || '').trim();
  const newPassword = String(request.data?.newPassword || '');

  if (!email || !pin) throw new HttpsError('invalid-argument', 'Enter the code we emailed you.');
  if (newPassword.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  let uid: string;
  try {
    uid = (await getAuth().getUserByEmail(email)).uid;
  } catch {
    throw new HttpsError('permission-denied', 'That code is invalid or has expired.');
  }

  const resetDocRef = db.doc(`passwordResets/${uid}`);
  const snap = await resetDocRef.get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'That code is invalid or has expired.');

  const data = snap.data()!;
  if (Date.now() > (data.expiresAt as number)) {
    await resetDocRef.delete();
    throw new HttpsError('deadline-exceeded', 'That code has expired. Request a new one.');
  }
  if ((data.attempts as number) >= MAX_PIN_ATTEMPTS) {
    await resetDocRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Request a new code.');
  }
  if (hashPin(uid, pin) !== data.pinHash) {
    await resetDocRef.update({ attempts: (data.attempts as number) + 1 });
    throw new HttpsError('permission-denied', 'That code is invalid or has expired.');
  }

  await getAuth().updateUser(uid, { password: newPassword });
  await resetDocRef.delete();
  await sendEmail(email, 'Your UpShift password was changed', passwordChangedEmailHtml());

  return { success: true };
});

/* ------------------------------------------------------------------ *
 * Account deletion
 *
 * Has to run server-side for two independent reasons, not just one:
 *
 * 1. Deleting the Auth user itself (getAuth().deleteUser) is something the
 *    client SDK CAN do for its own signed-in account (auth.currentUser.
 *    delete()) — but only within a few minutes of that account's last
 *    sign-in. Any staler session gets "auth/requires-recent-login" and
 *    would need a re-authentication prompt just to let someone leave.
 *    Admin SDK operations aren't subject to that at all.
 *
 * 2. The Firestore side needs a RECURSIVE delete of users/{uid} (an
 *    unbounded, growing tree — a `days` doc per day the account has ever
 *    been used, `meta/pushTokens/devices/*`, etc.), which the client SDK
 *    has no primitive for; it would mean listing and batch-deleting every
 *    subcollection by hand. It also needs to remove the leaderboard row,
 *    which firestore.rules' combined `allow write` for that collection
 *    can't do on a DELETE at all — `request.resource` is null on a delete,
 *    so evaluating `request.resource.data.uid` there throws and the rule
 *    denies the operation outright (the exact landmine that collection's
 *    own reactions subcollection rule is split apart specifically to
 *    avoid). Admin SDK writes bypass security rules entirely, so neither
 *    limitation applies here.
 *
 * What this does NOT touch, on purpose:
 *   - `friendCodes/{code}`: permanently immutable by design (see
 *     firestore.rules) — the code simply stops resolving to anyone useful
 *     once the account is gone.
 *   - `conversations/*` and their `messages` subcollections: DMs are a
 *     two-party trust space, same reasoning firestore.rules already
 *     documents for why a client can never delete one (`allow delete:
 *     if false`) — the other participant's copy of a conversation
 *     shouldn't vanish out from under them just because this side deleted
 *     their account. Their view of it is unaffected; this account simply
 *     can't open it again.
 * Both are called out here, not silently skipped, so the next person
 * reading this doesn't mistake either for an oversight.
 * ------------------------------------------------------------------ */

export const deleteAccount = onCall(async (request) => {
  // Never accepts a uid from the caller — the only account this callable
  // can ever delete is whichever one the request is authenticated as.
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');

  // Firestore cleanup happens BEFORE the Auth user is deleted, and nothing
  // here is wrapped in a swallowing catch — a failure partway through
  // should stop short of the irreversible step and surface as a retryable
  // error, leaving the account (and whatever it's already lost) in a state
  // the same call can pick back up from, rather than deleting the sign-in
  // credential for data that's still half-cleaned-up and unreachable.
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.recursiveDelete(db.doc(`leaderboard/${uid}`));

  // Requests either sent BY this account or received FROM someone else —
  // both sides' rules let either participant delete one, so this account
  // being gone is reason enough to clear both directions.
  const [sentRequests, receivedRequests] = await Promise.all([
    db.collection('friendRequests').where('fromUid', '==', uid).get(),
    db.collection('friendRequests').where('toUid', '==', uid).get(),
  ]);

  // Challenges this account participated in — same reasoning as friend
  // requests: a challenge only ever makes sense between two people, and one
  // of them is about to stop existing.
  const challenges = await db.collection('challenges').where('participants', 'array-contains', uid).get();

  // Reactions this account left on OTHER people's leaderboard rows — not
  // reached by recursiveDelete(leaderboard/{uid}) above, since those live
  // under leaderboard/{otherUid}/reactions/{uid}, not this account's own
  // row. A collection-group query finds them regardless of which row
  // they're filed under. Best-effort and isolated from the batch below:
  // this needs a collection-group index on reactions.uid that a brand-new
  // project won't have provisioned yet (see firestore.indexes.json), and a
  // few stray reaction emoji outliving the account they came from is a
  // cosmetic loose end — not something worth failing the entire deletion
  // over, let alone leaving the Auth user undeleted for.
  const reactions = await db.collectionGroup('reactions').where('uid', '==', uid).get().catch(() => null);

  // One leftover, unrelated to the users/{uid} tree above: a still-pending
  // forgot-password PIN, if this account requested one and never used it.
  const passwordReset = await db.doc(`passwordResets/${uid}`).get();

  const batch = db.batch();
  sentRequests.docs.forEach(d => batch.delete(d.ref));
  receivedRequests.docs.forEach(d => batch.delete(d.ref));
  challenges.docs.forEach(d => batch.delete(d.ref));
  reactions?.docs.forEach(d => batch.delete(d.ref));
  if (passwordReset.exists) batch.delete(passwordReset.ref);
  await batch.commit();

  await getAuth().deleteUser(uid);

  return { success: true };
});
