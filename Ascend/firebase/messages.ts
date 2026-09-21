import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './config';
import { getFriendUids } from './friends';

// Direct messages, scoped to friends only. A conversation between two people
// lives at a DETERMINISTIC id — the two uids, sorted, joined with '_' — so
// "the conversation between A and B" is always the same document no matter
// which side opens it first, with no lookup/query needed to find it. This
// mirrors firestore.rules, which derives the same two uids straight back out
// of the id (`conversationId.split('_')`) to decide who's allowed to read or
// write it, rather than trusting a `participants` array alone.

export type Message = {
  id: string;
  senderId: string;
  text: string;
  // Absent for the brief window between an optimistic local echo and the
  // server round-trip; every persisted message has one.
  createdAt: Timestamp | null;
  deleted: boolean;
};

export type Conversation = {
  id: string;
  participants: [string, string];
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastMessageSenderId?: string;
  // Per-participant "I have seen everything up to here" marker. A key
  // missing entirely (rather than present with some sentinel) is what a
  // participant who has never opened the conversation looks like.
  lastReadAt: Record<string, Timestamp | undefined>;
};

type ConversationDoc = Omit<Conversation, 'id'>;
type MessageDoc = Omit<Message, 'id'>;

export function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

function conversationDocRef(conversationId: string) {
  return doc(db, 'conversations', conversationId);
}

function messagesCollectionRef(conversationId: string) {
  return collection(db, 'conversations', conversationId, 'messages');
}

function socialDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'social');
}

type SocialDoc = { friendUids?: string[]; blockedUids?: string[] };

/** Given a conversation, the uid on the other end from `uid`. */
export function otherParticipant(conversation: Pick<Conversation, 'participants'>, uid: string): string {
  return conversation.participants[0] === uid ? conversation.participants[1] : conversation.participants[0];
}

/** True if `conversation` has a message `uid` hasn't seen yet. */
export function hasUnread(conversation: Conversation, uid: string): boolean {
  if (!conversation.lastMessageAt) return false;
  if (conversation.lastMessageSenderId === uid) return false; // your own last message isn't "unread" for you
  const readAt = conversation.lastReadAt?.[uid];
  if (!readAt) return true;
  return conversation.lastMessageAt.toMillis() > readAt.toMillis();
}

// Creates the conversation doc if it doesn't exist yet, otherwise is a no-op.
// Requires `otherUid` to already be a friend — the app-level half of "DMs are
// friends-only" (firestore.rules enforces the same restriction server-side,
// so this check existing here is about a fast, friendly error message rather
// than being the only thing standing in the way of a stranger).
export async function getOrCreateConversation(myUid: string, otherUid: string): Promise<string> {
  const friendUids = await getFriendUids(myUid);
  if (!friendUids.includes(otherUid)) {
    throw new Error('You can only message friends.');
  }

  const conversationId = conversationIdFor(myUid, otherUid);
  const ref = conversationDocRef(conversationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const participants = [myUid, otherUid].sort() as [string, string];
    await setDoc(ref, {
      participants,
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: '',
      // Only the creator's own read marker is set here — writing an entry
      // for the other participant would be a cross-user field on a doc this
      // call is racing to create, and isn't needed anyway: "no entry" already
      // means "never read" everywhere this map is consulted.
      lastReadAt: { [myUid]: serverTimestamp() },
    });
  }
  return conversationId;
}

// Subscribes to every conversation `uid` is part of, newest activity first.
// Mirrors the onSnapshot pattern SettingsScreen/firebase/sessions.ts already
// use elsewhere in this app: caller owns the returned unsubscribe.
export function subscribeToConversations(
  uid: string,
  callback: (conversations: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as ConversationDoc) })));
  });
}

// Single-conversation subscription — ChatScreen uses this (rather than
// filtering subscribeToConversations' list down to one id) so read receipts
// update the instant the peer's lastReadAt changes, without re-subscribing
// to every conversation the signed-in user has.
export function subscribeToConversation(
  conversationId: string,
  callback: (conversation: Conversation | null) => void
): Unsubscribe {
  return onSnapshot(conversationDocRef(conversationId), snap => {
    callback(snap.exists() ? { id: snap.id, ...(snap.data() as ConversationDoc) } : null);
  });
}

export function subscribeToMessages(
  conversationId: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  const q = query(messagesCollectionRef(conversationId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...(d.data() as MessageDoc) })));
  });
}

// Sends a message and, in the same round trip, rolls the conversation's
// lastMessage/lastMessageAt/lastMessageSenderId forward and marks it read for
// the SENDER (they've obviously "read" the message they just typed — this is
// what keeps a message you just sent from showing as unread to you the
// instant it lands). setDoc(..., merge) rather than updateDoc on the parent
// doc because the conversation may not have been created yet — same
// self-healing reasoning as getOrCreateConversation, folded in here so a
// caller that already has a conversationId doesn't need to call both.
export async function sendMessage(conversationId: string, senderId: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(messagesCollectionRef(conversationId), {
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
    deleted: false,
  });

  const [uidA, uidB] = conversationId.split('_');
  await setDoc(
    conversationDocRef(conversationId),
    {
      participants: [uidA, uidB],
      lastMessage: trimmed,
      lastMessageAt: serverTimestamp(),
      lastMessageSenderId: senderId,
      lastReadAt: { [senderId]: serverTimestamp() },
    },
    { merge: true }
  );
}

// Marks everything in the conversation read as of now, for `uid`. Called
// when a chat thread opens/comes to the foreground.
export async function markConversationRead(conversationId: string, uid: string): Promise<void> {
  await updateDoc(conversationDocRef(conversationId), {
    [`lastReadAt.${uid}`]: serverTimestamp(),
  });
}

// Soft-delete: the sender's own message is replaced with a placeholder
// rather than removed outright, so the other participant still sees "this
// message was deleted" in its place instead of a confusing gap in the
// thread (and so a delete can't be used to make a message seem like it never
// happened — the other person already saw it before the delete completed on
// their device in the common case). firestore.rules only allows the
// message's own senderId to make this specific edit.
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
    deleted: true,
    text: '',
  });
}

export async function blockUser(uid: string, blockedUid: string): Promise<void> {
  await setDoc(socialDocRef(uid), { blockedUids: arrayUnion(blockedUid) }, { merge: true });
}

export async function unblockUser(uid: string, blockedUid: string): Promise<void> {
  await setDoc(socialDocRef(uid), { blockedUids: arrayRemove(blockedUid) }, { merge: true });
}

// Whether `uid` has blocked `otherUid` — i.e. "have I blocked them", checked
// from the caller's OWN social doc. This can only ever answer that direction:
// firestore.rules keeps users/{uid} readable by its owner alone (same as
// every other private doc in this app), so there is no client-side way to
// ask "has the other person blocked ME" — that question is answered
// server-side instead, by sendMessage's write simply being rejected. Callers
// that need to react to that surface it from the caught error, not from this
// function.
export async function isBlocked(uid: string, otherUid: string): Promise<boolean> {
  const snap = await getDoc(socialDocRef(uid));
  return ((snap.data() as SocialDoc | undefined)?.blockedUids ?? []).includes(otherUid);
}

// A lightweight flag, not a moderation queue — there's no admin UI reading
// this back (see firestore.rules: reports is create-only, no client read).
// Whoever reviews reports does it the same way onboardingEvents' funnel data
// is read: directly against the project, outside the app.
export async function reportUser(reporterUid: string, reportedUid: string, reason: string): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterUid,
    reportedUid,
    reason: reason.trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });
}
