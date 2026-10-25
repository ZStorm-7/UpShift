import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide, inScheduleWindow, effectiveThresholdMs, INITIAL_TRACKER, complete, inWindDown, windDownEndsAt, patternFor,
  NIGHT_FACTOR, RAPID_FACTOR, RAPID_SWITCHES, type Policy, type LocalTime,
} from '../services/breaks/policy.ts';
import { DEFAULT_SCHEDULE } from '../services/breaks/settings.ts';
import { REPEAT_GUARD_MS, type TrackerState } from '../services/breaks/usageTracker.ts';
import {
  PASSES_PER_DAY, PASS_HOLD_MS, PASS_PAUSE_MS, passesLeft, holdProgress, holdComplete, usePass,
} from '../services/breaks/passes.ts';
import { summarizeWeek, cleanDay, lastDayKeys, dayKey, EMPTY_DAY } from '../services/breaks/stats.ts';

const MIN = 60_000;
const NOON: LocalTime = { dayOfWeek: 3, minutesOfDay: 12 * 60 };
const base: Policy = {
  enabled: true, intervalMin: 30, schedule: { ...DEFAULT_SCHEDULE, enabled: false }, dailyCap: 0, adaptive: false,
  windDown: { enabled: false, startMin: 22 * 60, endMin: 6 * 60 }, exceptions: { calls: true, navigation: true, workouts: true },
  pausedUntil: 0, strictUntil: 0,
};

type S = { now: number; watched?: boolean; screen?: boolean; local?: LocalTime; switches?: number; today?: number; call?: boolean; nav?: boolean; work?: boolean };
function run(samples: S[], policy: Policy, finish = true) {
  let state: TrackerState = INITIAL_TRACKER;
  const actions: [number, string][] = [];
  let breaks = 0;
  for (const s of samples) {
    const r = decide(state, {
      now: s.now, watchedInForeground: s.watched ?? true, screenOn: s.screen ?? true,
      local: s.local ?? NOON, switchesLast5Min: s.switches ?? 0, breaksToday: s.today ?? breaks,
      inCall: s.call ?? false, navigating: s.nav ?? false, workout: s.work ?? false,
    }, policy);
    state = r.state;
    if (r.action !== 'none') {
      actions.push([s.now, r.action]);
      if (r.action === 'break' && finish) { state = complete(state); breaks++; }
    }
  }
  return { state, actions, breaks };
}
const every = (from: number, to: number, stepMs = 2000, extra: Partial<S> = {}): S[] => {
  const out: S[] = [];
  for (let t = from; t <= to; t += stepMs) out.push({ now: t, ...extra });
  return out;
};

// ---- schedule windows ----
test('a disabled schedule is always open', () => {
  assert.equal(inScheduleWindow({ ...DEFAULT_SCHEDULE, enabled: false }, { dayOfWeek: 0, minutesOfDay: 3 * 60 }), true);
});

test('a same-day window includes its start and excludes its end', () => {
  const s = { enabled: true, days: [1, 2, 3, 4, 5], startMin: 9 * 60, endMin: 17 * 60 };
  assert.equal(inScheduleWindow(s, { dayOfWeek: 3, minutesOfDay: 9 * 60 }), true);
  assert.equal(inScheduleWindow(s, { dayOfWeek: 3, minutesOfDay: 17 * 60 - 1 }), true);
  assert.equal(inScheduleWindow(s, { dayOfWeek: 3, minutesOfDay: 17 * 60 }), false);
  assert.equal(inScheduleWindow(s, { dayOfWeek: 3, minutesOfDay: 8 * 60 + 59 }), false);
  assert.equal(inScheduleWindow(s, { dayOfWeek: 6, minutesOfDay: 12 * 60 }), false); // Saturday
  assert.equal(inScheduleWindow(s, { dayOfWeek: 0, minutesOfDay: 12 * 60 }), false); // Sunday
});

test('an overnight window belongs to the day it starts on', () => {
  const s = { enabled: true, days: [5], startMin: 22 * 60, endMin: 6 * 60 }; // Friday night
  assert.equal(inScheduleWindow(s, { dayOfWeek: 5, minutesOfDay: 23 * 60 }), true);   // Fri 23:00
  assert.equal(inScheduleWindow(s, { dayOfWeek: 6, minutesOfDay: 2 * 60 }), true);    // Sat 02:00 (still Friday's night)
  assert.equal(inScheduleWindow(s, { dayOfWeek: 6, minutesOfDay: 6 * 60 }), false);   // Sat 06:00: over
  assert.equal(inScheduleWindow(s, { dayOfWeek: 5, minutesOfDay: 2 * 60 }), false);   // Fri 02:00 is Thursday's night
  assert.equal(inScheduleWindow(s, { dayOfWeek: 6, minutesOfDay: 23 * 60 }), false);  // Sat 23:00: Saturday isn't selected
});

test('start equal to end means the whole day, and no days means never', () => {
  assert.equal(inScheduleWindow({ enabled: true, days: [2], startMin: 0, endMin: 0 }, { dayOfWeek: 2, minutesOfDay: 800 }), true);
  assert.equal(inScheduleWindow({ enabled: true, days: [], startMin: 0, endMin: 0 }, { dayOfWeek: 2, minutesOfDay: 800 }), false);
});

// ---- adaptive timing ----
test('adaptive timing is off unless asked for', () => {
  assert.equal(effectiveThresholdMs(30, false, { dayOfWeek: 1, minutesOfDay: 23 * 60 }, 99), 30 * MIN);
});

test('adaptive timing halves the gap at night and shortens it when switching rapidly', () => {
  const night = { dayOfWeek: 1, minutesOfDay: 23 * 60 };
  assert.equal(effectiveThresholdMs(30, true, NOON, 0), 30 * MIN);
  assert.equal(effectiveThresholdMs(30, true, night, 0), 30 * MIN * NIGHT_FACTOR);
  assert.equal(effectiveThresholdMs(30, true, NOON, RAPID_SWITCHES), Math.round(30 * MIN * RAPID_FACTOR));
  assert.equal(effectiveThresholdMs(30, true, night, RAPID_SWITCHES), Math.round(30 * MIN * NIGHT_FACTOR * RAPID_FACTOR));
  assert.equal(effectiveThresholdMs(30, true, { dayOfWeek: 1, minutesOfDay: 4 * 60 + 59 }, 0), 15 * MIN); // still night at 04:59
  assert.equal(effectiveThresholdMs(30, true, { dayOfWeek: 1, minutesOfDay: 5 * 60 }, 0), 30 * MIN);      // morning
});

test('adaptive timing never goes below 5 minutes, or below the user\'s own shorter interval', () => {
  const night = { dayOfWeek: 1, minutesOfDay: 23 * 60 };
  assert.equal(effectiveThresholdMs(8, true, night, RAPID_SWITCHES), 5 * MIN);
  assert.equal(effectiveThresholdMs(5, true, night, RAPID_SWITCHES), 5 * MIN);
});

test('a break comes sooner at night when adaptive is on', () => {
  const night = { dayOfWeek: 2, minutesOfDay: 23 * 60 };
  const a = run(every(0, 20 * MIN, 2000, { local: night }), { ...base, adaptive: true });
  assert.ok(a.actions[0] && a.actions[0][0] <= 15 * MIN + 4000, 'fires at ~15 min');
  const b = run(every(0, 20 * MIN, 2000, { local: night }), base);
  assert.equal(b.actions.length, 0);
});

// ---- schedule gating ----
test('nothing happens outside the schedule, and breaks resume inside it', () => {
  const policy: Policy = { ...base, schedule: { enabled: true, days: [3], startMin: 9 * 60, endMin: 17 * 60 } };
  const outside = { dayOfWeek: 3, minutesOfDay: 20 * 60 };
  assert.equal(run(every(0, 90 * MIN, 2000, { local: outside }), policy).actions.length, 0);
  assert.equal(run(every(0, 31 * MIN, 2000, { local: NOON }), policy).actions.length, 1);
});

test('time spent outside the schedule does not count toward the next break', () => {
  const policy: Policy = { ...base, schedule: { enabled: true, days: [3], startMin: 9 * 60, endMin: 17 * 60 } };
  const samples = [...every(0, 25 * MIN, 2000, { local: { dayOfWeek: 3, minutesOfDay: 20 * 60 } }), ...every(25 * MIN + 2000, 50 * MIN, 2000, { local: NOON })];
  const r = run(samples, policy);
  assert.equal(r.actions.length, 0, 'only 25 minutes inside the window');
});

test('an unfinished break is released when the schedule closes, so it cannot trap the user', () => {
  const policy: Policy = { ...base, schedule: { enabled: true, days: [3], startMin: 9 * 60, endMin: 17 * 60 } };
  const stuck: TrackerState = { ...INITIAL_TRACKER, pending: true, lastSampleAt: 0, lastTriggerAt: 0 };
  const r = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: { dayOfWeek: 3, minutesOfDay: 18 * 60 }, switchesLast5Min: 0, breaksToday: 0, inCall: false, navigating: false, workout: false }, policy);
  assert.equal(r.action, 'none');
  assert.equal(r.state.pending, false);
});

// ---- daily cap ----
test('the daily cap stops new breaks, but an unfinished one still returns', () => {
  const policy: Policy = { ...base, dailyCap: 2 };
  const r = run(every(0, 200 * MIN, 2000), policy);
  assert.equal(r.breaks, 2);
  assert.equal(r.actions.length, 2);
  // an unfinished break at the cap still comes back
  const stuck: TrackerState = { ...INITIAL_TRACKER, pending: true, lastSampleAt: 0, lastTriggerAt: 0 };
  const again = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: NOON, switchesLast5Min: 0, breaksToday: 2, inCall: false, navigating: false, workout: false }, policy);
  assert.equal(again.action, 'break');
});

test('a cap of 0 means no limit', () => {
  assert.ok(run(every(0, 200 * MIN, 2000), { ...base, dailyCap: 0 }).breaks >= 6);
});

// ---- emergency pause ----
test('the emergency pause stops breaks and the clock, then breaks resume', () => {
  const policy: Policy = { ...base, pausedUntil: 40 * MIN };
  const r = run(every(0, 70 * MIN, 2000), policy);
  assert.ok(r.actions.length >= 1);
  assert.ok(r.actions[0][0] >= 40 * MIN + 30 * MIN - 4000, `first break only after pause + 30 min of use, got ${r.actions[0][0] / MIN}`);
});

test('the pause also clears an unfinished break from firing', () => {
  const stuck: TrackerState = { ...INITIAL_TRACKER, pending: true, lastSampleAt: 0, lastTriggerAt: 0 };
  const r = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: NOON, switchesLast5Min: 0, breaksToday: 0, inCall: false, navigating: false, workout: false }, { ...base, pausedUntil: 100_000 });
  assert.equal(r.action, 'none');
});

// ---- strict mode ----
test('strict mode blocks a watched app that is in front, and not before or after', () => {
  const policy: Policy = { ...base, strictUntil: 30 * MIN };
  const r = run(every(0, 40 * MIN, 2000), policy);
  const strict = r.actions.filter(a => a[1] === 'strict');
  assert.ok(strict.length > 0);
  assert.ok(strict.every(a => a[0] < 30 * MIN), 'never after it ends');
  for (let i = 1; i < strict.length; i++) assert.ok(strict[i][0] - strict[i - 1][0] >= REPEAT_GUARD_MS, 'not in a tight loop');
  assert.equal(run(every(0, 20 * MIN, 2000, { watched: false }), policy).actions.length, 0, 'unwatched apps are fine');
});

test('strict mode ignores the schedule and the daily cap', () => {
  const policy: Policy = { ...base, strictUntil: 30 * MIN, dailyCap: 1, schedule: { enabled: true, days: [0], startMin: 0, endMin: 60 } };
  assert.ok(run(every(0, 10 * MIN, 2000, { today: 5 }), policy).actions.some(a => a[1] === 'strict'));
});

test('the emergency pause beats strict mode', () => {
  const policy: Policy = { ...base, strictUntil: 60 * MIN, pausedUntil: 10 * MIN };
  const r = run(every(0, 9 * MIN, 2000), policy);
  assert.equal(r.actions.length, 0);
  assert.ok(run(every(0, 12 * MIN, 2000), policy).actions.some(a => a[1] === 'strict'), 'strict resumes when the pause ends');
});

test('a disabled policy does nothing at all', () => {
  assert.equal(run(every(0, 120 * MIN, 2000), { ...base, enabled: false, strictUntil: 10 ** 12 }).actions.length, 0);
});

// ---- emergency pass ----
test('two passes a day, then none', () => {
  assert.equal(PASSES_PER_DAY, 2);
  assert.equal(passesLeft(0), 2);
  assert.equal(passesLeft(1), 1);
  assert.equal(passesLeft(2), 0);
  assert.equal(passesLeft(9), 0);
  assert.equal(passesLeft(-3), 2);
  assert.equal(passesLeft(NaN as any), 2);
});

test('using a pass pauses for ten minutes and counts it', () => {
  assert.equal(PASS_PAUSE_MS, 10 * MIN);
  const r = usePass(1000, 0);
  assert.deepEqual(r, { ok: true, pausedUntil: 1000 + 10 * MIN, usedToday: 1 });
  const r2 = usePass(1000, 1);
  assert.ok(r2.ok && r2.usedToday === 2);
  assert.deepEqual(usePass(1000, 2), { ok: false, reason: 'none-left' });
});

test('the pass needs a three-second hold', () => {
  assert.equal(PASS_HOLD_MS, 3000);
  assert.equal(holdProgress(0), 0);
  assert.equal(holdProgress(1500), 0.5);
  assert.equal(holdProgress(99999), 1);
  assert.equal(holdProgress(-5), 0);
  assert.equal(holdComplete(2999), false);
  assert.equal(holdComplete(3000), true);
});

// ---- weekly stats ----
test('stats are cleaned and capped', () => {
  assert.deepEqual(cleanDay(undefined), EMPTY_DAY);
  const d = cleanDay({ done: -2, stay: 'x', exit: 3.9, passes: 99999, intent: { unwind: 2, evil: 5 } });
  assert.equal(d.done, 0);
  assert.equal(d.stay, 0);
  assert.equal(d.exit, 3);
  assert.equal(d.passes, 10_000);
  assert.deepEqual(d.intent, { unwind: 2 });
});

test('the last seven day keys end today and cross a month boundary correctly', () => {
  const keys = lastDayKeys(new Date(2026, 2, 3), 7); // 3 March 2026
  assert.equal(keys.length, 7);
  assert.equal(keys[6], '2026-03-03');
  assert.equal(keys[0], '2026-02-25');
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('weekly summary totals, exit rate, intents and busiest day', () => {
  const today = new Date(2026, 9, 25);
  const k = lastDayKeys(today, 7);
  const s = summarizeWeek({
    [k[6]]: { done: 3, stay: 1, exit: 2, passes: 1, strict: 1, intent: { unwind: 2, unsure: 1 } },
    [k[5]]: { done: 5, stay: 4, exit: 1, intent: { unwind: 1, specific: 4 } },
    [k[0]]: { done: 1, stay: 1, exit: 0 },
  }, today);
  assert.equal(s.total, 9);
  assert.equal(s.exits, 3);
  assert.equal(s.stays, 6);
  assert.ok(Math.abs(s.exitRate! - 3 / 9) < 1e-9);
  assert.equal(s.passes, 1);
  assert.equal(s.strict, 1);
  assert.deepEqual(s.intents, { specific: 4, unwind: 3, unsure: 1 });
  assert.deepEqual(s.busiest, { key: k[5], done: 5 });
  assert.equal(s.days.length, 7);
  assert.equal(s.days[6].done, 3);
});

test('streak counts back from today, and an empty today does not break it', () => {
  const today = new Date(2026, 9, 25);
  const k = lastDayKeys(today, 7);
  assert.equal(summarizeWeek({ [k[6]]: { done: 1 }, [k[5]]: { done: 2 }, [k[4]]: { done: 1 }, [k[2]]: { done: 9 } }, today).streak, 3);
  assert.equal(summarizeWeek({ [k[5]]: { done: 2 }, [k[4]]: { done: 1 } }, today).streak, 2, 'today has none yet');
  assert.equal(summarizeWeek({ [k[4]]: { done: 1 } }, today).streak, 0, 'a gap yesterday and today ends it');
  assert.equal(summarizeWeek({}, today).streak, 0);
});

test('an empty week has no exit rate and no busiest day', () => {
  const s = summarizeWeek({}, new Date(2026, 9, 25));
  assert.equal(s.total, 0);
  assert.equal(s.exitRate, null);
  assert.equal(s.busiest, null);
});

// ---- labels ----
import { weekdayLabel, timeLabel, percentLabel, localeFor } from '../services/breaks/format.ts';

test('weekday labels start on Sunday and follow the language', () => {
  assert.equal(weekdayLabel(0, 'en'), 'Sun');
  assert.equal(weekdayLabel(1, 'en'), 'Mon');
  assert.equal(weekdayLabel(6, 'en'), 'Sat');
  assert.equal(weekdayLabel(7, 'en'), 'Sun', 'wraps');
  assert.notEqual(weekdayLabel(1, 'es'), weekdayLabel(1, 'en'));
  for (const l of ['en', 'es', 'fr', 'zh', 'te']) for (let d = 0; d < 7; d++) assert.ok(weekdayLabel(d, l).length > 0, `${l}/${d}`);
});

test('time labels are valid for every minute of the day and wrap', () => {
  assert.match(timeLabel(9 * 60, 'en'), /9:00/);
  assert.match(timeLabel(0, 'en'), /12:00/);
  assert.equal(timeLabel(1440, 'en'), timeLabel(0, 'en'));
  assert.equal(timeLabel(-60, 'en'), timeLabel(23 * 60, 'en'));
  assert.equal(localeFor('zh'), 'zh-CN');
  assert.equal(localeFor('??'), 'en');
});

test('percent labels are clamped', () => {
  assert.equal(percentLabel(0.333), '33%');
  assert.equal(percentLabel(2), '100%');
  assert.equal(percentLabel(-1), '0%');
});

// ---- deep links ----
test('strict-mode link parameters survive being strings', () => {
  // The Android service builds upshift://break?mode=strict&until=<ms>&..., and
  // React Navigation hands every query value to the screen as a STRING.
  const until = String(1_700_000_123_000);
  assert.equal(Number(until), 1_700_000_123_000);
  assert.ok(Number.isFinite(new Date(Number(until)).getTime()));
  assert.ok(Number.isNaN(new Date(until as any).getTime()), 'a raw string date is invalid, which is the bug this guards against');
  assert.equal(Number(undefined) || 0, 0);
});

// ---- wind-down ----
const NIGHT10: LocalTime = { dayOfWeek: 2, minutesOfDay: 23 * 60 };
const WD = { enabled: true, startMin: 22 * 60, endMin: 6 * 60 };

test('the wind-down runs overnight, every day, and is off unless enabled', () => {
  assert.equal(inWindDown({ ...WD, enabled: false }, NIGHT10), false);
  assert.equal(inWindDown(WD, { dayOfWeek: 2, minutesOfDay: 22 * 60 }), true);
  assert.equal(inWindDown(WD, { dayOfWeek: 3, minutesOfDay: 5 * 60 + 59 }), true);
  assert.equal(inWindDown(WD, { dayOfWeek: 3, minutesOfDay: 6 * 60 }), false);
  assert.equal(inWindDown(WD, { dayOfWeek: 3, minutesOfDay: 21 * 60 + 59 }), false);
  for (let d = 0; d < 7; d++) assert.equal(inWindDown(WD, { dayOfWeek: d, minutesOfDay: 2 * 60 }), true, `day ${d}`);
});

test('the morning unlock time is right, including across midnight', () => {
  const t0 = 1_000_000_000_000;
  assert.equal(windDownEndsAt(t0, { dayOfWeek: 2, minutesOfDay: 23 * 60 }, WD), t0 + 7 * 60 * 60_000);
  assert.equal(windDownEndsAt(t0, { dayOfWeek: 3, minutesOfDay: 5 * 60 }, WD), t0 + 60 * 60_000);
  assert.equal(windDownEndsAt(t0, { dayOfWeek: 3, minutesOfDay: 5 * 60 + 59 }, WD), t0 + 60_000);
});

test('inside the wind-down the long exhale is used, outside the user\'s own choice', () => {
  assert.equal(patternFor('box', WD, NIGHT10), 'long');
  assert.equal(patternFor('box', WD, NOON), 'box');
  assert.equal(patternFor('box', { ...WD, enabled: false }, NIGHT10), 'box');
  assert.equal(patternFor('nonsense' as any, WD, NOON), 'calm');
});

test('during the wind-down a watched app is blocked, and the morning lifts it', () => {
  const policy: Policy = { ...base, windDown: WD };
  assert.ok(run(every(0, 10 * MIN, 2000, { local: NIGHT10 }), policy).actions.some(a => a[1] === 'strict'));
  assert.equal(run(every(0, 10 * MIN, 2000, { local: { dayOfWeek: 3, minutesOfDay: 8 * 60 } }), policy).actions.length, 0);
  assert.equal(run(every(0, 10 * MIN, 2000, { local: NIGHT10, watched: false }), policy).actions.length, 0, 'unwatched apps stay open');
});

test('the emergency pause opens the apps during the wind-down', () => {
  const policy: Policy = { ...base, windDown: WD, pausedUntil: 5 * MIN };
  const r = run(every(0, 9 * MIN, 2000, { local: NIGHT10 }), policy);
  assert.ok(r.actions.every(a => a[0] >= 5 * MIN), 'nothing before the pause ends');
  assert.ok(r.actions.length > 0, 'blocked again once it ends');
});

// ---- exceptions ----
test('a phone call, navigation or workout stops everything, even strict mode and the wind-down', () => {
  const policy: Policy = { ...base, strictUntil: 60 * MIN, windDown: WD };
  for (const flag of ['call', 'nav', 'work'] as const) {
    assert.equal(run(every(0, 20 * MIN, 2000, { local: NIGHT10, [flag]: true }), policy).actions.length, 0, flag);
  }
  assert.ok(run(every(0, 20 * MIN, 2000, { local: NIGHT10 }), policy).actions.length > 0, 'and it resumes when the call ends');
});

test('each exception can be switched off separately', () => {
  const noCalls: Policy = { ...base, strictUntil: 60 * MIN, exceptions: { calls: false, navigation: true, workouts: true } };
  assert.ok(run(every(0, 5 * MIN, 2000, { call: true }), noCalls).actions.length > 0);
  assert.equal(run(every(0, 5 * MIN, 2000, { nav: true }), noCalls).actions.length, 0);
});

test('time in a call does not count toward the next break', () => {
  const r = run([...every(0, 29 * MIN, 2000, { call: true }), ...every(29 * MIN + 2000, 40 * MIN, 2000)], base);
  assert.equal(r.actions.length, 0, 'only 11 minutes of real use');
});

// ---- rewards, streaks, frames ----
import {
  breakXp, DAILY_BREAK_XP_CAP, BREAK_XP, advanceBreakStreak, liveBreakStreak, EMPTY_BREAK_STREAK, cleanStreak,
  addDays, bestFrame, nextFrame, unlockedFrames, FRAMES,
} from '../services/breaks/rewards.ts';
import { weekHours, peakHourOf } from '../services/breaks/stats.ts';
import { REFLECTIONS, reflectionForDay } from '../data/reflections.ts';

test('XP is paid for the first three breaks of a day, then nothing', () => {
  assert.equal(breakXp(0), BREAK_XP);
  assert.equal(breakXp(2), BREAK_XP);
  assert.equal(breakXp(3), 0);
  assert.equal(breakXp(40), 0);
  assert.equal(breakXp(-5), BREAK_XP);
  assert.equal(breakXp(NaN as any), BREAK_XP);
  let total = 0;
  for (let i = 0; i < 100; i++) total += breakXp(i);
  assert.equal(total, DAILY_BREAK_XP_CAP, 'a hundred breaks in a day still pay out only the cap');
  assert.ok(DAILY_BREAK_XP_CAP <= 100, 'far below the 1000 XP/day the server allows, so it can never trip the clamp');
});

test('day arithmetic crosses months, years and leap days', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('the break streak grows day by day, holds within a day, and restarts after a gap', () => {
  let s = EMPTY_BREAK_STREAK;
  s = advanceBreakStreak(s, '2026-10-20'); assert.equal(s.current, 1);
  s = advanceBreakStreak(s, '2026-10-20'); assert.equal(s.current, 1, 'a second break the same day adds nothing');
  s = advanceBreakStreak(s, '2026-10-21'); assert.equal(s.current, 2);
  s = advanceBreakStreak(s, '2026-10-22'); assert.equal(s.current, 3);
  assert.equal(s.longest, 3);
  s = advanceBreakStreak(s, '2026-10-25'); assert.equal(s.current, 1, 'two missed days restart it');
  assert.equal(s.longest, 3, 'but the longest is kept');
});

test('the displayed streak only drops after a full missed day', () => {
  const s = { current: 5, longest: 9, lastDay: '2026-10-24' };
  assert.equal(liveBreakStreak(s, '2026-10-24'), 5);
  assert.equal(liveBreakStreak(s, '2026-10-25'), 5, 'today not done yet');
  assert.equal(liveBreakStreak(s, '2026-10-26'), 0, 'a whole day missed');
  assert.equal(liveBreakStreak(EMPTY_BREAK_STREAK, '2026-10-26'), 0);
});

test('streak documents are cleaned', () => {
  assert.deepEqual(cleanStreak({ current: -4, longest: 'x', lastDay: 'yesterday' }), { current: 0, longest: 0, lastDay: '' });
  assert.equal(cleanStreak({ current: 6, longest: 2, lastDay: '2026-10-24' }).longest, 6, 'longest is never below current');
});

test('frames unlock by the longest streak and are never lost', () => {
  assert.equal(bestFrame(0), null);
  assert.equal(bestFrame(2), null);
  assert.equal(bestFrame(3)?.id, 'dawn');
  assert.equal(bestFrame(7)?.id, 'aurora');
  assert.equal(bestFrame(100)?.id, 'zen');
  assert.equal(unlockedFrames(7).length, 2);
  assert.deepEqual(nextFrame(5), { id: 'aurora', nameKey: 'frameAurora', daysLeft: 2 });
  assert.equal(nextFrame(30), null);
  assert.deepEqual(FRAMES.map(f => f.days), [3, 7, 30]);
});

test('hour counters add up and the busiest hour is found', () => {
  const rows = [{ hours: { h9: 2, h21: 3 } }, { hours: { h21: 4, h22: 1 } }, { hours: {} }] as any;
  const h = weekHours(rows);
  assert.equal(h.length, 24);
  assert.equal(h[21], 7);
  assert.equal(peakHourOf(h), 21);
  assert.equal(peakHourOf(Array.from({ length: 24 }, () => 0)), null);
});

test('mood and hours reach the weekly summary', () => {
  const today = new Date(2026, 9, 25);
  const k = lastDayKeys(today, 7);
  const s = summarizeWeek({
    [k[6]]: { done: 2, moodSum: 9, moodN: 2, hours: { h21: 2 } },
    [k[5]]: { done: 1, moodSum: 3, moodN: 1, hours: { h21: 1 } },
  }, today);
  assert.ok(Math.abs(s.moodAvg! - 4) < 1e-9);
  assert.equal(s.peakHour, 21);
  assert.equal(summarizeWeek({}, today).moodAvg, null);
});

test('reflections: every language has the same number, all short, none repeated', () => {
  const n = REFLECTIONS.en.length;
  for (const l of Object.keys(REFLECTIONS) as (keyof typeof REFLECTIONS)[]) {
    assert.equal(REFLECTIONS[l].length, n, l);
    assert.equal(new Set(REFLECTIONS[l]).size, n, `${l} has duplicates`);
    for (const line of REFLECTIONS[l]) assert.ok(line.length >= 5 && line.length <= 100, `${l}: ${line}`);
  }
});

test('the reflection is stable within a day, changes the next, and falls back to English', () => {
  const a = new Date(2026, 9, 25, 8), b = new Date(2026, 9, 25, 23), c = new Date(2026, 9, 26, 8);
  assert.equal(reflectionForDay('en', a), reflectionForDay('en', b));
  assert.notEqual(reflectionForDay('en', a), reflectionForDay('en', c));
  assert.equal(reflectionForDay('xx', a), reflectionForDay('en', a));
  const seen = new Set<string>();
  for (let d = 0; d < REFLECTIONS.en.length; d++) seen.add(reflectionForDay('en', new Date(2026, 9, 1 + d)));
  assert.equal(seen.size, REFLECTIONS.en.length, 'a full cycle shows every line once');
});

// ---- widget ----
import { widgetState } from '../services/breaks/policy.ts';

const wsample = (over: any = {}) => ({
  now: 1_000_000, watchedInForeground: true, screenOn: true, local: NOON, switchesLast5Min: 0, breaksToday: 0,
  inCall: false, navigating: false, workout: false, ...over,
});

test('the widget counts down to the next break, rounding up', () => {
  assert.deepEqual(widgetState({ ...INITIAL_TRACKER, accumulatedMs: 0 }, wsample(), base), { kind: 'countdown', minutes: 30 });
  assert.deepEqual(widgetState({ ...INITIAL_TRACKER, accumulatedMs: 29 * MIN }, wsample(), base), { kind: 'countdown', minutes: 1 });
  assert.deepEqual(widgetState({ ...INITIAL_TRACKER, accumulatedMs: 29 * MIN + 1 }, wsample(), base), { kind: 'countdown', minutes: 1 }, '59.999s left still reads 1');
  assert.deepEqual(widgetState({ ...INITIAL_TRACKER, accumulatedMs: 31 * MIN }, wsample(), base), { kind: 'countdown', minutes: 0 });
});

test('the widget shows the right state for each rule, in the same order as decide()', () => {
  const fresh = INITIAL_TRACKER;
  assert.equal(widgetState(fresh, wsample(), { ...base, enabled: false }).kind, 'off');
  assert.deepEqual(widgetState(fresh, wsample(), { ...base, pausedUntil: 1_000_000 + 5 * MIN }), { kind: 'paused', minutes: 5 });
  assert.deepEqual(widgetState(fresh, wsample(), { ...base, strictUntil: 1_000_000 + 20 * MIN }), { kind: 'strict', minutes: 20 });
  assert.equal(widgetState(fresh, wsample({ local: NIGHT10 }), { ...base, windDown: WD }).kind, 'strict');
  assert.equal(widgetState(fresh, wsample({ local: { dayOfWeek: 3, minutesOfDay: 20 * 60 } }), { ...base, schedule: { enabled: true, days: [3], startMin: 540, endMin: 1020 } }).kind, 'outside');
  assert.equal(widgetState(fresh, wsample({ breaksToday: 3 }), { ...base, dailyCap: 3 }).kind, 'done');
  assert.equal(widgetState({ ...fresh, pending: true }, wsample({ breaksToday: 3 }), { ...base, dailyCap: 3 }).kind, 'countdown', 'an unfinished break is not "done"');
  assert.equal(widgetState(fresh, wsample(), { ...base, pausedUntil: 2_000_000, strictUntil: 3_000_000 }).kind, 'paused', 'a pause beats strict');
});

test('smart timing changes what the widget counts down from', () => {
  const night = wsample({ local: NIGHT10 });
  assert.deepEqual(widgetState(INITIAL_TRACKER, night, { ...base, adaptive: true }), { kind: 'countdown', minutes: 15 });
});

import { clock } from '../services/breaks/format.ts';
test('the countdown reads m:ss under an hour and h:mm:ss from an hour up', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(59_000), '0:59');
  assert.equal(clock(27 * 60_000 + 19_000), '27:19');
  assert.equal(clock(59 * 60_000 + 59_000), '59:59');
  assert.equal(clock(60 * 60_000), '1:00:00');
  assert.equal(clock(6 * 3600_000 + 2 * 60_000 + 5_000), '6:02:05');
  assert.equal(clock(-5), '0:00');
  assert.equal(clock(1_001), '0:02', 'rounds up so it never shows 0:00 while time remains');
});
