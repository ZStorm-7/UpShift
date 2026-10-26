import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStreak, liveStreak, cleanStreak, EMPTY_STREAK, MAX_FREEZES, daysToNextFreeze, recentlyFrozen, addDaysToKey, type StreakState } from '../services/habits/streakLogic';

const run = (start: StreakState, keys: string[]) => keys.reduce((s, k) => advanceStreak(s, k), start);
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDaysToKey(from, i));

test('a streak grows by one for each consecutive day and a repeat in the same cycle changes nothing', () => {
  const s = run(EMPTY_STREAK, days('2026-10-01', 3));
  assert.equal(s.currentStreak, 3);
  assert.equal(advanceStreak(s, '2026-10-03'), s);
});
test('a freeze is earned on every 7th day, never more than the maximum', () => {
  const s7 = run(EMPTY_STREAK, days('2026-10-01', 7)); assert.equal(s7.freezes, 1);
  const s14 = run(EMPTY_STREAK, days('2026-10-01', 14)); assert.equal(s14.freezes, 2);
  const s28 = run(EMPTY_STREAK, days('2026-10-01', 28)); assert.equal(s28.freezes, MAX_FREEZES);
  assert.equal(run(EMPTY_STREAK, days('2026-10-01', 6)).freezes, 0);
});
test('a freeze covers one missed day and the streak carries on', () => {
  const s7 = run(EMPTY_STREAK, days('2026-10-01', 7));         // streak 7, one freeze, last 10-07
  const after = advanceStreak(s7, '2026-10-09');                // missed 10-08
  assert.equal(after.currentStreak, 8); assert.equal(after.freezes, 0); assert.deepEqual(after.frozenKeys, ['2026-10-08']);
  assert.equal(recentlyFrozen(after, '2026-10-09'), true); assert.equal(recentlyFrozen(after, '2026-10-20'), false);
});
test('two freezes cover two missed days; three missed days break it', () => {
  const s14 = run(EMPTY_STREAK, days('2026-10-01', 14));        // two freezes, last 10-14
  const two = advanceStreak(s14, '2026-10-17');                 // missed 15, 16
  assert.equal(two.currentStreak, 15); assert.equal(two.freezes, 0); assert.deepEqual(two.frozenKeys, ['2026-10-15', '2026-10-16']);
  const three = advanceStreak(s14, '2026-10-18');               // missed 15, 16, 17
  assert.equal(three.currentStreak, 1);
});
test('without a freeze a missed day resets the streak, and freezes are kept', () => {
  const s5 = run(EMPTY_STREAK, days('2026-10-01', 5));
  assert.equal(advanceStreak(s5, '2026-10-07').currentStreak, 1);
  assert.equal(advanceStreak(s5, '2026-10-07').longestStreak, 5);
  const s7 = run(EMPTY_STREAK, days('2026-10-01', 7)); const far = advanceStreak(s7, '2026-11-20');
  assert.equal(far.currentStreak, 1); assert.equal(far.freezes, 1);
});
test('live streak counts a day as saved only if a freeze can cover it', () => {
  const s7 = run(EMPTY_STREAK, days('2026-10-01', 7));          // freeze 1, last 10-07
  assert.equal(liveStreak(s7, '2026-10-07'), 7); assert.equal(liveStreak(s7, '2026-10-08'), 7);
  assert.equal(liveStreak(s7, '2026-10-09'), 7);                // one missed day, covered
  assert.equal(liveStreak(s7, '2026-10-10'), 0);                // two missed, one freeze
  const s5 = run(EMPTY_STREAK, days('2026-10-01', 5));
  assert.equal(liveStreak(s5, '2026-10-07'), 0); assert.equal(liveStreak(s5, '2026-10-06'), 5);
  assert.equal(liveStreak(EMPTY_STREAK, '2026-10-07'), 0); assert.equal(liveStreak(s5, '2026-09-01'), 0);
});
test('days to the next freeze', () => {
  const s = run(EMPTY_STREAK, days('2026-10-01', 3));
  assert.equal(daysToNextFreeze(s, 3), 4);
  assert.equal(daysToNextFreeze({ ...s, freezes: MAX_FREEZES }, 3), null);
});
test('old streak documents (no freezes) and bad data load safely', () => {
  assert.deepEqual(cleanStreak({ currentStreak: 4, longestStreak: 9, lastCompletedCycleKey: '2026-10-01' }), { currentStreak: 4, longestStreak: 9, lastCompletedCycleKey: '2026-10-01', freezes: 0, frozenKeys: [] });
  const c = cleanStreak({ currentStreak: -3, longestStreak: 'x', lastCompletedCycleKey: 'tomorrow', freezes: 99, frozenKeys: ['2026-10-01', 5, 'bad'] });
  assert.deepEqual(c, { currentStreak: 0, longestStreak: 0, lastCompletedCycleKey: '', freezes: 2, frozenKeys: ['2026-10-01'] });
  assert.deepEqual(cleanStreak(null), EMPTY_STREAK);
});
