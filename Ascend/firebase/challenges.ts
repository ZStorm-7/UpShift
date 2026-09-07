import {
  doc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

// v1 supports exactly one goal type — most workouts logged during the
// challenge window. The type is still a union (not a literal) so adding a
// second goal later (e.g. 'streak', 'xp') is additive everywhere this type
// is used, not a breaking change.
export type ChallengeGoalType = 'workouts';

export type Challenge = {
  id: string;
  createdBy: string;
  participants: [string, string];
  goalType: ChallengeGoalType;
  goalLabel: string; // human-readable, e.g. "Most workouts this week"
  startDate: string; // ISO date, inclusive
  endDate: string; // ISO date, inclusive
  status: 'active' | 'completed';
  scores: Record<string, number>;
  winnerUid?: string;
};

// Local calendar date, NOT `new Date().toISOString().slice(0, 10)` — that
// reads the UTC date, which is a real bug here: `countWorkoutsInRange`
// compares this against day-doc IDs that are built from the LOCAL date (see
// getTodayKey in firebase/progress.ts). For anyone west of UTC, there's a
// stretch of local evening where the UTC date has already rolled to
// tomorrow — a challenge created then would get a startDate one day ahead
// of the user's actual today, silently excluding today's workouts from the
// very challenge that just started. Mirrors getTodayKey()'s exact
// local-field construction so the two can never disagree.
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, day] = iso.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Creates a 7-day challenge starting today between the two participants.
// Both uids get read/write access per firestore.rules the moment this
// document exists — no separate "invite accepted" step, since a challenge
// can only be created between two people who are already friends (enforced
// by the caller — see ChallengesScreen), so there's no stranger-invite abuse
// surface to gate here the way there is for friend requests.
export async function createChallenge(
  createdBy: string,
  friendUid: string,
  goalLabel: string,
  days = 7
): Promise<string> {
  const startDate = todayIso();
  const endDate = addDaysIso(startDate, days - 1);
  const ref = await addDoc(collection(db, 'challenges'), {
    createdBy,
    participants: [createdBy, friendUid],
    goalType: 'workouts' as ChallengeGoalType,
    goalLabel,
    startDate,
    endDate,
    status: 'active',
    scores: { [createdBy]: 0, [friendUid]: 0 },
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Sums `workoutsCompleted` across the caller's OWN day documents that fall
// within [startDate, endDate] (inclusive, both "YYYY-MM-DD"). String
// comparison is enough to bound the range because day-doc IDs are already
// in that zero-padded format, which sorts identically to chronological
// order.
//
// This only ever reads users/{uid}/days/* for the signed-in uid itself —
// exactly the private data a person already has full read access to under
// firestore.rules — never a challenge opponent's. That's precisely why
// challenge scores are self-reported (see reportChallengeScore): there is
// no rule that could let one participant read the other's day documents to
// verify them independently.
export async function countWorkoutsInRange(uid: string, startDate: string, endDate: string): Promise<number> {
  const snapshot = await getDocs(collection(db, 'users', uid, 'days'));
  let total = 0;
  snapshot.forEach(docSnap => {
    if (docSnap.id < startDate || docSnap.id > endDate) return;
    total += docSnap.data().workoutsCompleted || 0;
  });
  return total;
}

export async function getMyChallenges(uid: string): Promise<Challenge[]> {
  const q = query(collection(db, 'challenges'), where('participants', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

// True if there's already an ACTIVE challenge between these two people.
// Without this check, tapping "Challenge" on the same friend twice (an easy
// double-tap, or just tapping again after forgetting you already sent one)
// silently created a second, independent challenge document rather than
// reusing or blocking the first — two live challenges with the same two
// participants and no way to tell them apart in the list beyond the start
// date.
export async function hasActiveChallengeWith(uid: string, friendUid: string): Promise<boolean> {
  const existing = await getMyChallenges(uid);
  return existing.some(
    c => c.status === 'active' && c.participants.includes(friendUid)
  );
}

// Self-reported, like every other client-trusted number in this app (see
// firestore.rules' note on the challenges collection) — each participant
// writes their OWN current count into `scores`, computed from their own
// private workout history that only they can read in the first place, so
// there's no way for a Cloud-Function-free client to verify it independently
// even if it wanted to.
export async function reportChallengeScore(
  challengeId: string,
  uid: string,
  currentScores: Record<string, number>,
  newScore: number
): Promise<void> {
  await updateDoc(doc(db, 'challenges', challengeId), {
    scores: { ...currentScores, [uid]: newScore },
  });
}

// Called once a challenge's end date has passed. Any participant's client
// can be the one to close it out — whichever one happens to load the screen
// first after the end date, since the comparison is deterministic and both
// sides would compute the same winner from the same `scores` map.
export async function finalizeChallengeIfDue(challenge: Challenge): Promise<Challenge> {
  if (challenge.status === 'completed') return challenge;
  if (todayIso() <= challenge.endDate) return challenge;

  const [uidA, uidB] = challenge.participants;
  const scoreA = challenge.scores[uidA] ?? 0;
  const scoreB = challenge.scores[uidB] ?? 0;
  const winnerUid = scoreA === scoreB ? undefined : scoreA > scoreB ? uidA : uidB;

  await updateDoc(doc(db, 'challenges', challenge.id), {
    status: 'completed',
    ...(winnerUid ? { winnerUid } : {}),
  });

  return { ...challenge, status: 'completed', winnerUid };
}
