import { doc, collection, query, orderBy, limit, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './config';
import { TOTAL_XP_PER_LEVEL } from './progress';

// Everything else in this app lives under users/{uid}/… and is readable only
// by that user — which is exactly right for private data, but it makes a
// leaderboard impossible: ranking people requires reading across accounts.
//
// So the leaderboard is a SEPARATE top-level collection holding only the few
// fields that are meant to be public. Nothing private (email, weight, age,
// food log) is ever copied here. Security rules let any signed-in user READ
// the collection but only let each user WRITE their own row — see
// firestore.rules.
export type LeaderboardEntry = {
  uid: string;
  displayName: string;
  avatar: string;
  // The user's chosen initials-avatar color, mirroring UserProfile's
  // avatarColor — undefined means "use the deterministic default for this
  // uid", same rule as everywhere else. Optional so a row published before
  // this field existed still reads fine; LeaderboardScreen falls back to the
  // same hash-based default Avatar always uses when it's missing.
  avatarColor?: string;
  level: number;
  totalXP: number;
  rank: string;
  streak: number;
};

export function leaderboardDocRef(uid: string) {
  return doc(db, 'leaderboard', uid);
}

// A leaderboard row only carries `displayName` — "Marcus D." — not separate
// first-name/last-initial fields, because DashboardScreen composes that
// string once at publish time and nothing downstream needed the parts back
// apart until the Avatar component needed real initials to draw instead of
// an emoji. Splitting it back out here, in the one file that owns the
// format, means LeaderboardScreen doesn't have to know or guess how a
// display name is built — the two stay in sync by construction.
export function parseDisplayName(displayName: string): { firstName: string; lastInitial: string } {
  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  // The second word is "D." — strip the trailing period DashboardScreen adds.
  const lastInitial = (parts[1] ?? '').replace(/\.$/, '');
  return { firstName, lastInitial };
}

// Level and current-XP alone can't be sorted meaningfully (someone at level 9
// with 90 XP has earned more than someone at level 10 with 0), so we store a
// single cumulative number and rank on that.
export function computeTotalXP(level: number, currentXP: number): number {
  return (level - 1) * TOTAL_XP_PER_LEVEL + currentXP;
}

// Called whenever a user's XP or profile changes. Uses their uid as the
// document ID so each person has exactly one row that gets overwritten,
// rather than accumulating a new entry every time they earn XP.
export async function publishToLeaderboard(entry: LeaderboardEntry): Promise<void> {
  await setDoc(leaderboardDocRef(entry.uid), entry);
}

// Top N by total XP. Firestore does the sorting and limiting server-side, so
// this stays cheap no matter how many users exist — it never downloads the
// whole collection to sort locally.
export async function fetchTopEntries(max = 50): Promise<LeaderboardEntry[]> {
  const q = query(collection(db, 'leaderboard'), orderBy('totalXP', 'desc'), limit(max));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data() as LeaderboardEntry);
}

// A small, fixed set rather than a free-text emoji picker — keeps the write
// validated by firestore.rules' size check meaningful, and keeps the row UI
// from needing to lay out an arbitrary string.
export const REACTION_EMOJI = ['🔥', '👏', '💪'] as const;
export type ReactionEmoji = typeof REACTION_EMOJI[number];

function reactionDocRef(entryUid: string, reactorUid: string) {
  return doc(db, 'leaderboard', entryUid, 'reactions', reactorUid);
}

// One reaction per person per row — tapping a new emoji overwrites your
// previous one rather than stacking, so `reactions.length` for a row is
// always "number of distinct people who reacted," never "number of taps."
export async function setReaction(entryUid: string, reactorUid: string, emoji: ReactionEmoji): Promise<void> {
  await setDoc(reactionDocRef(entryUid, reactorUid), { uid: reactorUid, emoji });
}

export async function clearReaction(entryUid: string, reactorUid: string): Promise<void> {
  await deleteDoc(reactionDocRef(entryUid, reactorUid));
}

export type ReactionSummary = { emoji: string; uid: string }[];

// One read per row. Callers should only call this for rows actually on
// screen (see LeaderboardScreen) rather than every row in a long list — a
// leaderboard capped at 50 entries makes that a bounded, small cost, but
// there's no reason to pay it for rows the user hasn't scrolled to.
export async function fetchReactions(entryUid: string): Promise<ReactionSummary> {
  const snap = await getDocs(collection(db, 'leaderboard', entryUid, 'reactions'));
  return snap.docs.map(d => d.data() as { uid: string; emoji: string });
}
