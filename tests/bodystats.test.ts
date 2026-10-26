import test from 'node:test';
import assert from 'node:assert/strict';
import { validAge, validFeet, validInches, validWeight } from '../utils/bodyStats';

test('age: 13 to 120, whole numbers only', () => {
  for (const ok of ['13', '30', '120', ' 40 ']) assert.ok(validAge(ok), ok);
  for (const bad of ['', '3', '12', '121', '-5', '30.5', 'abc', '1e2', null, undefined]) assert.ok(!validAge(bad), String(bad));
});
test('height: feet 3 to 8, inches blank or 0 to 11', () => {
  assert.ok(validFeet('5') && validFeet('3') && validFeet('8'));
  for (const bad of ['', '2', '9', '15', 'x']) assert.ok(!validFeet(bad), bad);
  assert.ok(validInches('') && validInches('0') && validInches('11'));
  for (const bad of ['12', '40', '-1', 'x', '1.5']) assert.ok(!validInches(bad), bad);
});
test('weight: 40 to 1000 lbs, decimals allowed', () => {
  assert.ok(validWeight('172.4') && validWeight('40') && validWeight('1000'));
  for (const bad of ['', '0', '39.9', '1001', 'abc', 'NaN', '-50']) assert.ok(!validWeight(bad), bad);
});
