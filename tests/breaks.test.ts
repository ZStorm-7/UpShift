import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS, PATTERN_IDS, PATTERN_COPY, PHASE_KEY, PHASE_HAPTIC, TOTAL_MS, SCALE_MIN, SCALE_MAX,
  patternTotalMs, phaseAt, scaleAt, eyeOpenAt, compile, asPatternId, DEFAULT_PATTERN, type PatternId,
} from '../services/breaks/timeline.ts';
import { step, complete, INITIAL_TRACKER, MAX_GAP_MS, REPEAT_GUARD_MS, type TrackerState } from '../services/breaks/usageTracker.ts';
import { normalizeSettings, normalizeInterval, DEFAULT_INTERVAL_MIN, MIN_INTERVAL_MIN, MAX_INTERVAL_MIN } from '../services/breaks/settings.ts';

// ---- timeline: properties every pattern must satisfy ----
test('the exercise is exactly 15 seconds, for every pattern', () => {
  assert.equal(TOTAL_MS, 15_000);
  for (const id of PATTERN_IDS) assert.equal(patternTotalMs(PATTERNS[id]), 15_000, id);
});

test('there are exactly four patterns and the default is the calm one', () => {
  assert.deepEqual([...PATTERN_IDS].sort(), ['box', 'calm', 'long', 'sigh']);
  assert.equal(DEFAULT_PATTERN, 'calm');
  assert.equal(asPatternId('nope'), 'calm');
  assert.equal(asPatternId('box'), 'box');
  assert.equal(asPatternId(undefined), 'calm');
});

test('every pattern opens with closing the eyes and ends with opening them', () => {
  for (const id of PATTERN_IDS) {
    const ph = PATTERNS[id].phases;
    assert.equal(ph[0].id, 'close', id);
    assert.equal(ph[ph.length - 1].id, 'open', id);
    assert.ok(ph[0].ms >= 1000 && ph[0].ms <= 2500, `${id} close length`);
    assert.ok(ph[ph.length - 1].ms >= 1000 && ph[ph.length - 1].ms <= 2500, `${id} open length`);
  }
});

test('every pattern has a name, a "good for" line and a label for each phase it uses', () => {
  for (const id of PATTERN_IDS) {
    assert.ok(PATTERN_COPY[id].name && PATTERN_COPY[id].goodFor, id);
    for (const ph of PATTERNS[id].phases) {
      assert.ok(PHASE_KEY[ph.id], `${id}/${ph.id} label`);
      assert.ok(PHASE_HAPTIC[ph.id], `${id}/${ph.id} haptic`);
    }
  }
});

test('phases run in order and finish with done', () => {
  const at = (id: PatternId, ms: number) => phaseAt(id, ms).id;
  assert.deepEqual(PATTERNS.calm.phases.map(p => p.id), ['close', 'in', 'hold', 'out', 'open']);
  assert.equal(at('calm', 0), 'close');
  assert.equal(at('calm', 1999), 'close');
  assert.equal(at('calm', 2000), 'in');
  assert.equal(at('calm', 7000), 'hold');
  assert.equal(at('calm', 8000), 'out');
  assert.equal(at('calm', 14000), 'open');
  assert.equal(at('calm', 15000), 'done');
  assert.equal(at('calm', -5), 'close');
  for (const id of PATTERN_IDS) { assert.equal(at(id, 14999) === 'open', true, id); assert.equal(at(id, 15000), 'done'); }
});

test('phase progress goes 0 to 1 inside a phase', () => {
  assert.equal(phaseAt('calm', 2000).progress, 0);
  assert.ok(Math.abs(phaseAt('calm', 4500).progress - 0.5) < 1e-9);
});

test('orb stays within bounds for every pattern at every moment', () => {
  for (const id of PATTERN_IDS) {
    const c = compile(id);
    for (let t = -100; t <= 16000; t += 25) {
      const s = scaleAt(c, t);
      assert.ok(s >= SCALE_MIN - 1e-9 && s <= SCALE_MAX + 1e-9, `${id} t=${t} s=${s}`);
    }
    assert.equal(scaleAt(c, 0), SCALE_MIN, id);
    assert.equal(scaleAt(c, 15000), SCALE_MIN, id);
  }
});

test('the orb is continuous: no jumps between frames', () => {
  for (const id of PATTERN_IDS) {
    const c = compile(id);
    let prev = scaleAt(c, 0);
    for (let t = 10; t <= 15000; t += 10) {
      const s = scaleAt(c, t);
      assert.ok(Math.abs(s - prev) < 0.02, `${id} jump at ${t}: ${prev} -> ${s}`);
      prev = s;
    }
  }
});

test('calm: grows monotonically on the in-breath and shrinks on the out-breath', () => {
  const c = compile('calm');
  let prev = scaleAt(c, 2000);
  for (let t = 2100; t <= 7000; t += 100) { const s = scaleAt(c, t); assert.ok(s >= prev - 1e-9); prev = s; }
  assert.equal(scaleAt(c, 7500), SCALE_MAX);
  prev = scaleAt(c, 8000);
  for (let t = 8100; t <= 14000; t += 100) { const s = scaleAt(c, t); assert.ok(s <= prev + 1e-9); prev = s; }
});

test('exhales are longer than inhales in every pattern except box (which is equal by design)', () => {
  for (const id of PATTERN_IDS) {
    const inMs = PATTERNS[id].phases.filter(p => p.id === 'in' || p.id === 'sip').reduce((n, p) => n + p.ms, 0);
    const outMs = PATTERNS[id].phases.filter(p => p.id === 'out').reduce((n, p) => n + p.ms, 0);
    if (id === 'box') assert.equal(inMs, outMs, id); else assert.ok(outMs > inMs, `${id}: out ${outMs} vs in ${inMs}`);
  }
});

test('sigh: two double-inhales, each followed by a long exhale', () => {
  const ids = PATTERNS.sigh.phases.map(p => p.id);
  assert.deepEqual(ids, ['close', 'in', 'sip', 'out', 'rest', 'in', 'sip', 'out', 'open']);
  const c = compile('sigh');
  // peak of each sigh reaches full size
  assert.equal(scaleAt(c, 1500 + 1500 + 700), SCALE_MAX);
  assert.equal(scaleAt(c, 7500 + 1500 + 700), SCALE_MAX);
});

test('box: four equal sides', () => {
  const sides = PATTERNS.box.phases.slice(1, -1).map(p => p.ms);
  assert.deepEqual(sides, [3000, 3000, 3000, 3000]);
});

test('eye is open at the start, closed during breathing, open again at the end (every pattern)', () => {
  for (const id of PATTERN_IDS) {
    const c = compile(id);
    assert.equal(eyeOpenAt(c, 0), 1, id);
    assert.equal(eyeOpenAt(c, c.closeMs), 0, id);
    assert.equal(eyeOpenAt(c, 7500), 0, id);
    assert.equal(eyeOpenAt(c, c.openStartMs - 1), 0, id);
    assert.equal(eyeOpenAt(c, 15000), 1, id);
    assert.ok(eyeOpenAt(c, c.closeMs / 2) > 0 && eyeOpenAt(c, c.closeMs / 2) < 1, id);
    assert.ok(eyeOpenAt(c, (c.openStartMs + 15000) / 2) > 0 && eyeOpenAt(c, (c.openStartMs + 15000) / 2) < 1, id);
  }
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
  assert.equal(s.pattern, 'calm');
  assert.equal(s.adaptive, false);
  assert.equal(s.dailyCap, 0);
  assert.equal(s.schedule.enabled, false);
  assert.equal(s.strictUntil, 0);
  const t = normalizeSettings({ enabled: true, intervalMin: 20, pauseAudio: false, bogus: 1 } as any);
  assert.equal(t.enabled, true);
  assert.equal(t.intervalMin, 20);
  assert.equal(t.pauseAudio, false);
  assert.equal('bogus' in t, false);
  assert.equal(normalizeSettings({ enabled: 'yes' } as any).enabled, false);
});

test('new settings are validated', () => {
  const now = 1_000_000;
  const s = normalizeSettings({
    pattern: 'nonsense', dailyCap: -4, schedule: { enabled: true, days: [1, 1, 9, -1, 3, 'x'], startMin: 5000, endMin: 600 },
    pausedUntil: now - 1, strictUntil: now + 60_000,
  } as any, now);
  assert.equal(s.pattern, 'calm');
  assert.equal(s.dailyCap, 0);
  assert.deepEqual(s.schedule.days, [1, 3]);
  assert.equal(s.schedule.startMin, 9 * 60); // out of range falls back to the default
  assert.equal(s.schedule.endMin, 600);
  assert.equal(s.pausedUntil, 0);            // already over
  assert.equal(s.strictUntil, now + 60_000); // still running
  assert.equal(normalizeSettings({ pattern: 'box' } as any).pattern, 'box');
});
