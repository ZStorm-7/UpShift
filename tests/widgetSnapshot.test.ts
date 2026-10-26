import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, sameSnapshot } from '../services/habits/widgetSnapshot';

test('snapshot is clamped and sane', () => {
  const s = buildSnapshot('2026-10-26T10:00', { questsDone: 9, questsTotal: 4, waterMl: -5, waterGoalMl: 0, streak: NaN });
  assert.deepEqual(s, { day: '2026-10-26', questsDone: 4, questsTotal: 4, waterMl: 0, waterGoalMl: 1, streak: 0 });
});
test('identical snapshots are detected', () => {
  const a = buildSnapshot('2026-10-26', { questsDone: 1, questsTotal: 3, waterMl: 500, waterGoalMl: 2500, streak: 4 });
  assert.equal(sameSnapshot(null, a), false);
  assert.equal(sameSnapshot(a, { ...a }), true);
  assert.equal(sameSnapshot(a, { ...a, waterMl: 750 }), false);
});
