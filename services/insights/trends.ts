// Trends that explain: what tends to go with what in the person's own recent days.
// These are patterns, not proof, and the screen says so. Everything is data (keys and numbers).

import type { DaySummary } from './days';
import { avg } from './days';

export type Metric = 'water' | 'sleep' | 'calories' | 'workouts';
export type Cause = 'goodSleep' | 'workout';
export type Effect = 'water' | 'workoutRate' | 'calories' | 'sleep';

export type Compare = { kind: 'compare'; cause: Cause; effect: Effect; with: number; without: number; nWith: number; nWithout: number };
export type Trend = { kind: 'trend'; metric: Metric; from: number; to: number; pct: number };
export type Insight = Compare | Trend;

export const MIN_GROUP = 4;       // days in each group before we say anything
export const SLEEP_GOOD = 7;      // hours
const round1 = (n: number) => Math.round(n * 10) / 10;

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lastDays(today: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i))));
}

// How big a gap must be, relative to the lower group, to be worth mentioning.
const MIN_GAP: Record<Effect, number> = { water: 0.15, workoutRate: 0.2, calories: 0.1, sleep: 0.08 };

function compare(days: DaySummary[], cause: Cause, effect: Effect): Compare | null {
  const has = (d: DaySummary) => (cause === 'goodSleep' ? d.sleep >= SLEEP_GOOD : d.workouts > 0);
  // Only days where the effect was actually recorded can speak for it.
  const usable = days.filter(d => {
    if (effect === 'water') return d.water > 0;
    if (effect === 'calories') return d.meals > 0;
    if (effect === 'sleep') return d.sleep > 0;
    return d.logged;
  });
  const knowCause = (d: DaySummary) => (cause === 'goodSleep' ? d.sleep > 0 : d.logged);
  const pool = usable.filter(knowCause);
  const a = pool.filter(has), b = pool.filter(d => !has(d));
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null;
  const val = (d: DaySummary) => (effect === 'water' ? d.water : effect === 'calories' ? d.calories : effect === 'sleep' ? d.sleep : d.workouts > 0 ? 1 : 0);
  const withV = avg(a.map(val)), withoutV = avg(b.map(val));
  const low = Math.min(withV, withoutV);
  const gap = low === 0 ? (withV === withoutV ? 0 : 1) : Math.abs(withV - withoutV) / low;
  if (gap < MIN_GAP[effect]) return null;
  return { kind: 'compare', cause, effect, with: effect === 'workoutRate' ? Math.round(withV * 100) : round1(withV), without: effect === 'workoutRate' ? Math.round(withoutV * 100) : round1(withoutV), nWith: a.length, nWithout: b.length };
}

const PAIRS: [Cause, Effect][] = [['goodSleep', 'water'], ['goodSleep', 'workoutRate'], ['goodSleep', 'calories'], ['workout', 'water'], ['workout', 'sleep'], ['workout', 'calories']];

function trend(days: DaySummary[], metric: Metric): Trend | null {
  const half = Math.floor(days.length / 2);
  const pick = (ds: DaySummary[]) => ds.map(d => (metric === 'water' ? d.water : metric === 'sleep' ? d.sleep : metric === 'calories' ? d.calories : d.workouts)).filter(v => v > 0);
  const older = pick(days.slice(0, half)), newer = pick(days.slice(half));
  if (older.length < MIN_GROUP || newer.length < MIN_GROUP) return null;
  const from = avg(older), to = avg(newer);
  if (from === 0) return null;
  const pct = Math.round(((to - from) / from) * 100);
  return Math.abs(pct) >= 10 ? { kind: 'trend', metric, from, to, pct } : null;
}

/** Up to `max` insights, biggest differences first. Empty when there is not enough data yet. */
export function buildInsights(days: DaySummary[], max = 4): Insight[] {
  const out: (Insight & { weight: number })[] = [];
  for (const [c, e] of PAIRS) { const x = compare(days, c, e); if (x) out.push({ ...x, weight: Math.abs(x.with - x.without) / Math.max(1, Math.min(x.with, x.without)) }); }
  for (const m of ['water', 'sleep', 'calories', 'workouts'] as Metric[]) { const x = trend(days, m); if (x) out.push({ ...x, weight: Math.abs(x.pct) / 100 }); }
  return out.sort((a, b) => b.weight - a.weight).slice(0, max).map(({ weight, ...rest }) => rest as Insight);
}
