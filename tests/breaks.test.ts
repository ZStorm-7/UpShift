import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASES, TOTAL_MS, phaseAt, scaleAt, eyeOpenAt, SCALE_MIN, SCALE_MAX,
} from '../services/breaks/timeline.ts';
import { step, complete, INITIAL_TRACKER, MAX_GAP_MS, REPEAT_GUARD_MS, type TrackerState } from '../services/breaks/usageTracker.ts';
import { normalizeSettings, normalizeInterval, DEFAULT_INTERVAL_MIN, MIN_INTERVAL_MIN, MAX_INTERVAL_MIN } from '../services/breaks/settings.ts';

// ---- timeline ----
test('the exercise is exactly 15 seconds', () => assert.equal(TOTAL_MS, 15_000));

test('phases run close, in, hold, out, open, then done', () => {
  assert.deepEqual(PHASES.map(p => p.id), ['close', 'in', 'hold', 'out', 'open']);
  const at = (ms: number) => phaseAt(ms).id;
  assert.equal(at(0), 'close');
  assert.equal(at(1999), 'close');
  assert.equal(at(2000), 'in');
  assert.equal(at(6999), 'in');
  assert.equal(at(7000), 'hold');
  assert.equal(at(8000), 'out');
  assert.equal(at(13999), 'out');
  assert.equal(at(14000), 'open');
  assert.equal(at(14999), 'open');
  assert.equal(at(15000), 'done');
  assert.equal(at(99999), 'done');
  assert.equal(at(-5), 'close');
});

test('phase progress goes 0 to 1 inside a phase', () => {
  assert.equal(phaseAt(2000).progress, 0);
  assert.ok(Math.abs(phaseAt(4500).progress - 0.5) < 1e-9);
});

test('orb stays within bounds, rests at both ends and peaks during the hold', () => {
  for (let t = -100; t <= 16000; t += 25) {
    const s = scaleAt(t);
    assert.ok(s >= SCALE_MIN - 1e-9 && s <= SCALE_MAX + 1e-9, `t=${t} s=${s}`);
  }
  assert.equal(scaleAt(0), SCALE_MIN);
  assert.equal(scaleAt(2000), SCALE_MIN);
  assert.equal(scaleAt(7000), SCALE_MAX);
  assert.equal(scaleAt(7500), SCALE_MAX);
  assert.equal(scaleAt(14000), SCALE_MIN);
  assert.equal(scaleAt(15000), SCALE_MIN);
});

test('orb grows monotonically on the in-breath and shrinks on the out-breath', () => {
  let prev = scaleAt(2000);
  for (let t = 2100; t <= 7000; t += 100) { const s = scaleAt(t); assert.ok(s >= prev - 1e-9); prev = s; }
  prev = scaleAt(8000);
  for (let t = 8100; t <= 14000; t += 100) { const s = scaleAt(t); assert.ok(s <= prev + 1e-9); prev = s; }
});

test('breathing out takes longer than breathing in', () => {
  const inMs = PHASES.find(p => p.id === 'in')!.ms;
  const outMs = PHASES.find(p => p.id === 'out')!.ms;
  assert.ok(outMs > inMs);
});

test('eye is open at the start, closed during breathing, open again at the end', () => {
  assert.equal(eyeOpenAt(0), 1);
  assert.equal(eyeOpenAt(2000), 0);
  assert.equal(eyeOpenAt(8000), 0);
  assert.equal(eyeOpenAt(13999), 0);
  assert.equal(eyeOpenAt(15000), 1);
  assert.ok(eyeOpenAt(1000) > 0 && eyeOpenAt(1000) < 1);
  assert.ok(eyeOpenAt(14500) > 0 && eyeOpenAt(14500) < 1);
});

// ---- usage tracker ----
const MIN = 60_000;
// `finishBreaks` simulates the user completing each break straight away, which
// is the normal case. Pass false to see an unfinished break keep coming back.
function run(samples: { at: number; watched: boolean; screen?: boolean }[], threshold: number, start: TrackerState = INITIAL_TRACKER, finishBreaks = true) {
  let state = start;
  const triggers: number[] = [];
  for (const s of samples) {
    const r = step(state, { now: s.at, watchedInForeground: s.watched, screenOn: s.screen ?? true }, threshold);
    state = r.state;
    if (r.trigger) { triggers.push(s.at); if (finishBreaks) state = complete(state); }
  }
  return { state, triggers };
}
const every = (from: number, to: number, stepMs: number, watched = true, screen = true) => {
  const out = [];
  for (let t = from; t <= to; t += stepMs) out.push({ at: t, watched, screen });
  return out;
};

test('a break is due after N minutes of watched use, and not before', () => {
  const { triggers } = run(every(0, 31 * MIN, 2000), 30 * MIN);
  assert.equal(triggers.length, 1);
  assert.ok(triggers[0] >= 30 * MIN && triggers[0] <= 30 * MIN + 4000, `got ${triggers[0]}`);
  assert.equal(run(every(0, 29 * MIN, 2000), 30 * MIN).triggers.length, 0);
});

test('time in unwatched apps or with the screen off does not count', () => {
  assert.equal(run(every(0, 40 * MIN, 2000, false), 30 * MIN).triggers.length, 0);
  assert.equal(run(every(0, 40 * MIN, 2000, true, false), 30 * MIN).triggers.length, 0);
});

test('only the watched portion counts across a mixed session', () => {
  const samples = [...every(0, 20 * MIN, 2000, true), ...every(20 * MIN + 2000, 50 * MIN, 2000, false), ...every(50 * MIN + 2000, 62 * MIN, 2000, true)];
  const { triggers } = run(samples, 30 * MIN);
  assert.equal(triggers.length, 1);
  assert.ok(triggers[0] > 50 * MIN, 'fires only after ~10 more watched minutes');
});

test('an unfinished break keeps coming back while a watched app is in use', () => {
  const { triggers } = run(every(0, 32 * MIN, 2000), 30 * MIN, INITIAL_TRACKER, false);
  assert.ok(triggers.length > 1, `expected repeats, got ${triggers.length}`);
  for (let i = 1; i < triggers.length; i++) assert.ok(triggers[i] - triggers[i - 1] >= REPEAT_GUARD_MS);
});

test('a long gap (asleep or suspended) is not counted', () => {
  const r = run([{ at: 0, watched: true }, { at: 2000, watched: true }, { at: 3 * 60 * MIN, watched: true }], 30 * MIN);
  assert.equal(r.triggers.length, 0);
  assert.ok(r.state.accumulatedMs <= 2000 + MAX_GAP_MS);
});

test('breaks repeat every N minutes once each one is completed', () => {
  let state = INITIAL_TRACKER;
  const fired: number[] = [];
  for (let t = 0; t <= 95 * MIN; t += 2000) {
    const r = step(state, { now: t, watchedInForeground: true, screenOn: true }, 30 * MIN);
    state = r.state;
    if (r.trigger) { fired.push(t); state = complete(state); }
  }
  assert.equal(fired.length, 3);
  assert.ok(fired[1] - fired[0] >= 30 * MIN);
  assert.ok(fired[2] - fired[1] >= 30 * MIN);
});

test('an unfinished break is mandatory: it returns when a watched app is used, but not in a tight loop', () => {
  let state: TrackerState = { ...INITIAL_TRACKER, pending: true, lastSampleAt: 0, lastTriggerAt: 0 };
  // user leaves without finishing, goes elsewhere for a while
  let r = step(state, { now: 10_000, watchedInForeground: false, screenOn: true }, 30 * MIN);
  assert.equal(r.trigger, false);
  // returns to the watched app: break comes straight back
  r = step(r.state, { now: 12_000, watchedInForeground: true, screenOn: true }, 30 * MIN);
  assert.equal(r.trigger, true);
  // an immediate second sample must not re-launch it again
  r = step(r.state, { now: 12_000 + 1000, watchedInForeground: true, screenOn: true }, 30 * MIN);
  assert.equal(r.trigger, false);
  r = step(r.state, { now: 12_000 + REPEAT_GUARD_MS, watchedInForeground: true, screenOn: true }, 30 * MIN);
  assert.equal(r.trigger, true);
  // finishing clears it
  state = complete(r.state);
  r = step(state, { now: 30_000, watchedInForeground: true, screenOn: true }, 30 * MIN);
  assert.equal(r.trigger, false);
});

// ---- settings ----
test('interval defaults to 30 minutes and is clamped', () => {
  assert.equal(DEFAULT_INTERVAL_MIN, 30);
  assert.equal(normalizeInterval(undefined), 30);
  assert.equal(normalizeInterval('abc'), 30);
  assert.equal(normalizeInterval(0), 30);
  assert.equal(normalizeInterval(-10), 30);
  assert.equal(normalizeInterval(1), MIN_INTERVAL_MIN);
  assert.equal(normalizeInterval(9999), MAX_INTERVAL_MIN);
  assert.equal(normalizeInterval(45.4), 45);
});

test('settings normalize to safe defaults, break features are off until enabled', () => {
  const s = normalizeSettings(undefined);
  assert.equal(s.enabled, false);
  assert.equal(s.intervalMin, 30);
  assert.equal(s.pauseWorkout, true);
  const t = normalizeSettings({ enabled: true, intervalMin: 20, pauseAudio: false, bogus: 1 } as any);
  assert.equal(t.enabled, true);
  assert.equal(t.intervalMin, 20);
  assert.equal(t.pauseAudio, false);
  assert.equal('bogus' in t, false);
  assert.equal(normalizeSettings({ enabled: 'yes' } as any).enabled, false);
});
