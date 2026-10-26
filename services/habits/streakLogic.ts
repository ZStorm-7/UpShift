// Streaks, with freezes. A freeze is earned every 7 days of streak (hold at most 2) and is spent
// automatically to cover a missed day, so one bad day doesn't erase a long streak.
// Cycle keys are "YYYY-MM-DD" strings (see firebase/quests.ts).

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastCompletedCycleKey: string;
  freezes: number;            // unused freezes, 0 to MAX_FREEZES
  frozenKeys: string[];       // cycles a freeze covered, newest last (kept short)
};

export const MAX_FREEZES = 2;
export const FREEZE_EVERY_DAYS = 7;
const KEEP_FROZEN = 6;

export const EMPTY_STREAK: StreakState = { currentStreak: 0, longestStreak: 0, lastCompletedCycleKey: '', freezes: 0, frozenKeys: [] };

/** Fills in defaults so documents saved before freezes existed still load. */
export function cleanStreak(raw: any): StreakState {
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
  const current = n(raw?.currentStreak, 100_000);
  return {
    currentStreak: current,
    longestStreak: Math.max(n(raw?.longestStreak, 100_000), current),
    lastCompletedCycleKey: typeof raw?.lastCompletedCycleKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastCompletedCycleKey) ? raw.lastCompletedCycleKey : '',
    freezes: n(raw?.freezes, MAX_FREEZES),
    frozenKeys: (Array.isArray(raw?.frozenKeys) ? raw.frozenKeys : []).filter((k: unknown) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)).slice(-KEEP_FROZEN),
  };
}

function parse(key: string): Date | null {
  const p = key.split('-').map(Number);
  return p.length !== 3 || p.some(isNaN) ? null : new Date(p[0], p[1] - 1, p[2]);
}
export function daysBetween(fromKey: string, toKey: string): number | null {
  const a = parse(fromKey), b = parse(toKey);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86_400_000) : null;
}
export function addDaysToKey(key: string, n: number): string {
  const d = parse(key)!;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The new state after every quest in `cycleKey` is done. Idempotent per cycle. */
export function advanceStreak(state: StreakState, cycleKey: string): StreakState {
  if (state.lastCompletedCycleKey === cycleKey) return state;
  const gap = daysBetween(state.lastCompletedCycleKey, cycleKey);
  const missed = gap === null ? 0 : gap - 1;
  let freezes = state.freezes;
  let frozenKeys = state.frozenKeys;
  let current: number;
  if (gap === 1) {
    current = state.currentStreak + 1;
  } else if (gap !== null && gap > 1 && state.currentStreak > 0 && missed <= freezes) {
    // Freezes cover the missed days; the streak carries on, counting only the days actually completed.
    for (let i = 1; i <= missed; i++) frozenKeys = [...frozenKeys, addDaysToKey(state.lastCompletedCycleKey, i)];
    freezes -= missed;
    current = state.currentStreak + 1;
  } else {
    current = 1;
  }
  // Earn a freeze on every 7th day of an ongoing streak.
  if (current > 1 && current % FREEZE_EVERY_DAYS === 0 && freezes < MAX_FREEZES) freezes += 1;
  return {
    currentStreak: current,
    longestStreak: Math.max(state.longestStreak, current),
    lastCompletedCycleKey: cycleKey,
    freezes,
    frozenKeys: frozenKeys.slice(-KEEP_FROZEN),
  };
}

/** The streak to show right now: alive if the missed days since the last completed cycle can be covered. */
export function liveStreak(state: StreakState, currentCycleKey: string): number {
  if (!state.lastCompletedCycleKey) return 0;
  const gap = daysBetween(state.lastCompletedCycleKey, currentCycleKey);
  if (gap === null || gap < 0) return 0;
  return gap - 1 <= state.freezes ? state.currentStreak : 0;
}

/** Days until the next freeze is earned, or null when the stash is full. */
export function daysToNextFreeze(state: StreakState, live: number): number | null {
  if (state.freezes >= MAX_FREEZES) return null;
  return FREEZE_EVERY_DAYS - (live % FREEZE_EVERY_DAYS);
}

/** True when a freeze covered a day in the last two cycles, so the person can be told. */
export function recentlyFrozen(state: StreakState, currentCycleKey: string): boolean {
  return state.frozenKeys.some(k => { const g = daysBetween(k, currentCycleKey); return g !== null && g >= 0 && g <= 2; });
}
