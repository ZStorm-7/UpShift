// The emergency pass: an honest escape hatch for a real need (a call, a map, a
// child). It is deliberately a little bit of effort, not a tap: press and hold.
//
//  * 2 per day
//  * hold for 3 seconds to use one
//  * pauses breaks AND strict mode for 10 minutes
//  * the count resets with the calendar day

export const PASSES_PER_DAY = 2;
export const PASS_HOLD_MS = 3_000;
export const PASS_PAUSE_MS = 10 * 60_000;

export const passesLeft = (usedToday: number) => Math.max(0, PASSES_PER_DAY - Math.max(0, Math.floor(usedToday) || 0));

export function holdProgress(heldMs: number): number {
  return Math.min(1, Math.max(0, heldMs / PASS_HOLD_MS));
}

export const holdComplete = (heldMs: number) => heldMs >= PASS_HOLD_MS;

export type PassResult = { ok: true; pausedUntil: number; usedToday: number } | { ok: false; reason: 'none-left' };

export function usePass(now: number, usedToday: number): PassResult {
  if (passesLeft(usedToday) === 0) return { ok: false, reason: 'none-left' };
  return { ok: true, pausedUntil: now + PASS_PAUSE_MS, usedToday: Math.floor(usedToday) + 1 };
}
