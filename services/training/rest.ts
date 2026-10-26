// Rest between sets: how long, and how much is left.

export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 300;

export const restLength = (restSec: unknown) => Math.min(REST_MAX_SEC, Math.max(REST_MIN_SEC, Math.round(Number(restSec)) || 60));
export const restRemaining = (endAt: number, now: number) => Math.max(0, Math.ceil((endAt - now) / 1000));
/** Wall-clock end time, so the countdown stays right if the app is backgrounded or the timer drifts. */
export const restEndAt = (now: number, restSec: unknown) => now + restLength(restSec) * 1000;
export const clockMmSs = (sec: number) => { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
