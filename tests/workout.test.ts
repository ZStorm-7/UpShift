import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutXp, WORKOUT_XP, MIN_WORKOUT_XP } from '../services/workoutXp';

test('a finished plan pays full XP', () => assert.equal(workoutXp(12, 12), WORKOUT_XP));
test('a partial plan pays in proportion', () => assert.equal(workoutXp(6, 12), WORKOUT_XP / 2));
test('one set pays only the floor, not the full reward', () => assert.equal(workoutXp(1, 12), MIN_WORKOUT_XP));
test('nothing done, or a bad plan, pays nothing; extra sets never pay more than full', () => {
  assert.equal(workoutXp(0, 12), 0);
  assert.equal(workoutXp(5, 0), 0);
  assert.equal(workoutXp(NaN, 12), 0);
  assert.equal(workoutXp(20, 12), WORKOUT_XP);
});
