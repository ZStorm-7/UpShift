import test from 'node:test';
import assert from 'node:assert/strict';
import { cheerId, cleanCheer, summarizeCheers, sentKinds, isCheerKind } from '../services/social/cheers';

test('a cheer id carries the daily limit', () => {
  assert.equal(cheerId('a', '2026-10-26', 'fire'), 'a_2026-10-26_fire');
});
test('bad cheers are dropped and names are cleaned', () => {
  assert.equal(cleanCheer('x', null), null);
  assert.equal(cleanCheer('x', { kind: 'poop', fromUid: 'a', day: '2026-10-26' }), null);
  assert.equal(cleanCheer('x', { kind: 'fire', fromUid: 'a', day: 'yesterday' }), null);
  const c = cleanCheer('x', { kind: 'fire', fromUid: 'a', fromName: '<b>Sam</b> K.', day: '2026-10-26' });
  assert.equal(c?.fromName, 'bSam/b K.');
  assert.equal(isCheerKind('clap'), true); assert.equal(isCheerKind('x'), false);
});
test('only today counts and senders are listed once', () => {
  const mk = (id: string, name: string, kind: any, day = '2026-10-26') => cleanCheer(id, { kind, fromUid: name, fromName: name, day })!;
  const s = summarizeCheers([mk('1', 'Ann', 'fire'), mk('2', 'Ann', 'clap'), mk('3', 'Bo', 'fire'), mk('4', 'Cy', 'fire', '2026-10-25')], '2026-10-26');
  assert.deepEqual(s, { total: 3, byKind: { fire: 2, clap: 1, muscle: 0 }, senders: ['Ann', 'Bo'] });
});
test('already-sent kinds are found per friend', () => {
  const sent = ['f1:me_2026-10-26_fire', 'f2:me_2026-10-26_clap', 'f1:me_2026-10-25_clap'];
  assert.deepEqual([...sentKinds(sent, 'f1', 'me', '2026-10-26')], ['fire']);
});
