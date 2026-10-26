import test from 'node:test';
import assert from 'node:assert/strict';
import { fillCard, weekCardVars, topRecord, recordCardVars } from '../services/share/cards';

test('placeholders are filled and unknown ones vanish', () => {
  assert.equal(fillCard('{a} and {b} {c}', { a: 1, b: 'x' }), '1 and x ');
});
test('week numbers come straight from the review', () => {
  const v = weekCardVars({ stats: { workouts: 3, waterDays: 5, sleepAvg: 7.4, sleepNights: 4, loggedDays: 6, calorieDays: 2, breaks: 1, activeDays: 6 }, wins: [], improve: 'sleep', goals: [] }, 12.8);
  assert.deepEqual(v, { workouts: 3, waterDays: 5, sleep: 7.4, loggedDays: 6, streak: 12 });
});
test('the headline record prefers weight over volume', () => {
  const prs = [{ name: 'Squat', kind: 'volume' as const, value: 5000, previous: 4000 }, { name: 'Bench', kind: 'weight' as const, value: 185.4, previous: 175 }];
  const top = topRecord(prs)!;
  assert.equal(top.name, 'Bench');
  assert.deepEqual(recordCardVars(top), { name: 'Bench', v: 185, p: 175 });
  assert.equal(topRecord([]), null);
});
