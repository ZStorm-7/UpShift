import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decide, inScheduleWindow, effectiveThresholdMs, INITIAL_TRACKER, complete,
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
  pausedUntil: 0, strictUntil: 0,
};

type S = { now: number; watched?: boolean; screen?: boolean; local?: LocalTime; switches?: number; today?: number };
function run(samples: S[], policy: Policy, finish = true) {
  let state: TrackerState = INITIAL_TRACKER;
  const actions: [number, string][] = [];
  let breaks = 0;
  for (const s of samples) {
    const r = decide(state, {
      now: s.now, watchedInForeground: s.watched ?? true, screenOn: s.screen ?? true,
      local: s.local ?? NOON, switchesLast5Min: s.switches ?? 0, breaksToday: s.today ?? breaks,
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
  const r = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: { dayOfWeek: 3, minutesOfDay: 18 * 60 }, switchesLast5Min: 0, breaksToday: 0 }, policy);
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
  const again = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: NOON, switchesLast5Min: 0, breaksToday: 2 }, policy);
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
  const r = decide(stuck, { now: 10_000, watchedInForeground: true, screenOn: true, local: NOON, switchesLast5Min: 0, breaksToday: 0 }, { ...base, pausedUntil: 100_000 });
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
