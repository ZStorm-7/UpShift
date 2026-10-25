// Pure quota / abuse state machine. No Firebase imports so it can be unit
// tested; store.ts persists the state inside a Firestore transaction.

import {
  WINDOW_MS, BURST_MAX, BURST_WINDOW_MS, STRIKE_WINDOW_MS, STRIKES_BEFORE_BLOCK,
  BLOCK_MS, IN_FLIGHT_MS, MAX_REFUNDS_PER_WINDOW, LIMITS,
  type Bucket, type Tier,
} from './config.ts';

export type UsageState = {
  chat: number[];
  tool: number[];
  rescue: number[];
  burst: number[];
  strikes: number[];
  refunds: number[];
  blockedUntil: number;
  inFlightUntil: number;
  premium?: { value: boolean; checkedAt: number };
};

export const EMPTY_USAGE: UsageState = {
  chat: [], tool: [], rescue: [], burst: [], strikes: [], refunds: [],
  blockedUntil: 0, inFlightUntil: 0,
};

const within = (ts: number[], now: number, ms: number) => ts.filter(t => now - t < ms);

export function normalize(raw: Partial<UsageState> | undefined, now: number): UsageState {
  const s = { ...EMPTY_USAGE, ...(raw ?? {}) };
  return {
    ...s,
    chat: within(s.chat, now, WINDOW_MS),
    tool: within(s.tool, now, WINDOW_MS),
    rescue: within(s.rescue, now, WINDOW_MS),
    burst: within(s.burst, now, BURST_WINDOW_MS),
    strikes: within(s.strikes, now, STRIKE_WINDOW_MS),
    refunds: within(s.refunds, now, WINDOW_MS),
  };
}

export type Denial = 'blocked' | 'busy' | 'burst' | 'quota';
export type Decision =
  | { ok: true; next: UsageState }
  | { ok: false; code: Denial; retryAt: number; next: UsageState };

// Records the attempt and either reserves one unit of `bucket` or denies.
// Denied attempts still return the updated state (burst/strikes) to persist.
export function reserve(raw: Partial<UsageState> | undefined, bucket: Bucket, tier: Tier, now: number): Decision {
  const s = normalize(raw, now);

  if (s.blockedUntil > now) return { ok: false, code: 'blocked', retryAt: s.blockedUntil, next: s };

  s.burst = [...s.burst, now];
  if (s.burst.length > BURST_MAX) {
    s.strikes = [...s.strikes, now];
    if (s.strikes.length >= STRIKES_BEFORE_BLOCK) {
      s.blockedUntil = now + BLOCK_MS;
      s.strikes = [];
    }
    return { ok: false, code: 'burst', retryAt: s.burst[0] + BURST_WINDOW_MS, next: s };
  }

  if (s.inFlightUntil > now) return { ok: false, code: 'busy', retryAt: s.inFlightUntil, next: s };

  const used = s[bucket];
  const limit = LIMITS[tier][bucket];
  if (used.length >= limit) {
    return { ok: false, code: 'quota', retryAt: used[0] + WINDOW_MS, next: s };
  }

  s[bucket] = [...used, now];
  s.inFlightUntil = now + IN_FLIGHT_MS;
  return { ok: true, next: s };
}

// Called when the model call finishes. A failed call is refunded, but only a
// few times per window so errors can't be farmed into free usage.
export function release(raw: Partial<UsageState> | undefined, bucket: Bucket, now: number, failed: boolean): UsageState {
  const s = normalize(raw, now);
  s.inFlightUntil = 0;
  if (failed && s.refunds.length < MAX_REFUNDS_PER_WINDOW && s[bucket].length > 0) {
    s[bucket] = s[bucket].slice(0, -1);
    s.refunds = [...s.refunds, now];
  }
  return s;
}

export function strike(raw: Partial<UsageState> | undefined, now: number): UsageState {
  const s = normalize(raw, now);
  s.strikes = [...s.strikes, now];
  if (s.strikes.length >= STRIKES_BEFORE_BLOCK) {
    s.blockedUntil = now + BLOCK_MS;
    s.strikes = [];
  }
  return s;
}

export type Usage = Record<Bucket, { used: number; limit: number; resetAt: number | null }> & { tier: Tier };

export function summarize(raw: Partial<UsageState> | undefined, tier: Tier, now: number): Usage {
  const s = normalize(raw, now);
  const one = (b: Bucket) => ({
    used: s[b].length,
    limit: LIMITS[tier][b],
    resetAt: s[b].length >= LIMITS[tier][b] ? s[b][0] + WINDOW_MS : null,
  });
  return { tier, chat: one('chat'), tool: one('tool'), rescue: one('rescue') };
}
