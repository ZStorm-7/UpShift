import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRepRange, epley, suggestNext, detectRecords, cleanWeight, cleanReps, workoutVolume, lastLogOf, increment, type LoggedExercise, type WorkoutLog } from '../services/training/progression';
import { deloadAdvice, applyDeload, trainingWeeksInARow, weekIndex, deloadWeight } from '../services/training/deload';
import { cleanCustomWorkout, encodeShareCode, decodeShareCode, customToTemplate, cleanExercise, shareText } from '../services/training/custom';
import { restLength, restRemaining, restEndAt, clockMmSs } from '../services/training/rest';
import type { WorkoutTemplate } from '../data/workoutPlans';

const ex = (name: string, ...sets: [number, number, boolean?][]): LoggedExercise => ({ name, sets: sets.map(([weight, reps, done = true]) => ({ weight, reps, done })) });

test('rep ranges', () => {
  assert.deepEqual(parseRepRange('10-12'), { lo: 10, hi: 12 });
  assert.deepEqual(parseRepRange('8'), { lo: 8, hi: 8 });
  assert.deepEqual(parseRepRange('8/side'), { lo: 8, hi: 8 });
  for (const bad of ['AMRAP', '30s', '20-30s', '', '12-8', '0']) assert.equal(parseRepRange(bad), null, bad);
});
test('clean inputs reject junk and cap extremes', () => {
  assert.equal(cleanWeight('135'), 135); assert.equal(cleanWeight('62,5'), 62.5); assert.equal(cleanWeight('62.26'), 62.5);
  for (const bad of ['', '-5', 'abc', '0', null, NaN]) assert.equal(cleanWeight(bad), 0, String(bad));
  assert.equal(cleanWeight('99999'), 2000);
  assert.equal(cleanReps('12'), 12); assert.equal(cleanReps('0'), 0); assert.equal(cleanReps('x'), 0); assert.equal(cleanReps('9999'), 200); assert.equal(cleanReps('7.9'), 7);
});
test('epley', () => { assert.equal(epley(100, 1), 100); assert.equal(epley(100, 10), 133.3); assert.equal(epley(0, 5), 0); assert.equal(epley(100, 0), 0); });
test('double progression: add weight only when every set tops the range', () => {
  assert.deepEqual(suggestNext(ex('Bench Press', [135, 12], [135, 12], [135, 12]), '10-12'), { weight: 140, reps: 10, reason: 'add-weight' });
  assert.deepEqual(suggestNext(ex('Bench Press', [135, 12], [135, 11], [135, 10]), '10-12'), { weight: 135, reps: 12, reason: 'add-reps' });
  assert.deepEqual(suggestNext(ex('Bench Press', [135, 9], [135, 9]), '10-12'), { weight: 135, reps: 10, reason: 'repeat' });
  assert.deepEqual(suggestNext(ex('Bench Press', [135, 6], [135, 5]), '10-12'), { weight: 127.5, reps: 10, reason: 'ease' });
});
test('suggestions: first time, bodyweight, time-based, unfinished sets', () => {
  assert.deepEqual(suggestNext(null, '8-10'), { weight: 0, reps: 10, reason: 'start' });
  assert.equal(suggestNext(ex('Pull-Up', [0, 6], [0, 5]), '6-8').reps, 7);
  assert.equal(suggestNext(ex('Plank', [0, 30]), '20-30s').reason, 'add-reps');
  assert.equal(suggestNext(ex('Squat', [100, 10, false]), '8-10').reason, 'start');
  assert.equal(increment(150), 5); assert.equal(increment(60), 2.5); assert.equal(increment(20), 1);
});
test('records: first log sets a baseline, later logs can beat it', () => {
  const first = detectRecords({}, [ex('Bench Press', [100, 8])], '2026-10-01');
  assert.equal(first.prs.length, 0);
  assert.equal(first.next['bench press'].bestWeight, 100);
  const second = detectRecords(first.next, [ex('Bench Press', [105, 5])], '2026-10-08');
  assert.deepEqual(second.prs.map(p => [p.kind, p.value, p.previous]), [['weight', 105, 100]]);
  const third = detectRecords(second.next, [ex('Bench Press', [100, 12])], '2026-10-15');
  assert.deepEqual(third.prs.map(p => p.kind), ['e1rm']);
  const fourth = detectRecords(third.next, [ex('Bench Press', [95, 5])], '2026-10-22');
  assert.equal(fourth.prs.length, 0);
  assert.equal(fourth.next['bench press'].bestWeight, 105);
});
test('records ignore unfinished or empty sets and are case-insensitive', () => {
  const r = detectRecords({}, [ex('Row', [50, 10, false]), ex('Curl', [0, 12])], 'd');
  assert.deepEqual(Object.keys(r.next), []);
  const a = detectRecords({}, [ex('BENCH press', [100, 5])], 'd'); const b = detectRecords(a.next, [ex('bench PRESS', [110, 5])], 'd');
  assert.equal(b.prs.length, 1);
});
test('volume and last-log lookup', () => {
  assert.equal(workoutVolume([ex('A', [100, 10], [100, 8, false])]), 1000);
  const logs: WorkoutLog[] = [
    { id: '1', date: 'a', title: 't', durationSec: 1, ts: 1, exercises: [ex('Squat', [100, 5])] },
    { id: '2', date: 'b', title: 't', durationSec: 1, ts: 2, exercises: [ex('Squat', [110, 5])] },
    { id: '3', date: 'c', title: 't', durationSec: 1, ts: 3, exercises: [ex('Squat', [120, 5, false])] },
  ];
  assert.equal(lastLogOf('squat', logs)!.sets[0].weight, 110);
  assert.equal(lastLogOf('Curl', logs), null);
});

test('deload advice needs two signals, or a very long run', () => {
  const base = { trainingWeeksInARow: 1, workoutsLast7: 3, avgSleepLast5: 7.5, recentCompletion: [1, 1, 1], daysSinceDeload: null };
  assert.equal(deloadAdvice(base).recommended, false);
  assert.equal(deloadAdvice({ ...base, trainingWeeksInARow: 4 }).recommended, false);
  assert.deepEqual(deloadAdvice({ ...base, trainingWeeksInARow: 4, avgSleepLast5: 5.2 }), { recommended: true, reasons: ['weeks', 'sleep'] });
  assert.equal(deloadAdvice({ ...base, trainingWeeksInARow: 6 }).recommended, true);
  assert.deepEqual(deloadAdvice({ ...base, workoutsLast7: 6, recentCompletion: [0.5, 0.6, 0.7] }).reasons, ['frequency', 'completion']);
  assert.equal(deloadAdvice({ ...base, trainingWeeksInARow: 8, daysSinceDeload: 10 }).recommended, false);
  assert.equal(deloadAdvice({ ...base, avgSleepLast5: null }).reasons.includes('sleep'), false);
});
test('weeks in a row', () => {
  assert.equal(weekIndex('2026-10-26') - weekIndex('2026-10-25'), 1); // Monday starts a new week
  assert.equal(weekIndex('2026-10-25') === weekIndex('2026-10-19'), true);
  const d = ['2026-10-26', '2026-10-27', '2026-10-19', '2026-10-21', '2026-10-12', '2026-10-14', '2026-10-05'];
  assert.equal(trainingWeeksInARow(d, '2026-10-28'), 3);          // this week + two before; 10-05 is a single workout
  assert.equal(trainingWeeksInARow(['2026-10-19', '2026-10-20'], '2026-10-26'), 1); // new week hasn't started yet, last week counts
  assert.equal(trainingWeeksInARow([], '2026-10-26'), 0);
});
test('applyDeload cuts sets but never below one and keeps the rest', () => {
  const t: WorkoutTemplate = { id: 'x', title: 'Push', focus: 'f', tier: 'beginner', durationMin: 40, exercises: [{ name: 'A', sets: 5, reps: '5', restSec: 90 }, { name: 'B', sets: 1, reps: '8', restSec: 60 }] };
  const d = applyDeload(t);
  assert.deepEqual(d.exercises.map(e => e.sets), [3, 1]);
  assert.match(d.title, /easy week/); assert.equal(d.durationMin, 28); assert.equal(t.exercises[0].sets, 5);
  assert.equal(deloadWeight(100), 90); assert.equal(deloadWeight(0), 0);
});

test('custom workouts are cleaned', () => {
  assert.equal(cleanCustomWorkout({ title: '', exercises: [{ name: 'A' }] }, 'i'), null);
  assert.equal(cleanCustomWorkout({ title: 'T', exercises: [] }, 'i'), null);
  const c = cleanCustomWorkout({ title: ' <b>Arms</b> day ', exercises: [{ name: 'Curl<script>', sets: 99, reps: 'x'.repeat(40), restSec: 1 }, { name: '' }, ...Array.from({ length: 20 }, (_, i) => ({ name: 'E' + i }))] }, 'id1')!;
  assert.equal(c.title, 'bArms/b day'); assert.ok(!/[<>]/.test(c.exercises[0].name));
  assert.equal(c.exercises[0].sets, 10); assert.equal(c.exercises[0].reps, '8-12'); assert.equal(c.exercises[0].restSec, 15);
  assert.equal(c.exercises.length, 12);
  assert.equal(cleanExercise({ name: 'X', sets: 'abc' })!.sets, 3);
});
test('share codes round-trip, including non-English names, and reject junk', () => {
  const c = cleanCustomWorkout({ title: 'Día de piernas 🦵', focus: 'quads', exercises: [{ name: 'Sentadilla', sets: 4, reps: '6-8', restSec: 120 }, { name: '深蹲', sets: 3, reps: '10', restSec: 90 }] }, 'a')!;
  const code = encodeShareCode(c);
  assert.match(code, /^UPW1\.[A-Za-z0-9_-]+$/);
  const back = decodeShareCode(`hey, try this ${code} thanks`, 'b')!;
  assert.deepEqual({ ...back, id: 'a' }, c);
  assert.equal(decodeShareCode('UPW1.@@@', 'x'), null);
  assert.equal(decodeShareCode('hello', 'x'), null);
  assert.equal(decodeShareCode('UPW1.' + 'A'.repeat(50), 'x'), null);
  assert.equal(decodeShareCode('UPW1.' + 'A'.repeat(5000), 'x'), null);
  assert.match(shareText(c), /UPW1\./);
  assert.equal(customToTemplate(c).exercises.length, 2);
});
test('rest timer', () => {
  assert.equal(restLength(90), 90); assert.equal(restLength(5), 15); assert.equal(restLength(9999), 300); assert.equal(restLength(undefined), 60);
  const end = restEndAt(1000, 60);
  assert.equal(restRemaining(end, 1000), 60); assert.equal(restRemaining(end, 1000 + 59_001), 1); assert.equal(restRemaining(end, end + 5), 0);
  assert.equal(clockMmSs(75), '1:15'); assert.equal(clockMmSs(5), '0:05'); assert.equal(clockMmSs(-3), '0:00');
});
