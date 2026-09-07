import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { LeaderboardEntry, leaderboardDocRef } from './leaderboard';

// Friends are layered ON TOP of the existing leaderboard collection rather
// than inventing a separate "public profile" concept: the leaderboard
// already holds exactly the fields (displayName, avatar, avatarColor,
// level, totalXP, streak) that a friend's card needs to show, and it's kept
// current by the same publishToLeaderboard() call that already runs
// whenever XP changes. So "look up my friend's stats" is just "read their
// leaderboard row" — no second sync path to keep correct.

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  fromDisplayName: string;
  fromAvatarColor?: string;
  status: 'pending' | 'accepted' | 'rejected';
};

function socialDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'social');
}

type SocialDoc = { friendCode?: string; friendUids?: string[] };

// A short shareable code, e.g. "K7QX9M" — this is the only way one user
// finds another, since there's no username system and searching by email
// would let anyone probe whether a given email has an account. Generated
// once per user and reused after that; collisions are vanishingly unlikely
// at this app's scale (36^6 ≈ 2.2 billion combinations) and are handled
// safely anyway — see friendCodes' `allow create` rule, which simply
// refuses to let a second user claim a code that's already taken.
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to misread aloud
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// Returns the caller's existing friend code, or mints and saves a new one
// if they don't have one yet. Retries on the rare collision.
export async function getOrCreateFriendCode(uid: string): Promise<string> {
  const socialSnap = await getDoc(socialDocRef(uid));
  const existing = (socialSnap.data() as SocialDoc | undefined)?.friendCode;
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      // setDoc without merge on a fresh path, guarded by the security rule's
      // create-only semantics — this either claims the code or throws.
      await setDoc(doc(db, 'friendCodes', code), { uid });
      await setDoc(socialDocRef(uid), { friendCode: code }, { merge: true });
      return code;
    } catch {
      // Collision (or a transient error) — try another code.
      continue;
    }
  }
  throw new Error('Could not generate a friend code — try again.');
}

export async function resolveFriendCode(code: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'friendCodes', code.trim().toUpperCase()));
  if (!snap.exists()) return null;
  return (snap.data() as { uid: string }).uid;
}

// Sends a friend request by code. `fromDisplayName`/`fromAvatarColor` are
// copied onto the request so the recipient's incoming-requests list can
// show who it's from without an extra read per request.
export async function sendFriendRequest(
  fromUid: string,
  fromDisplayName: string,
  fromAvatarColor: string | undefined,
  code: string
): Promise<'sent' | 'invalid_code' | 'self' | 'already_friends' | 'already_pending'> {
  const toUid = await resolveFriendCode(code);
  if (!toUid) return 'invalid_code';
  if (toUid === fromUid) return 'self';

  const social = await getFriendUids(fromUid);
  if (social.includes(toUid)) return 'already_friends';

  // Without this, sending twice — a double-tap, or just forgetting a
  // request is already out — created a second, independent pending
  // request. The recipient would then see the same person twice in their
  // incoming list, and accepting one would leave the other sitting there
  // forever (accepting doesn't know to also resolve its duplicate).
  const alreadyPending = await getDocs(
    query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', fromUid),
      where('status', '==', 'pending')
    )
  );
  if (alreadyPending.docs.some(d => (d.data() as { toUid: string }).toUid === toUid)) {
    return 'already_pending';
  }

  await addDoc(collection(db, 'friendRequests'), {
    fromUid,
    toUid,
    fromDisplayName,
    ...(fromAvatarColor ? { fromAvatarColor } : {}),
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return 'sent';
}

export async function getIncomingRequests(uid: string): Promise<FriendRequest[]> {
  const q = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

// Outgoing requests the OTHER person has already accepted, but that this
// account hasn't reflected into its own friend list yet. See the comment on
// syncAcceptedRequests below for why this two-step handshake exists.
export async function getAcceptedOutgoingRequests(uid: string): Promise<FriendRequest[]> {
  const q = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', uid),
    where('status', '==', 'accepted')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function acceptFriendRequest(request: FriendRequest): Promise<void> {
  await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });
  // The recipient can add the sender to their OWN friend list right away —
  // they own that document. The sender's side gets synced the next time
  // their client calls syncAcceptedRequests (below), because a Firestore
  // rule can't let B write to A's private users/{A}/meta/social doc, no
  // matter how the request itself is worded — only A can ever write that
  // document. This is the same one-writer-per-document constraint the rest
  // of the app's rules enforce everywhere else.
  await setDoc(socialDocRef(request.toUid), { friendUids: arrayUnion(request.fromUid) }, { merge: true });
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'friendRequests', requestId), { status: 'rejected' });
}

// Call this on the SENDER's side (e.g. whenever Dashboard/Friends loads).
// Finds requests they sent that the recipient has since accepted, and folds
// each one into the sender's own friend list — completing the handshake
// that acceptFriendRequest starts on the recipient's side. Safe to call
// repeatedly: arrayUnion is a no-op for a uid that's already present.
export async function syncAcceptedRequests(uid: string): Promise<void> {
  const accepted = await getAcceptedOutgoingRequests(uid);
  if (accepted.length === 0) return;
  const newFriendUids = accepted.map(r => r.toUid);
  await setDoc(socialDocRef(uid), { friendUids: arrayUnion(...newFriendUids) }, { merge: true });
}

export async function getFriendUids(uid: string): Promise<string[]> {
  const snap = await getDoc(socialDocRef(uid));
  return (snap.data() as SocialDoc | undefined)?.friendUids ?? [];
}

// Friend cards are just leaderboard rows for those uids. A friend who
// hasn't published to the leaderboard yet (e.g. brand new account, 0 XP)
// simply won't have a row — callers should treat a missing entry as "no
// stats yet" rather than an error.
export async function getFriends(uid: string): Promise<LeaderboardEntry[]> {
  const uids = await getFriendUids(uid);
  if (uids.length === 0) return [];
  const snaps = await Promise.all(uids.map(fUid => getDoc(leaderboardDocRef(fUid))));
  return snaps.filter(s => s.exists()).map(s => s.data() as LeaderboardEntry);
}

// Removing a friend is a one-way local edit — each side only ever touches
// their own social doc, matching the accept flow. If the other person
// wants them removed too, their own next visit doesn't re-add anyone (there's
// no outstanding request left to re-sync), so the relationship simply
// becomes one-directional until the other person also removes it. That's an
// acceptable, honest state for an unmoderated MVP feature rather than
// something that needs fixing.
//
// The accepted friendRequest between the two of them is also deleted here,
// not just left around — otherwise, if `uid` was the original SENDER,
// syncAcceptedRequests would find that same accepted request again on their
// next visit and silently re-add friendUid via arrayUnion, undoing the
// removal the user just asked for.
export async function removeFriend(uid: string, friendUid: string): Promise<void> {
  const uids = await getFriendUids(uid);
  await setDoc(socialDocRef(uid), { friendUids: uids.filter(u => u !== friendUid) }, { merge: true });

  const [asSender, asRecipient] = await Promise.all([
    getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', uid), where('toUid', '==', friendUid))),
    getDocs(query(collection(db, 'friendRequests'), where('fromUid', '==', friendUid), where('toUid', '==', uid))),
  ]);
  await Promise.all(
    [...asSender.docs, ...asRecipient.docs].map(d => deleteDoc(doc(db, 'friendRequests', d.id)))
  );
}
