// The Sunday review: what went well, the one thing to work on, and a goal for next week.
// Everything is data (keys and numbers); the screen turns it into words in the person's language.

import type { DaySummary } from '../insights/days';
import { avg } from '../insights/days';

export type Goals = { calories: number; water: number; sleep: number };
export type Area = 'workouts' | 'water' | 'sleep' | 'logging';
export type WinKey = 'workouts' | 'water' | 'sleep' | 'logging' | 'calories' | 'streak' | 'breaks' | 'showedUp';
export type Win = { key: WinKey; n: number };
export type GoalId = `${Area}-${number}`;
export type WeeklyGoal = { id: GoalId; area: Area; target: number };

export type WeekStats = {
  workouts: number; waterDays: number; sleepAvg: number; sleepNights: number; loggedDays: number; calorieDays: number; breaks: number; activeDays: number;
};
export type WeeklyReview = { stats: WeekStats; wins: Win[]; improve: Area; goals: WeeklyGoal[] };

const WATER_OK = 0.8;       // a water day counts at 80 percent of the goal
const SLEEP_OK = 7;         // hours
const CAL_BAND = 0.15;      // within 15 percent of the goal

export function weekStats(days: DaySummary[], g: Goals): WeekStats {
  const slept = days.filter(d => d.sleep > 0);
  return {
    workouts: days.reduce((n, d) => n + d.workouts, 0),
    waterDays: days.filter(d => g.water > 0 && d.water >= g.water * WATER_OK).length,
    sleepAvg: avg(slept.map(d => d.sleep)),
    sleepNights: days.filter(d => d.sleep >= SLEEP_OK).length,
    loggedDays: days.filter(d => d.meals > 0).length,
    calorieDays: days.filter(d => d.meals > 0 && g.calories > 0 && Math.abs(d.calories - g.calories) <= g.calories * CAL_BAND).length,
    breaks: days.reduce((n, d) => n + d.breaks, 0),
    activeDays: days.filter(d => d.logged).length,
  };
}

// How close each area is to a good week, 0 to 1. The lowest is what to work on.
const score = (s: WeekStats): Record<Area, number> => ({
  workouts: Math.min(1, s.workouts / 3), water: Math.min(1, s.waterDays / 5), sleep: Math.min(1, s.sleepNights / 5), logging: Math.min(1, s.loggedDays / 5),
});

export function buildWeeklyReview(days: DaySummary[], g: Goals, streak: number): WeeklyReview {
  const s = weekStats(days, g);
  const wins: Win[] = [];
  if (s.workouts >= 3) wins.push({ key: 'workouts', n: s.workouts });
  if (s.waterDays >= 5) wins.push({ key: 'water', n: s.waterDays });
  if (s.sleepNights >= 5) wins.push({ key: 'sleep', n: s.sleepNights });
  if (s.loggedDays >= 5) wins.push({ key: 'logging', n: s.loggedDays });
  if (s.calorieDays >= 4) wins.push({ key: 'calories', n: s.calorieDays });
  if (s.breaks >= 5) wins.push({ key: 'breaks', n: s.breaks });
  if (streak >= 7) wins.push({ key: 'streak', n: streak });
  if (wins.length === 0 && s.activeDays > 0) wins.push({ key: 'showedUp', n: s.activeDays });
  const sc = score(s);
  const order: Area[] = ['workouts', 'sleep', 'water', 'logging'];
  const improve = order.reduce((worst, a) => (sc[a] < sc[worst] ? a : worst), order[0]);
  return { stats: s, wins: wins.slice(0, 3), improve, goals: suggestGoals(s, improve) };
}

export function suggestGoals(s: WeekStats, improve: Area): WeeklyGoal[] {
  const mk = (area: Area, target: number): WeeklyGoal => ({ id: `${area}-${target}`, area, target });
  const up = (cur: number, step: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, cur + step));
  const byArea: Record<Area, WeeklyGoal> = {
    workouts: mk('workouts', up(s.workouts, 1, 2, 5)),
    water: mk('water', up(s.waterDays, 2, 3, 7)),
    sleep: mk('sleep', up(s.sleepNights, 2, 3, 7)),
    logging: mk('logging', up(s.loggedDays, 2, 3, 7)),
  };
  // The weak spot first, then two others.
  const rest = (['workouts', 'water', 'sleep', 'logging'] as Area[]).filter(a => a !== improve);
  return [byArea[improve], byArea[rest[0]], byArea[rest[1]]];
}

export function goalProgress(goal: WeeklyGoal, days: DaySummary[], g: Goals): { value: number; target: number; done: boolean } {
  const s = weekStats(days, g);
  const value = goal.area === 'workouts' ? s.workouts : goal.area === 'water' ? s.waterDays : goal.area === 'sleep' ? s.sleepNights : s.loggedDays;
  return { value, target: goal.target, done: value >= goal.target };
}

export function parseGoalId(id: unknown): WeeklyGoal | null {
  const m = String(id ?? '').match(/^(workouts|water|sleep|logging)-(\d{1,2})$/);
  return m && +m[2] >= 1 && +m[2] <= 14 ? { id: id as GoalId, area: m[1] as Area, target: +m[2] } : null;
}

/** Monday-based week key (the Monday's date) for a YYYY-MM-DD day. */
export function weekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const back = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - back);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export const isReviewDay = (d: Date) => d.getDay() === 0 || d.getDay() === 1; // Sunday and Monday

const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; };

/**
 * The seven days a review covers. On Sunday it is this Monday to Sunday; on Monday it is last week;
 * any other day it is the seven days ending today.
 */
export function reviewRange(today: Date): { keys: string[]; weekOf: string } {
  const dow = today.getDay();
  const end = dow === 0 ? today : dow === 1 ? addDays(today, -1) : today;
  const keys = Array.from({ length: 7 }, (_, i) => keyOf(addDays(end, i - 6)));
  return { keys, weekOf: dow === 0 || dow === 1 ? weekKey(keys[0]) : keys[0] };
}
/** The week a goal picked in this review applies to: the Monday after the reviewed week. */
export function nextWeekKey(weekOf: string): string {
  const [y, m, d] = weekOf.split('-').map(Number);
  return keyOf(new Date(y, m - 1, d + 7));
}
