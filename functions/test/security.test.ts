import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  hit, applyXpBank, isRecentLogin, DAILY_XP_ALLOWANCE, INITIAL_BANK, MAX_BANK_DAYS, FIRST_PUBLISH_MAX_TOTAL_XP,
} from '../src/ratelimit.ts';
import { cleanScore, validAvatar } from '../src/scores.ts';
import { sign, signedAvatarParams, UPLOAD_OPTIONS, avatarPublicId } from '../src/cloudinary.ts';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;

test('sliding-window limiter allows up to max then refuses until the window passes', () => {
  let ts: number[] | undefined;
  for (let i = 0; i < 3; i++) { ts = hit(ts, T0 + i, 3, 1000)!; assert.ok(ts); }
  assert.equal(hit(ts, T0 + 10, 3, 1000), null);
  assert.ok(hit(ts, T0 + 5000, 3, 1000));
});

test('recent-login check', () => {
  const now = T0;
  assert.equal(isRecentLogin(now / 1000 - 60, now), true);
  assert.equal(isRecentLogin(now / 1000 - 3600, now), false);
  assert.equal(isRecentLogin(undefined, now), false);
});

test('first publish is accepted up to a ceiling', () => {
  const ok = applyXpBank(null, undefined, 1500, T0);
  assert.equal(ok.total, 1500);
  assert.equal(ok.clamped, false);
  const cheat = applyXpBank(null, undefined, 9_999_999, T0);
  assert.equal(cheat.total, FIRST_PUBLISH_MAX_TOTAL_XP);
  assert.equal(cheat.clamped, true);
});

test('normal XP growth is never clamped', () => {
  let state = { bank: INITIAL_BANK, at: T0 };
  let total = 1000;
  for (let i = 1; i <= 30; i++) {
    const r = applyXpBank(total, state, total + 300, T0 + i * DAY);
    assert.equal(r.clamped, false);
    total = r.total; state = r.state;
  }
  assert.equal(total, 1000 + 30 * 300);
});

test('a tampered jump is clamped to the banked allowance', () => {
  const r = applyXpBank(500, { bank: INITIAL_BANK, at: T0 }, 5_000_000, T0 + 1000);
  assert.equal(r.clamped, true);
  assert.ok(r.total <= 500 + INITIAL_BANK + 1);
  assert.ok(r.state.bank < 1);
});

test('repeated calls cannot mint allowance: bank is spent, not reset', () => {
  let state = { bank: INITIAL_BANK, at: T0 };
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const r = applyXpBank(total, state, total + 5000, T0 + i * 1000);
    total = r.total; state = r.state;
  }
  // 20 seconds of calls can earn at most the initial bank plus a few seconds of accrual.
  assert.ok(total <= INITIAL_BANK + 5, `total=${total}`);
});

test('allowance banks up to the cap after being away', () => {
  const r = applyXpBank(100, { bank: 0, at: T0 }, 100 + 100_000, T0 + 30 * DAY);
  assert.equal(r.total, 100 + DAILY_XP_ALLOWANCE * MAX_BANK_DAYS);
  assert.equal(r.clamped, true);
});

test('decreases are accepted and do not spend allowance', () => {
  const r = applyXpBank(900, { bank: 500, at: T0 }, 400, T0);
  assert.equal(r.total, 400);
  assert.equal(r.state.bank, 500);
});

test('score rows are sanitized', () => {
  const s = cleanScore({
    displayName: 'Sam\u0000 R.', avatar: 'https://evil.example/x.png', avatarColor: 'javascript:1',
    level: -4, totalXP: 'abc', rank: 'x'.repeat(100), streak: 9e9, extra: 'drop me',
  }, 'mycloud');
  assert.equal(s.displayName, 'Sam R.');
  assert.equal(s.avatar, '');
  assert.equal('avatarColor' in s, false);
  assert.equal(s.level, 1);
  assert.equal(s.totalXP, 0);
  assert.equal(s.rank.length, 30);
  assert.equal(s.streak, 10_000);
  assert.equal('extra' in s, false);
});

test('only our own Cloudinary avatars are accepted', () => {
  assert.equal(validAvatar('https://res.cloudinary.com/mycloud/image/upload/v1/avatars/u.jpg', 'mycloud').length > 0, true);
  assert.equal(validAvatar('https://res.cloudinary.com/othercloud/image/upload/a.jpg', 'mycloud'), '');
  assert.equal(validAvatar('http://res.cloudinary.com/mycloud/a.jpg', 'mycloud'), '');
  assert.equal(validAvatar('', 'mycloud'), '');
});

test('cloudinary signature follows the documented algorithm', () => {
  const sig = sign({ timestamp: 1315060510, public_id: 'sample', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' }, 'abcd');
  const expected = createHash('sha1').update('eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample&timestamp=1315060510abcd').digest('hex');
  assert.equal(sig, expected);
});

test('signed avatar params are pinned to this user and constrained', () => {
  const r = signedAvatarParams('user123', 'KEY', 'SECRET', T0);
  assert.equal(r.params.public_id, avatarPublicId('user123'));
  assert.equal(r.params.allowed_formats, UPLOAD_OPTIONS.allowed_formats);
  assert.match(r.params.transformation, /w_512/);
  assert.equal(r.params.timestamp, Math.floor(T0 / 1000));
  assert.equal(r.signature, sign(r.params, 'SECRET'));
  assert.notEqual(r.signature, signedAvatarParams('user456', 'KEY', 'SECRET', T0).signature);
  assert.equal(JSON.stringify(r).includes('SECRET'), false);
});

import { maxPlausibleStreak } from '../src/ratelimit.ts';
test('a streak cannot be longer than the account has existed', () => {
  const now = T0;
  assert.equal(maxPlausibleStreak(now, now), 1);
  assert.equal(maxPlausibleStreak(now - 6 * DAY, now), 7);
  assert.equal(maxPlausibleStreak(now - 400 * DAY, now), 401);
  assert.equal(maxPlausibleStreak(now + 5 * DAY, now), 1, 'a creation time in the future cannot raise it');
});

test('display names keep real names in any script and drop markup', () => {
  const name = (n: string) => cleanScore({ displayName: n, avatar: '', level: 1, totalXP: 0, rank: 'Rookie', streak: 0 }, 'x').displayName;
  assert.equal(name("María-José O'Neil Jr."), "María-José O'Neil Jr.");
  assert.equal(name('张伟 L.'), '张伟 L.');
  assert.equal(name('రవి K.'), 'రవి K.');
  assert.equal(name('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(name('Sam\u0000   R.'), 'Sam R.');
});
