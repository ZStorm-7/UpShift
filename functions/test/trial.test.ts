import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, trialClaimId, resolveTrialStart } from '../src/trial.ts';

test('plus tags, case and gmail dots all map to one person', () => {
  const ids = ['Sam.Smith@gmail.com', 'samsmith+promo@gmail.com', 'SAMSMITH@googlemail.com'].map(trialClaimId);
  assert.equal(new Set(ids).size, 1);
});
test('different people stay different', () => {
  assert.notEqual(trialClaimId('a@x.com'), trialClaimId('b@x.com'));
  assert.equal(normalizeEmail('a.b@corp.com'), 'a.b@corp.com'); // dots only matter on gmail
});
test('an earlier claim for the same email wins', () => {
  assert.equal(resolveTrialStart({ now: 1000, claim: 200, legacy: 900 }), 200);
});
test('a legacy date can only shorten a trial, never extend it', () => {
  assert.equal(resolveTrialStart({ now: 1000, legacy: 4000 }), 1000); // future ignored
  assert.equal(resolveTrialStart({ now: 1000, legacy: 600 }), 600);
  assert.equal(resolveTrialStart({ now: 1000, legacy: 'junk' }), 1000);
  assert.equal(resolveTrialStart({ now: 1000, legacy: -5 }), 1000);
});
test('no history starts now', () => {
  assert.equal(resolveTrialStart({ now: 1000 }), 1000);
});
