import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserve, release, strike, summarize, normalize, type UsageState } from '../src/quota.ts';
import { LIMITS, WINDOW_MS, BURST_MAX } from '../src/config.ts';

const T0 = 1_700_000_000_000;

// Reserves then releases successfully, spaced out so burst limits don't interfere.
function use(state: UsageState | undefined, bucket: any, tier: any, at: number) {
  const d = reserve(state, bucket, tier, at);
  assert.ok(d.ok, `expected ok at ${at}: ${JSON.stringify((d as any).code)}`);
  return release(d.next, bucket, at + 1, false);
}

test('free chat limit is enforced and the next call is denied', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < LIMITS.free.chat; i++) s = use(s, 'chat', 'free', T0 + i * 120_000);
  const d = reserve(s, 'chat', 'free', T0 + 10 * 120_000);
  assert.equal(d.ok, false);
  if (!d.ok) { assert.equal(d.code, 'quota'); assert.equal(d.retryAt, T0 + WINDOW_MS); }
});

test('premium gets a higher limit than free', () => {
  assert.ok(LIMITS.premium.chat > LIMITS.free.chat);
  let s: UsageState | undefined;
  for (let i = 0; i < LIMITS.free.chat + 1; i++) s = use(s, 'chat', 'premium', T0 + i * 120_000);
  assert.equal(s!.chat.length, LIMITS.free.chat + 1);
});

test('buckets are independent: tool use does not consume chat', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < LIMITS.free.tool; i++) s = use(s, 'tool', 'free', T0 + i * 120_000);
  assert.equal(reserve(s, 'tool', 'free', T0 + 9e5).ok, false);
  assert.equal(reserve(s, 'chat', 'free', T0 + 9e5).ok, true);
});

test('quota is a rolling window, not a calendar day (timezone tricks cannot reset it)', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < LIMITS.free.chat; i++) s = use(s, 'chat', 'free', T0 + i * 120_000);
  assert.equal(reserve(s, 'chat', 'free', T0 + WINDOW_MS - 1).ok, false);
  assert.equal(reserve(s, 'chat', 'free', T0 + WINDOW_MS + 1).ok, true);
});

test('only one call in flight per user', () => {
  const first = reserve(undefined, 'chat', 'premium', T0);
  assert.ok(first.ok);
  const second = reserve(first.next, 'chat', 'premium', T0 + 1000);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, 'busy');
  const done = release(first.next, 'chat', T0 + 2000, false);
  assert.ok(reserve(done, 'chat', 'premium', T0 + 61_000).ok);
});

test('burst limiting adds strikes and eventually blocks', () => {
  let s: UsageState | undefined;
  let blockedAt = -1;
  for (let i = 0; i < 40; i++) {
    const d = reserve(s, 'rescue', 'free', T0 + i * 100);
    s = d.next;
    if (d.ok) s = release(s, 'rescue', T0 + i * 100 + 1, false);
    if (!d.ok && d.code === 'blocked') { blockedAt = i; break; }
  }
  assert.ok(blockedAt > BURST_MAX, `should block after sustained bursts (got ${blockedAt})`);
});

test('failed calls are refunded, but only a few times per window', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < 5; i++) {
    const d = reserve(s, 'chat', 'premium', T0 + i * 120_000);
    assert.ok(d.ok);
    s = release(d.next, 'chat', T0 + i * 120_000 + 1, true);
  }
  assert.equal(s!.refunds.length, 3);
  assert.equal(s!.chat.length, 2);
});

test('strikes accumulate into a block', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < 3; i++) s = strike(s, T0 + i);
  assert.ok(s!.blockedUntil > T0);
  const d = reserve(s, 'chat', 'premium', T0 + 10);
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.code, 'blocked');
});

test('summarize reports used/limit/reset', () => {
  let s: UsageState | undefined;
  for (let i = 0; i < LIMITS.free.chat; i++) s = use(s, 'chat', 'free', T0 + i * 120_000);
  const u = summarize(s, 'free', T0 + 1e6);
  assert.equal(u.chat.used, LIMITS.free.chat);
  assert.equal(u.chat.limit, LIMITS.free.chat);
  assert.equal(u.chat.resetAt, T0 + WINDOW_MS);
  assert.equal(u.tool.resetAt, null);
});

test('normalize tolerates missing or junk state', () => {
  const s = normalize(undefined, T0);
  assert.deepEqual(s.chat, []);
});
