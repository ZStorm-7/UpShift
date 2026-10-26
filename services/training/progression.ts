// Logging weight and reps per set, suggesting the next session's numbers, and spotting records.
// Pure functions; the screens and Firestore code live elsewhere.

import { normalizeExerciseName } from '../../data/exerciseGuides';

export type LoggedSet = { weight: number; reps: number; done: boolean };
export type LoggedExercise = { name: string; sets: LoggedSet[] };
export type WorkoutLog = {
  id: string; date: string; title: string; durationSec: number; exercises: LoggedExercise[]; ts: number;
};
export type RecordEntry = { bestWeight: number; bestWeightReps: number; bestE1rm: number; bestVolume: number; date: string };
export type Records = Record<string, RecordEntry>;
export type PrKind = 'weight' | 'e1rm' | 'volume';
export type PersonalRecord = { name: string; kind: PrKind; value: number; previous: number };

export const MAX_WEIGHT = 2000;
export const MAX_REPS = 200;

/** Whole or half numbers in a plausible range, otherwise 0. Keeps junk out of the log. */
export function cleanWeight(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(Math.min(n, MAX_WEIGHT) * 2) / 2;
}
export function cleanReps(v: unknown): number {
  const n = Math.floor(Number(String(v ?? '').trim()));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_REPS) : 0;
}

/** "10-12" -> {lo:10, hi:12}; "8" or "8/side" -> {8, 8}; times and AMRAP -> null. */
export function parseRepRange(reps: string): { lo: number; hi: number } | null {
  const m = String(reps ?? '').trim().match(/^(\d+)(?:-(\d+))?(?:\/side)?$/i);
  if (!m) return null;
  const lo = parseInt(m[1], 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  return lo > 0 && hi >= lo ? { lo, hi } : null;
}

/** Epley estimate of a one-rep max. One rep is the weight itself. */
export function epley(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export type Suggestion = {
  weight: number; reps: number;
  reason: 'start' | 'add-weight' | 'add-reps' | 'repeat' | 'ease';
};

/** Step size for adding weight: smaller jumps for lighter loads. */
export const increment = (weight: number) => (weight >= 100 ? 5 : weight >= 40 ? 2.5 : 1);

/**
 * Double progression: stay at a weight until every working set reaches the top of the rep range,
 * then add a little weight and start from the bottom again. Falling well short of the range eases off.
 */
export function suggestNext(prev: LoggedExercise | null, planReps: string): Suggestion {
  const range = parseRepRange(planReps);
  const target = range ?? { lo: 8, hi: 8 };
  const done = (prev?.sets ?? []).filter(s => s.done && s.reps > 0);
  if (!prev || done.length === 0) return { weight: 0, reps: target.hi, reason: 'start' };
  const weight = Math.max(...done.map(s => s.weight));
  if (weight <= 0) {
    // Bodyweight: add reps until the top of the range.
    const best = Math.max(...done.map(s => s.reps));
    return { weight: 0, reps: Math.max(best + 1, target.lo), reason: 'add-reps' };
  }
  const atWeight = done.filter(s => s.weight === weight);
  if (atWeight.every(s => s.reps >= target.hi)) {
    return { weight: roundTo(weight + increment(weight), 0.5), reps: target.lo, reason: 'add-weight' };
  }
  const worst = Math.min(...atWeight.map(s => s.reps));
  if (worst < target.lo - 2) {
    return { weight: roundTo(weight * 0.95, 2.5) || weight, reps: target.lo, reason: 'ease' };
  }
  const best = Math.max(...atWeight.map(s => s.reps));
  if (worst < target.lo) return { weight, reps: target.lo, reason: 'repeat' };
  return { weight, reps: Math.min(target.hi, best + 1), reason: 'add-reps' };
}

const setVolume = (s: LoggedSet) => (s.done && s.weight > 0 ? s.weight * s.reps : 0);
export const exerciseVolume = (e: LoggedExercise) => e.sets.reduce((n, s) => n + setVolume(s), 0);
export const workoutVolume = (exs: LoggedExercise[]) => exs.reduce((n, e) => n + exerciseVolume(e), 0);

/**
 * Compare a finished workout with the stored records. The first time an exercise is logged only
 * sets the baseline: nothing is celebrated until there is something to beat.
 */
export function detectRecords(records: Records, logged: LoggedExercise[], date: string): { next: Records; prs: PersonalRecord[] } {
  const next: Records = { ...records };
  const prs: PersonalRecord[] = [];
  for (const ex of logged) {
    const key = normalizeExerciseName(ex.name);
    const sets = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
    if (!key || sets.length === 0) continue;
    const bestWeightSet = sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
    const e1rm = Math.max(...sets.map(s => epley(s.weight, s.reps)));
    const volume = exerciseVolume(ex);
    const prev = records[key];
    if (prev) {
      if (bestWeightSet.weight > prev.bestWeight) prs.push({ name: ex.name, kind: 'weight', value: bestWeightSet.weight, previous: prev.bestWeight });
      if (e1rm > prev.bestE1rm && bestWeightSet.weight <= prev.bestWeight) prs.push({ name: ex.name, kind: 'e1rm', value: e1rm, previous: prev.bestE1rm });
      if (volume > prev.bestVolume && !prs.some(p => p.name === ex.name)) prs.push({ name: ex.name, kind: 'volume', value: volume, previous: prev.bestVolume });
    }
    next[key] = {
      bestWeight: Math.max(prev?.bestWeight ?? 0, bestWeightSet.weight),
      bestWeightReps: prev && prev.bestWeight > bestWeightSet.weight ? prev.bestWeightReps : bestWeightSet.reps,
      bestE1rm: Math.max(prev?.bestE1rm ?? 0, e1rm),
      bestVolume: Math.max(prev?.bestVolume ?? 0, volume),
      date: prev && prev.bestWeight > bestWeightSet.weight ? prev.date : date,
    };
  }
  return { next, prs };
}

/** The most recent logged version of an exercise, searching newest-first. */
export function lastLogOf(name: string, logs: WorkoutLog[]): LoggedExercise | null {
  const key = normalizeExerciseName(name);
  const sorted = [...logs].sort((a, b) => b.ts - a.ts);
  for (const l of sorted) {
    const hit = l.exercises.find(e => normalizeExerciseName(e.name) === key && e.sets.some(s => s.done));
    if (hit) return hit;
  }
  return null;
}
