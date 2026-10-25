// The 15-second breathing break, as data. Every pattern is exactly 15 seconds
// (there are deliberately no longer versions) and always opens and closes the
// same way: the eye closes first and opens last. The screen reads this to
// decide what to show, say and feel; the animation reads scaleAt()/eyeOpenAt().
// Keeping it a pure function of elapsed time means it is unit tested and the
// visuals, sound and haptics can never drift from the script.

export type PatternId = 'calm' | 'sigh' | 'box' | 'long';
export type PhaseId = 'close' | 'in' | 'sip' | 'hold' | 'out' | 'rest' | 'open' | 'done';

export const TOTAL_MS = 15_000;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1;

type PhaseDef = {
  id: PhaseId;
  ms: number;
  // Orb size at the start and end of the phase (SCALE_MIN..SCALE_MAX).
  from: number;
  to: number;
};

export type Pattern = {
  id: PatternId;
  // Language-neutral rhythm shown under the name, e.g. "5 · 1 · 6".
  rhythm: string;
  phases: PhaseDef[];
};

const MIN = SCALE_MIN;
const MAX = SCALE_MAX;

export const PATTERNS: Record<PatternId, Pattern> = {
  // Today's default: a general reset.
  calm: {
    id: 'calm', rhythm: '5 · 1 · 6',
    phases: [
      { id: 'close', ms: 2000, from: MIN, to: MIN },
      { id: 'in', ms: 5000, from: MIN, to: MAX },
      { id: 'hold', ms: 1000, from: MAX, to: MAX },
      { id: 'out', ms: 6000, from: MAX, to: MIN },
      { id: 'open', ms: 1000, from: MIN, to: MIN },
    ],
  },
  // Two inhales (the second a short top-up) and one long exhale, twice.
  sigh: {
    id: 'sigh', rhythm: '2 + 1 · 3',
    phases: [
      { id: 'close', ms: 1500, from: MIN, to: MIN },
      { id: 'in', ms: 1500, from: MIN, to: 0.8 },
      { id: 'sip', ms: 700, from: 0.8, to: MAX },
      { id: 'out', ms: 3300, from: MAX, to: MIN },
      { id: 'rest', ms: 500, from: MIN, to: MIN },
      { id: 'in', ms: 1500, from: MIN, to: 0.8 },
      { id: 'sip', ms: 700, from: 0.8, to: MAX },
      { id: 'out', ms: 3300, from: MAX, to: MIN },
      { id: 'open', ms: 2000, from: MIN, to: MIN },
    ],
  },
  // Equal sides: in, hold, out, hold.
  box: {
    id: 'box', rhythm: '3 · 3 · 3 · 3',
    phases: [
      { id: 'close', ms: 1500, from: MIN, to: MIN },
      { id: 'in', ms: 3000, from: MIN, to: MAX },
      { id: 'hold', ms: 3000, from: MAX, to: MAX },
      { id: 'out', ms: 3000, from: MAX, to: MIN },
      { id: 'hold', ms: 3000, from: MIN, to: MIN },
      { id: 'open', ms: 1500, from: MIN, to: MIN },
    ],
  },
  // A short inhale and a much longer exhale.
  long: {
    id: 'long', rhythm: '3.5 · 8',
    phases: [
      { id: 'close', ms: 2000, from: MIN, to: MIN },
      { id: 'in', ms: 3500, from: MIN, to: MAX },
      { id: 'out', ms: 8000, from: MAX, to: MIN },
      { id: 'open', ms: 1500, from: MIN, to: MIN },
    ],
  },
};

export const PATTERN_IDS: PatternId[] = ['calm', 'sigh', 'box', 'long'];
export const DEFAULT_PATTERN: PatternId = 'calm';

export function asPatternId(v: unknown): PatternId {
  return typeof v === 'string' && v in PATTERNS ? (v as PatternId) : DEFAULT_PATTERN;
}

export const patternTotalMs = (p: Pattern) => p.phases.reduce((n, ph) => n + ph.ms, 0);

// ---- Derived, precomputed once per pattern so the animation worklets stay cheap ----
export type Frame = { start: number; end: number; from: number; to: number };
export type CompiledPattern = {
  id: PatternId;
  frames: Frame[];
  closeMs: number;       // the eye finishes closing here
  openStartMs: number;   // the eye starts to open here
};

const compiled: Partial<Record<PatternId, CompiledPattern>> = {};

export function compile(id: PatternId): CompiledPattern {
  const hit = compiled[id];
  if (hit) return hit;
  const p = PATTERNS[id];
  let t = 0;
  const frames: Frame[] = p.phases.map(ph => {
    const f = { start: t, end: t + ph.ms, from: ph.from, to: ph.to };
    t += ph.ms;
    return f;
  });
  const c: CompiledPattern = {
    id,
    frames,
    closeMs: p.phases[0].ms,
    openStartMs: TOTAL_MS - p.phases[p.phases.length - 1].ms,
  };
  compiled[id] = c;
  return c;
}

export function phaseAt(id: PatternId, elapsedMs: number): { id: PhaseId; index: number; startMs: number; progress: number } {
  const p = PATTERNS[id];
  if (elapsedMs >= TOTAL_MS) return { id: 'done', index: p.phases.length, startMs: TOTAL_MS, progress: 1 };
  let start = 0;
  const t = Math.max(0, elapsedMs);
  for (let i = 0; i < p.phases.length; i++) {
    const end = start + p.phases[i].ms;
    if (t < end) return { id: p.phases[i].id, index: i, startMs: start, progress: (t - start) / p.phases[i].ms };
    start = end;
  }
  return { id: 'done', index: p.phases.length, startMs: TOTAL_MS, progress: 1 };
}

// Smooth in/out so the orb accelerates and settles like a real breath.
function ease(p: number): number {
  'worklet';
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
}

// Orb size (SCALE_MIN..SCALE_MAX). 'worklet' lets Reanimated run it on the UI thread.
export function scaleAt(c: CompiledPattern, elapsedMs: number): number {
  'worklet';
  const frames = c.frames;
  if (elapsedMs <= 0) return frames[0].from;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (elapsedMs < f.end) return f.from + (f.to - f.from) * ease((elapsedMs - f.start) / (f.end - f.start));
  }
  return frames[frames.length - 1].to;
}

// 1 = eye fully open, 0 = closed. Closes during the first phase, stays closed
// through the breathing, lifts during the last.
export function eyeOpenAt(c: CompiledPattern, elapsedMs: number): number {
  'worklet';
  if (elapsedMs <= 0) return 1;
  if (elapsedMs < c.closeMs) return 1 - ease(elapsedMs / c.closeMs);
  if (elapsedMs < c.openStartMs) return 0;
  if (elapsedMs < 15000) return ease((elapsedMs - c.openStartMs) / (15000 - c.openStartMs));
  return 1;
}

// Which haptic to fire when a phase begins. The point of these is that the
// exercise works with the eyes closed.
export const PHASE_HAPTIC: Record<PhaseId, 'tick' | 'soft' | 'none' | 'done'> = {
  close: 'soft', in: 'tick', sip: 'tick', hold: 'soft', out: 'tick', rest: 'soft', open: 'soft', done: 'done',
};

// Translation key for the on-screen word of each phase.
export const PHASE_KEY: Record<PhaseId, string> = {
  close: 'breakCloseEyes', in: 'breakIn', sip: 'breakSip', hold: 'breakHold', out: 'breakOut',
  rest: 'breakRest', open: 'breakOpenEyes', done: 'breakDoneTitle',
};

// The translation keys that describe a pattern in settings.
export const PATTERN_COPY: Record<PatternId, { name: string; goodFor: string }> = {
  calm: { name: 'patternCalmName', goodFor: 'patternCalmGood' },
  sigh: { name: 'patternSighName', goodFor: 'patternSighGood' },
  box: { name: 'patternBoxName', goodFor: 'patternBoxGood' },
  long: { name: 'patternLongName', goodFor: 'patternLongGood' },
};
