// The 15-second breathing break, as data. The screen reads this to decide what
// to show and say; the animation reads scaleAt() / eyeOpenAt(). Keeping it a
// pure function of elapsed time means it is unit tested and the visuals can
// never drift from the script.
//
//   0.0s  close eyes      eyelid lowers, "Close your eyes"
//   2.0s  breathe in      5s, orb grows
//   7.0s  hold            1s, orb rests at full size
//   8.0s  breathe out     6s, orb shrinks
//  14.0s  open eyes       eyelid lifts, "Open your eyes"
//  15.0s  done

export type PhaseId = 'close' | 'in' | 'hold' | 'out' | 'open' | 'done';

export const PHASES: { id: PhaseId; ms: number }[] = [
  { id: 'close', ms: 2000 },
  { id: 'in', ms: 5000 },
  { id: 'hold', ms: 1000 },
  { id: 'out', ms: 6000 },
  { id: 'open', ms: 1000 },
];

export const TOTAL_MS = PHASES.reduce((n, p) => n + p.ms, 0); // 15000

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1;

export function phaseAt(elapsedMs: number): { id: PhaseId; index: number; startMs: number; progress: number } {
  if (elapsedMs >= TOTAL_MS) return { id: 'done', index: PHASES.length, startMs: TOTAL_MS, progress: 1 };
  let start = 0;
  const t = Math.max(0, elapsedMs);
  for (let i = 0; i < PHASES.length; i++) {
    const end = start + PHASES[i].ms;
    if (t < end) return { id: PHASES[i].id, index: i, startMs: start, progress: (t - start) / PHASES[i].ms };
    start = end;
  }
  return { id: 'done', index: PHASES.length, startMs: TOTAL_MS, progress: 1 };
}

// Smooth in/out so the orb accelerates and settles like a real breath.
function ease(p: number): number {
  'worklet';
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
}

// 0.5 (resting) -> 1 (full breath) -> 0.5. 'worklet' lets Reanimated run it on the UI thread.
export function scaleAt(elapsedMs: number): number {
  'worklet';
  const IN_START = 2000, IN_END = 7000, HOLD_END = 8000, OUT_END = 14000;
  if (elapsedMs <= IN_START) return SCALE_MIN;
  if (elapsedMs < IN_END) return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * ease((elapsedMs - IN_START) / (IN_END - IN_START));
  if (elapsedMs < HOLD_END) return SCALE_MAX;
  if (elapsedMs < OUT_END) return SCALE_MAX - (SCALE_MAX - SCALE_MIN) * ease((elapsedMs - HOLD_END) / (OUT_END - HOLD_END));
  return SCALE_MIN;
}

// 1 = eye fully open, 0 = closed. Closes during the first phase, stays closed
// through the breathing, lifts during the last.
export function eyeOpenAt(elapsedMs: number): number {
  'worklet';
  const CLOSE_END = 2000, OPEN_START = 14000;
  if (elapsedMs <= 0) return 1;
  if (elapsedMs < CLOSE_END) return 1 - ease(elapsedMs / CLOSE_END);
  if (elapsedMs < OPEN_START) return 0;
  if (elapsedMs < TOTAL_MS) return ease((elapsedMs - OPEN_START) / (TOTAL_MS - OPEN_START));
  return 1;
}

// Which haptic to fire when a phase begins. The point of these is that the
// exercise works with the eyes closed.
export const PHASE_HAPTIC: Record<PhaseId, 'tick' | 'soft' | 'none' | 'done'> = {
  close: 'soft', in: 'tick', hold: 'soft', out: 'tick', open: 'soft', done: 'done',
};
