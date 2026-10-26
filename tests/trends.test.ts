import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, lastDays } from '../services/insights/trends';
import { summarizeDay } from '../services/insights/days';

const day = (i: number, o: { sleep?: number; water?: number; workouts?: number; cal?: number }) =>
  summarizeDay(`2026-10-${String(i + 1).padStart(2, '0')}`, { sleepHours: o.sleep, waterTotal: o.water, workoutsCompleted: o.workouts, foodLog: o.cal ? [{ calories: o.cal }] : [] });

test('too little data says nothing', () => {
  assert.deepEqual(buildInsights([day(0, { sleep: 8, water: 2000 }), day(1, { sleep: 5, water: 1000 })]), []);
});
test('good sleep with more water is found, with both groups counted', () => {
  const days = Array.from({ length: 16 }, (_, i) => (i % 2 ? day(i, { sleep: 5.5, water: 1200 }) : day(i, { sleep: 8, water: 2200 })));
  const r = buildInsights(days).find(x => x.kind === 'compare' && x.cause === 'goodSleep' && x.effect === 'water') as any;
  assert.ok(r); assert.equal(r.with, 2200); assert.equal(r.without, 1200); assert.equal(r.nWith, 8); assert.equal(r.nWithout, 8);
});
test('small differences are not reported', () => {
  const days = Array.from({ length: 16 }, (_, i) => day(i, { sleep: i % 2 ? 6 : 8, water: i % 2 ? 2000 : 2050 }));
  assert.equal(buildInsights(days).some(x => x.kind === 'compare' && x.effect === 'water'), false);
});
test('a rising week shows as a trend', () => {
  const days = Array.from({ length: 14 }, (_, i) => day(i, { water: i < 7 ? 1000 : 1500 }));
  const t = buildInsights(days).find(x => x.kind === 'trend' && x.metric === 'water') as any;
  assert.ok(t); assert.equal(t.pct, 50);
});
test('results are capped and day keys run oldest to newest', () => {
  assert.ok(buildInsights(Array.from({ length: 28 }, (_, i) => day(i, { sleep: i % 2 ? 5 : 8, water: i % 2 ? 900 : 2400, workouts: i % 2 ? 0 : 1, cal: i % 2 ? 1500 : 2300 })), 2).length <= 2);
  const k = lastDays(new Date(2026, 10, 2), 4);
  assert.deepEqual(k, ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});
