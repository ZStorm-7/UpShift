import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDay, avg, type DaySummary } from '../services/insights/days';
import { buildWeeklyReview, weekStats, suggestGoals, goalProgress, parseGoalId, weekKey, isReviewDay } from '../services/habits/weeklyReview';

const G = { calories: 2000, water: 2500, sleep: 8 };
const day = (date: string, o: Partial<DaySummary> = {}): DaySummary => ({ date, calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0, water: 0, sleep: 0, workouts: 0, breaks: 0, logged: false, ...o });
const week = (f: (i: number) => Partial<DaySummary>) => Array.from({ length: 7 }, (_, i) => day(`2026-10-${19 + i}`, f(i)));

test('a day summary adds up the food log and ignores junk', () => {
  const s = summarizeDay('2026-10-26', { foodLog: [{ calories: 300, protein: 20, carbs: 30, fat: 10 }, { calories: '200', protein: -5, carbs: 'x', fat: 5.55 }, null], waterTotal: 750, sleepHours: 7.46, workoutsCompleted: 1 }, 2);
  assert.deepEqual(s, { date: '2026-10-26', calories: 500, protein: 20, carbs: 30, fat: 15.6, meals: 3, water: 750, sleep: 7.5, workouts: 1, breaks: 2, logged: true });
  assert.equal(summarizeDay('d', null).logged, false); assert.equal(summarizeDay('d', { foodLog: 'nope', waterTotal: 1e9 }).water, 20000);
  assert.equal(avg([]), 0); assert.equal(avg([7, 8, 7.5]), 7.5);
});
test('week stats', () => {
  const s = weekStats(week(i => ({ workouts: i % 2, water: i < 5 ? 2200 : 500, sleep: i < 6 ? 7.5 : 0, meals: i < 4 ? 3 : 0, calories: i < 4 ? 1900 : 0, logged: true, breaks: 1 })), G);
  assert.deepEqual(s, { workouts: 3, waterDays: 5, sleepAvg: 7.5, sleepNights: 6, loggedDays: 4, calorieDays: 4, breaks: 7, activeDays: 7 });
});
test('a strong week lists up to three wins and works on the weakest area', () => {
  const r = buildWeeklyReview(week(i => ({ workouts: i < 4 ? 1 : 0, water: 2400, sleep: 8, meals: 3, calories: 2000, logged: true })), G, 9);
  assert.equal(r.wins.length, 3); assert.deepEqual(r.wins.map(w => w.key), ['workouts', 'water', 'sleep']);
  assert.equal(r.improve, 'workouts'); // 4/3 -> capped at 1, everything is 1: ties resolve to the first in order
  assert.equal(r.goals.length, 3);
});
test('a rough week still finds something kind to say, and one thing to fix', () => {
  const quiet = buildWeeklyReview(week(i => (i < 2 ? { water: 300, logged: true } : {})), G, 0);
  assert.deepEqual(quiet.wins, [{ key: 'showedUp', n: 2 }]); assert.equal(quiet.improve, 'workouts');
  const empty = buildWeeklyReview(week(() => ({})), G, 0);
  assert.deepEqual(empty.wins, []);
  const sleepy = buildWeeklyReview(week(() => ({ workouts: 1, water: 2500, meals: 3, sleep: 4, logged: true })), G, 0);
  assert.equal(sleepy.improve, 'sleep');
});
test('goal suggestions are a step up, in range, weakest first', () => {
  const s = weekStats(week(() => ({})), G);
  const g = suggestGoals(s, 'sleep');
  assert.equal(g[0].area, 'sleep'); assert.deepEqual(g.map(x => x.id), ['sleep-3', 'workouts-2', 'water-3']);
  const hi = suggestGoals({ ...s, workouts: 9, waterDays: 7, sleepNights: 7, loggedDays: 7 }, 'workouts');
  assert.deepEqual(hi.map(x => x.target), [5, 7, 7]);
});
test('goal progress and ids', () => {
  const d = week(i => ({ workouts: i < 2 ? 1 : 0, logged: true }));
  assert.deepEqual(goalProgress({ id: 'workouts-3', area: 'workouts', target: 3 }, d, G), { value: 2, target: 3, done: false });
  assert.equal(goalProgress({ id: 'workouts-2', area: 'workouts', target: 2 }, d, G).done, true);
  assert.deepEqual(parseGoalId('water-5'), { id: 'water-5', area: 'water', target: 5 });
  for (const bad of ['water-0', 'water-99', 'drink-5', '', null, 'water-5; drop']) assert.equal(parseGoalId(bad), null, String(bad));
});
test('weeks start on Monday and Sunday/Monday are review days', () => {
  assert.equal(weekKey('2026-10-26'), '2026-10-26'); assert.equal(weekKey('2026-10-25'), '2026-10-19'); assert.equal(weekKey('2026-11-01'), '2026-10-26'); assert.equal(weekKey('2026-01-01'), '2025-12-29');
  assert.equal(isReviewDay(new Date(2026, 9, 25)), true); assert.equal(isReviewDay(new Date(2026, 9, 26)), true); assert.equal(isReviewDay(new Date(2026, 9, 28)), false);
});

import { reviewRange, nextWeekKey } from '../services/habits/weeklyReview';
test('review ranges: Sunday covers this week, Monday last week, other days the last seven', () => {
  const sun = reviewRange(new Date(2026, 9, 25)); assert.deepEqual([sun.keys[0], sun.keys[6], sun.weekOf], ['2026-10-19', '2026-10-25', '2026-10-19']);
  const mon = reviewRange(new Date(2026, 9, 26)); assert.deepEqual([mon.keys[0], mon.keys[6], mon.weekOf], ['2026-10-19', '2026-10-25', '2026-10-19']);
  const wed = reviewRange(new Date(2026, 9, 28)); assert.deepEqual([wed.keys[0], wed.keys[6]], ['2026-10-22', '2026-10-28']);
  assert.equal(reviewRange(new Date(2026, 0, 4)).keys[0], '2025-12-29');
  assert.equal(nextWeekKey('2026-10-19'), '2026-10-26'); assert.equal(nextWeekKey('2026-12-28'), '2027-01-04');
});

import { monthKeyUtc as clientKey, daysLeftInMonthUtc, monthLabel } from '../services/habits/season';
import { monthKeyUtc as serverKey } from '../functions/src/season';
test('seasons: client and server agree on the month, and the countdown is right', () => {
  for (const ms of [Date.UTC(2026, 0, 1), Date.UTC(2026, 9, 31, 23, 59, 59), Date.UTC(2026, 11, 31, 12), Date.UTC(2027, 1, 28, 0, 0, 1)]) assert.equal(clientKey(ms), serverKey(ms));
  assert.equal(daysLeftInMonthUtc(Date.UTC(2026, 9, 31, 12)), 1); assert.equal(daysLeftInMonthUtc(Date.UTC(2026, 9, 26, 12)), 6); assert.equal(daysLeftInMonthUtc(Date.UTC(2026, 9, 1, 0, 0, 0)), 31);
  assert.equal(monthLabel(Date.UTC(2026, 9, 15), 'en-US'), 'October 2026');
});
