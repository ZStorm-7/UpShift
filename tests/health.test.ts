import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHealthDay, planMerge, kgToLbs } from '../services/health/health';
import { getHealthProvider, registerHealthProvider } from '../services/health/provider';

test('health days are cleaned and junk is dropped', () => {
  assert.equal(cleanHealthDay({ date: 'today' }), null);
  assert.deepEqual(cleanHealthDay({ date: '2026-10-26', steps: 12345.6, sleepHours: 7.46, weightKg: 70.04 }), { date: '2026-10-26', steps: 12346, sleepHours: 7.5, weightKg: 70 });
  assert.deepEqual(cleanHealthDay({ date: '2026-10-26', steps: -4, sleepHours: 99, weightKg: 5 }), { date: '2026-10-26', steps: 0, sleepHours: 0, weightKg: 0 });
});
test('hand-logged values always win', () => {
  const h = { date: '2026-10-26', steps: 8000, sleepHours: 7, weightKg: 80 };
  assert.deepEqual(planMerge(h, { sleepHours: 6, steps: 1000 }, [{ date: '2026-10-26', weightLbs: 180 }]), { day: {}, weight: null });
  assert.deepEqual(planMerge(h, null, []), { day: { sleepHours: 7, steps: 8000 }, weight: { date: '2026-10-26', weightLbs: kgToLbs(80) } });
  assert.deepEqual(planMerge({ ...h, sleepHours: 0, steps: 0, weightKg: 0 }, null, []), { day: {}, weight: null });
});
test('kg to lbs', () => { assert.equal(kgToLbs(80), 176.4); });
test('no provider by default, one can be registered', () => {
  assert.equal(getHealthProvider(), null);
  registerHealthProvider({ name: 'Health Connect', read: async () => ({ ok: false, reason: 'unavailable' }) });
  assert.equal(getHealthProvider()?.name, 'Health Connect');
  registerHealthProvider(null);
  assert.equal(getHealthProvider(), null);
});
