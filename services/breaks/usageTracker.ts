// Decides when a break is due. Pure and clock-injected so it is unit tested.
//
// The Android foreground service (modules/upshift-breaks/.../UsageTracker.kt)
// implements this SAME algorithm, because JavaScript is not running when the
// user is in another app. Change both together. Here it also drives the
// in-app timer (time spent in UpShift itself).
//
// Rules:
//  * time counts only while a WATCHED app is in front and the screen is on
//  * gaps longer than MAX_GAP_MS between samples are not counted (the phone
//    was asleep, or the service was suspended), so a long gap can't trigger a
//    surprise break
//  * when the threshold is reached a break is due and the counter resets, so
//    breaks repeat every N minutes of use
//  * a break stays "pending" until it is completed; while pending, opening a
//    watched app triggers it again (this is what makes it mandatory)
//  * REPEAT_GUARD_MS stops a pending break from being re-launched in a loop

export const MAX_GAP_MS = 5_000;
export const REPEAT_GUARD_MS = 4_000;

export type TrackerState = {
  accumulatedMs: number;
  lastSampleAt: number | null;
  pending: boolean;
  lastTriggerAt: number | null;
};

export const INITIAL_TRACKER: TrackerState = { accumulatedMs: 0, lastSampleAt: null, pending: false, lastTriggerAt: null };

export type Sample = { now: number; watchedInForeground: boolean; screenOn: boolean };

export function step(
  prev: TrackerState,
  sample: Sample,
  thresholdMs: number,
): { state: TrackerState; trigger: boolean } {
  const dt = prev.lastSampleAt === null ? 0 : Math.min(Math.max(0, sample.now - prev.lastSampleAt), MAX_GAP_MS);
  const counting = sample.watchedInForeground && sample.screenOn;
  const state: TrackerState = {
    ...prev,
    lastSampleAt: sample.now,
    accumulatedMs: prev.accumulatedMs + (counting ? dt : 0),
  };

  const guardOk = prev.lastTriggerAt === null || sample.now - prev.lastTriggerAt >= REPEAT_GUARD_MS;

  // A break that was started but not finished comes back as soon as a watched app is used.
  if (state.pending && counting && guardOk) {
    return { state: { ...state, lastTriggerAt: sample.now }, trigger: true };
  }

  if (!state.pending && state.accumulatedMs >= thresholdMs && counting && guardOk) {
    return { state: { ...state, accumulatedMs: 0, pending: true, lastTriggerAt: sample.now }, trigger: true };
  }
  return { state, trigger: false };
}

// The user finished the exercise: clear the block and start a fresh interval.
export function complete(prev: TrackerState): TrackerState {
  return { ...prev, accumulatedMs: 0, pending: false };
}
