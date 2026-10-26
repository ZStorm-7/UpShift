import test from 'node:test';
import assert from 'node:assert/strict';
import { monthKeyUtc, monthlyXp } from '../src/season.ts';

const OCT = Date.UTC(2026, 9, 15), NOV = Date.UTC(2026, 10, 2);
test('month keys are UTC', () => {
  assert.equal(monthKeyUtc(OCT), '2026-10'); assert.equal(monthKeyUtc(Date.UTC(2026, 9, 31, 23, 59)), '2026-10'); assert.equal(monthKeyUtc(Date.UTC(2026, 10, 1)), '2026-11');
});
test('the first publish only sets a baseline', () => {
  assert.deepEqual(monthlyXp({ prevTotal: null, newTotal: 20000, nowMs: OCT }), { monthKey: '2026-10', monthXP: 0 });
});
test('growth adds to the month, a repeat adds nothing, and a drop never subtracts', () => {
  assert.deepEqual(monthlyXp({ prevKey: '2026-10', prevMonthXP: 40, prevTotal: 100, newTotal: 130, nowMs: OCT }), { monthKey: '2026-10', monthXP: 70 });
  assert.equal(monthlyXp({ prevKey: '2026-10', prevMonthXP: 40, prevTotal: 130, newTotal: 130, nowMs: OCT }).monthXP, 40);
  assert.equal(monthlyXp({ prevKey: '2026-10', prevMonthXP: 40, prevTotal: 130, newTotal: 90, nowMs: OCT }).monthXP, 40);
});
test('a new month starts from this publish', () => {
  assert.deepEqual(monthlyXp({ prevKey: '2026-10', prevMonthXP: 900, prevTotal: 1000, newTotal: 1025, nowMs: NOV }), { monthKey: '2026-11', monthXP: 25 });
  assert.deepEqual(monthlyXp({ prevTotal: 50, newTotal: 80, nowMs: OCT }), { monthKey: '2026-10', monthXP: 30 }); // old row with no month yet
});
test('junk stored values are tolerated', () => {
  assert.equal(monthlyXp({ prevKey: '2026-10', prevMonthXP: 'abc', prevTotal: 1, newTotal: 2, nowMs: OCT }).monthXP, 1);
  assert.equal(monthlyXp({ prevKey: '2026-10', prevMonthXP: -50, prevTotal: 1, newTotal: 1, nowMs: OCT }).monthXP, 0);
});
