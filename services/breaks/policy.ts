// The rules for WHEN a break (or a strict block) happens, as a pure function.
//
// The Android foreground service (modules/upshift-breaks/.../BreakPolicy.kt)
// implements this SAME algorithm, because JavaScript is not running while the
// user is in another app. Both are run against the same scenarios by the
// parity check in docs/mindful-breaks.md. Change both together.
//
// Order of precedence for each sample:
//   1. emergency pause           -> nothing happens
//   2. strict mode               -> a watched app in front is blocked ("strict")
//   3. outside the schedule      -> nothing happens (and a stuck break is released)
//   4. daily cap reached         -> no NEW break (an unfinished one still returns)
//   5. otherwise                 -> the normal N-minutes-of-use break

import { step, complete, INITIAL_TRACKER, REPEAT_GUARD_MS } from './usageTracker';
import type { TrackerState } from './usageTracker';
import { MIN_INTERVAL_MIN } from './settings';
import type { Schedule, BreakSettings } from './settings';

export type Policy = {
  enabled: boolean;
  intervalMin: number;
  schedule: Schedule;
  dailyCap: number;
  adaptive: boolean;
  pausedUntil: number;
  strictUntil: number;
};

export const toPolicy = (s: BreakSettings): Policy => ({
  enabled: s.enabled, intervalMin: s.intervalMin, schedule: s.schedule, dailyCap: s.dailyCap,
  adaptive: s.adaptive, pausedUntil: s.pausedUntil, strictUntil: s.strictUntil,
});

export type LocalTime = { dayOfWeek: number; minutesOfDay: number };

export function localTime(ms: number): LocalTime {
  const d = new Date(ms);
  return { dayOfWeek: d.getDay(), minutesOfDay: d.getHours() * 60 + d.getMinutes() };
}

// Is `local` inside the schedule? A disabled schedule is always open.
export function inScheduleWindow(s: Schedule, local: LocalTime): boolean {
  if (!s.enabled) return true;
  if (s.days.length === 0) return false;
  const m = local.minutesOfDay;
  if (s.startMin === s.endMin) return s.days.includes(local.dayOfWeek); // whole day
  if (s.startMin < s.endMin) return s.days.includes(local.dayOfWeek) && m >= s.startMin && m < s.endMin;
  // Overnight: the evening part belongs to the day it starts on, the morning part to the day after.
  const prevDay = (local.dayOfWeek + 6) % 7;
  return (s.days.includes(local.dayOfWeek) && m >= s.startMin) || (s.days.includes(prevDay) && m < s.endMin);
}

export const NIGHT_START_MIN = 22 * 60;
export const NIGHT_END_MIN = 5 * 60;
export const RAPID_SWITCHES = 12;       // watched-app openings in the last 5 minutes
export const NIGHT_FACTOR = 0.5;
export const RAPID_FACTOR = 0.7;

// Adaptive timing: shorter gaps late at night and when the user keeps hopping
// in and out of apps. Never below 5 minutes (or the user's own interval if lower).
export function effectiveThresholdMs(baseMin: number, adaptive: boolean, local: LocalTime, switchesLast5Min: number): number {
  const base = baseMin * 60_000;
  if (!adaptive) return base;
  let factor = 1;
  if (local.minutesOfDay >= NIGHT_START_MIN || local.minutesOfDay < NIGHT_END_MIN) factor *= NIGHT_FACTOR;
  if (switchesLast5Min >= RAPID_SWITCHES) factor *= RAPID_FACTOR;
  const floor = Math.min(base, MIN_INTERVAL_MIN * 60_000);
  return Math.max(floor, Math.round(base * factor));
}

export type PolicySample = {
  now: number;
  watchedInForeground: boolean;
  screenOn: boolean;
  local: LocalTime;
  switchesLast5Min: number;
  breaksToday: number;
};

export type PolicyAction = 'none' | 'break' | 'strict';

export function decide(prev: TrackerState, sample: PolicySample, policy: Policy): { state: TrackerState; action: PolicyAction } {
  const idle = (p: TrackerState) => step(p, { now: sample.now, watchedInForeground: false, screenOn: sample.screenOn }, Number.MAX_SAFE_INTEGER).state;

  if (!policy.enabled) return { state: idle(prev), action: 'none' };

  // 1. Emergency pause: nothing counts and nothing fires.
  if (sample.now < policy.pausedUntil) return { state: idle(prev), action: 'none' };

  // 2. Strict mode: the chosen apps are closed. No counting, no pending break.
  if (sample.now < policy.strictUntil) {
    const counting = sample.watchedInForeground && sample.screenOn;
    const guardOk = prev.lastTriggerAt === null || sample.now - prev.lastTriggerAt >= REPEAT_GUARD_MS;
    const state = { ...idle(prev) };
    if (counting && guardOk) return { state: { ...state, lastTriggerAt: sample.now }, action: 'strict' };
    return { state, action: 'none' };
  }

  // 3. Outside the schedule: release any unfinished break so it can't trap the user.
  if (!inScheduleWindow(policy.schedule, sample.local)) {
    return { state: { ...idle(prev), pending: false, accumulatedMs: 0 }, action: 'none' };
  }

  // 4. Daily cap reached: stop starting new breaks (an unfinished one still returns).
  const capped = policy.dailyCap > 0 && sample.breaksToday >= policy.dailyCap && !prev.pending;
  if (capped) return { state: idle(prev), action: 'none' };

  // 5. The normal rule.
  const threshold = effectiveThresholdMs(policy.intervalMin, policy.adaptive, sample.local, sample.switchesLast5Min);
  const r = step(prev, { now: sample.now, watchedInForeground: sample.watchedInForeground, screenOn: sample.screenOn }, threshold);
  return { state: r.state, action: r.trigger ? 'break' : 'none' };
}

export { complete, INITIAL_TRACKER };
