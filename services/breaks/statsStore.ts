// Firestore persistence for the per-day break counters. One small document per
// day under users/{uid}/breakDays, so it is covered by the existing owner-only
// rules and deleted with the account. Counts only: no app names, no free text.

import { collection, doc, getDoc, increment, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { cleanDay, dayKey, lastDayKeys, summarizeWeek, IntentId, DayStats, WeekSummary } from './stats';

const col = (uid: string) => collection(db, 'users', uid, 'breakDays');
const DAY_MS = 86_400_000;
export const STATS_RETENTION_DAYS = 90;

export type BreakEvent =
  | { kind: 'done'; outcome: 'stay' | 'exit'; intent?: IntentId }
  | { kind: 'pass' }
  | { kind: 'strict' };

// Adds one event to today's counters. `increment` makes it safe if two devices write at once.
export async function recordBreakEvent(uid: string, e: BreakEvent, now: Date = new Date()): Promise<void> {
  const body: Record<string, unknown> = { expireAt: Timestamp.fromMillis(now.getTime() + STATS_RETENTION_DAYS * DAY_MS) };
  if (e.kind === 'done') {
    body.done = increment(1);
    body[e.outcome] = increment(1);
    if (e.intent) body.intent = { [e.intent]: increment(1) };
  } else if (e.kind === 'pass') {
    body.passes = increment(1);
  } else {
    body.strict = increment(1);
  }
  await setDoc(doc(col(uid), dayKey(now)), body, { merge: true });
}

export async function loadToday(uid: string, now: Date = new Date()): Promise<DayStats> {
  const snap = await getDoc(doc(col(uid), dayKey(now)));
  return cleanDay(snap.exists() ? snap.data() : undefined);
}

export async function loadWeek(uid: string, now: Date = new Date()): Promise<WeekSummary> {
  const keys = lastDayKeys(now, 7);
  const snaps = await Promise.all(keys.map(k => getDoc(doc(col(uid), k))));
  const byDay: Record<string, DayStats> = {};
  snaps.forEach((s, i) => { if (s.exists()) byDay[keys[i]] = cleanDay(s.data()); });
  return summarizeWeek(byDay, now);
}

