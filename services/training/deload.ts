// When to suggest an easier week, and what an easier week looks like.

import type { WorkoutTemplate } from '../../data/workoutPlans';

export type DeloadReason = 'weeks' | 'frequency' | 'sleep' | 'completion';
export type DeloadSignals = {
  trainingWeeksInARow: number;       // weeks with 2+ workouts, counting back from this one
  workoutsLast7: number;
  avgSleepLast5: number | null;      // hours, null when not enough nights are logged
  recentCompletion: number[];        // share of planned sets finished in the last logged workouts, newest first
  daysSinceDeload: number | null;    // null if never
};

export function deloadAdvice(s: DeloadSignals): { recommended: boolean; reasons: DeloadReason[] } {
  if (s.daysSinceDeload !== null && s.daysSinceDeload < 21) return { recommended: false, reasons: [] };
  const reasons: DeloadReason[] = [];
  if (s.trainingWeeksInARow >= 4) reasons.push('weeks');
  if (s.workoutsLast7 >= 6) reasons.push('frequency');
  if (s.avgSleepLast5 !== null && s.avgSleepLast5 < 6) reasons.push('sleep');
  const last3 = s.recentCompletion.slice(0, 3);
  if (last3.length === 3 && last3.reduce((a, b) => a + b, 0) / 3 < 0.7) reasons.push('completion');
  // Two signals together, or a long unbroken run on its own.
  const recommended = reasons.length >= 2 || s.trainingWeeksInARow >= 6;
  return { recommended, reasons };
}

/** Monday-based week index (days since 1970-01-05, a Monday, over 7). */
export function weekIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return Math.floor((days - 4) / 7); // 1970-01-01 was a Thursday; day 4 is the first Monday
}

/** Weeks in a row (ending this week or last week) with at least two workouts. */
export function trainingWeeksInARow(dates: string[], today: string): number {
  const perWeek = new Map<number, number>();
  for (const d of new Set(dates)) perWeek.set(weekIndex(d), (perWeek.get(weekIndex(d)) ?? 0) + 1);
  let w = weekIndex(today);
  // This week may still be in progress; start from last week if it isn't yet a training week.
  if ((perWeek.get(w) ?? 0) < 2) w -= 1;
  let n = 0;
  while ((perWeek.get(w) ?? 0) >= 2) { n++; w -= 1; }
  return n;
}

export const DELOAD_SET_FACTOR = 0.6;
export const DELOAD_WEIGHT_FACTOR = 0.9;

/** An easier version of a workout: about 40 percent fewer sets, never fewer than one. */
export function applyDeload(t: WorkoutTemplate): WorkoutTemplate {
  return {
    ...t,
    title: `${t.title} (easy week)`,
    durationMin: Math.max(10, Math.round(t.durationMin * 0.7)),
    exercises: t.exercises.map(e => ({ ...e, sets: Math.max(1, Math.ceil(e.sets * DELOAD_SET_FACTOR)) })),
  };
}

export const deloadWeight = (w: number) => (w > 0 ? Math.round((w * DELOAD_WEIGHT_FACTOR) / 2.5) * 2.5 : 0);
