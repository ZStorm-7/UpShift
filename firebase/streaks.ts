import { doc } from 'firebase/firestore';
import { db } from './config';

// Several quests in the pool talk about streaks ("Keep a 3-day quest streak
// alive", "Complete all 3 daily quests 3 days in a row"), so the app needs
// to actually track them. A streak advances by one each quest-cycle in which
// the user finishes every quest they were given.
export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  // The cycle key (see firebase/quests.ts) of the last fully-completed
  // cycle. Stored so we can tell "they finished yesterday too" (streak
  // continues) apart from "they finished last week" (streak restarts).
  lastCompletedCycleKey: string;
};

export const EMPTY_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedCycleKey: '',
};

export function streakDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'streak');
}

// Cycle keys are "YYYY-MM-DD" strings. Comparing them as strings only works
// for equality — to ask "is B the day right after A?" we have to parse them
// into real dates, because "2026-08-31" + 1 day is "2026-09-01", which no
// amount of string math will tell you.
function parseCycleKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  // Note the month - 1: JS Date months are 0-indexed (0 = January).
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function daysBetween(fromKey: string, toKey: string): number | null {
  const from = parseCycleKey(fromKey);
  const to = parseCycleKey(toKey);
  if (!from || !to) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

// Works out the new streak state after the user completes every quest in the
// cycle identified by `cycleKey`.
//
// Three cases:
//   - Same cycle as last time → nothing changes (already counted; this stops
//     a re-render or a second visit from inflating the streak).
//   - Exactly one cycle later → streak continues, +1.
//   - Anything else (gap, or first ever) → streak restarts at 1.
export function advanceStreak(state: StreakState, cycleKey: string): StreakState {
  if (state.lastCompletedCycleKey === cycleKey) return state;

  const gap = daysBetween(state.lastCompletedCycleKey, cycleKey);
  const continuing = gap === 1;
  const newCurrent = continuing ? state.currentStreak + 1 : 1;

  return {
    currentStreak: newCurrent,
    longestStreak: Math.max(state.longestStreak, newCurrent),
    lastCompletedCycleKey: cycleKey,
  };
}

// A streak is only "alive" if the last completed cycle is the current one or
// the one immediately before it. Any bigger gap means it's already broken,
// so the Dashboard should show 0 rather than a stale number from last month.
export function liveStreak(state: StreakState, currentCycleKey: string): number {
  if (!state.lastCompletedCycleKey) return 0;
  const gap = daysBetween(state.lastCompletedCycleKey, currentCycleKey);
  if (gap === null || gap < 0 || gap > 1) return 0;
  return state.currentStreak;
}
