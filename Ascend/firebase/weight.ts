import { doc } from 'firebase/firestore';
import { db } from './config';
import { getTodayKey } from './progress';

// Onboarding captures a starting weight, but that's a single snapshot — it
// never changes unless the user edits their profile. This is a proper log:
// one entry per day they weigh in, so progress over time is visible.
export type WeightEntry = {
  date: string; // "YYYY-MM-DD", same format as the daily doc keys
  weightLbs: number;
};

export function weightLogDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'weightLog');
}

// Adds or replaces today's entry, keeping the log sorted oldest-first.
// Replacing rather than appending means weighing in twice on the same day
// corrects the number instead of creating two competing entries for one day.
export function upsertTodayWeight(entries: WeightEntry[], weightLbs: number): WeightEntry[] {
  const today = getTodayKey();
  const withoutToday = entries.filter(e => e.date !== today);
  return [...withoutToday, { date: today, weightLbs }].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight(entries: WeightEntry[]): WeightEntry | null {
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

// Change since the oldest logged entry — positive means gained, negative
// means lost. Returns null when there's nothing to compare against yet
// (fewer than two entries), so the UI can hide the trend instead of
// showing a meaningless "0 lbs change".
export function weightChange(entries: WeightEntry[]): number | null {
  if (entries.length < 2) return null;
  return Math.round((entries[entries.length - 1].weightLbs - entries[0].weightLbs) * 10) / 10;
}
