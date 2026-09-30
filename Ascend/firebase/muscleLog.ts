import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';
import { getTodayKey } from './progress';
import { MuscleGroup } from '../data/muscleGroups';

// One entry per completed workout day — mirrors weightLog's shape
// (firebase/weight.ts) deliberately: a single small array doc rather than a
// subcollection, since this never needs more than the last couple of weeks
// read at once and a whole subcollection's worth of query/index machinery
// (see the conversations-collection bug this session already hit once) is
// more than a handful of rows justifies.
export type MuscleLogEntry = {
  date: string; // "YYYY-MM-DD"
  muscleGroups: MuscleGroup[];
};

export function muscleLogDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'muscleLog');
}

// Same replace-not-append reasoning as upsertTodayWeight: a second workout
// finished the same day adds to today's trained groups instead of creating
// a competing entry that'd make "days since last trained" ambiguous about
// which of two same-day entries to measure from.
export function upsertTodayMuscles(entries: MuscleLogEntry[], muscleGroups: MuscleGroup[]): MuscleLogEntry[] {
  const today = getTodayKey();
  const existing = entries.find(e => e.date === today);
  const merged = existing ? Array.from(new Set([...existing.muscleGroups, ...muscleGroups])) : muscleGroups;
  const withoutToday = entries.filter(e => e.date !== today);
  return [...withoutToday, { date: today, muscleGroups: merged }].sort((a, b) => a.date.localeCompare(b.date));
}

export async function recordMusclesTrainedToday(uid: string, muscleGroups: MuscleGroup[]): Promise<void> {
  if (muscleGroups.length === 0) return;
  const snap = await getDoc(muscleLogDocRef(uid));
  const entries: MuscleLogEntry[] = snap.exists() ? snap.data().entries || [] : [];
  const updated = upsertTodayMuscles(entries, muscleGroups);
  await setDoc(muscleLogDocRef(uid), { entries: updated });
}

/** Days since each muscle group was last trained, per the log — null means
 * "never logged," which the recovery view treats the same as "long since
 * recovered" rather than as a special case to explain. */
export function daysSinceTrained(entries: MuscleLogEntry[], group: MuscleGroup): number | null {
  const dates = entries.filter(e => e.muscleGroups.includes(group)).map(e => e.date);
  if (dates.length === 0) return null;
  const mostRecent = dates.sort().at(-1)!;
  const [y, m, d] = mostRecent.split('-').map(Number);
  const last = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - last.getTime()) / 86400000);
}
