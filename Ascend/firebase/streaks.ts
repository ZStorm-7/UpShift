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
  // How many streak freezes this account is currently holding — see
  // reconcileStreakWithFreeze below. Earned automatically (grantFreezeIfEarned),
  // never purchased; there's no currency/store concept in this app to spend.
  freezesAvailable: number;
  // The highest currentStreak a freeze has ever been granted FOR, so a
  // streak that goes 7 -> 8 -> ...-> 14 only grants one freeze per 7-day
  // milestone crossed, not once per day it happens to still be >= 7.
  lastFreezeGrantedAtStreak: number;
};

export const EMPTY_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedCycleKey: '',
  freezesAvailable: 0,
  lastFreezeGrantedAtStreak: 0,
};

// Cheap to build, directly attacks the #1 reason a streak system loses
// people: one missed day (sick, travel, a bad night) wiping out weeks of
// consistency and taking the motivation to start again with it. Duolingo
// popularized this exact mechanic for the same reason — see the
// competitor-research writeup this came out of.
const FREEZE_MILESTONE_INTERVAL = 7;
const MAX_FREEZES = 2;

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

  // One freeze per 7-day milestone the streak actually reaches, capped so a
  // long streak can't bank an unlimited pile of them — 2 is enough to
  // survive an occasional bad week without turning "streak" into "number
  // that never goes down no matter what you do."
  const milestonesReached = Math.floor(newCurrent / FREEZE_MILESTONE_INTERVAL);
  const milestonesAlreadyGranted = Math.floor(state.lastFreezeGrantedAtStreak / FREEZE_MILESTONE_INTERVAL);
  const newlyEarned = Math.max(0, milestonesReached - milestonesAlreadyGranted);
  const freezesAvailable = Math.min(MAX_FREEZES, state.freezesAvailable + newlyEarned);
  const lastFreezeGrantedAtStreak = newlyEarned > 0 ? newCurrent : state.lastFreezeGrantedAtStreak;

  return {
    currentStreak: newCurrent,
    longestStreak: Math.max(state.longestStreak, newCurrent),
    lastCompletedCycleKey: cycleKey,
    freezesAvailable,
    lastFreezeGrantedAtStreak,
  };
}

// Bridges EXACTLY one missed cycle using a banked freeze, run once whenever
// streak state is loaded (see DashboardScreen) — BEFORE anything reads
// liveStreak/currentStreak for display, so a protected streak never
// visibly drops to 0 even for a moment. A gap of 1 (yesterday) needs no
// bridging — that's just "still alive, not completed yet today". A gap of 2
// means exactly one full cycle was skipped entirely; anything wider than
// that is more than a freeze is meant to cover (this is a safety net for
// one bad day, not a way to bank vacations).
//
// Deliberately does NOT increment currentStreak — a freeze preserves the
// count you already had, it doesn't credit you for a day you didn't
// actually do anything on. The bridged day becomes the new
// lastCompletedCycleKey purely so the NEXT real completion sees a gap of 1
// (continuing) instead of 2 (broken).
export function reconcileStreakWithFreeze(state: StreakState, currentCycleKey: string): StreakState {
  if (state.freezesAvailable <= 0 || !state.lastCompletedCycleKey) return state;
  const gap = daysBetween(state.lastCompletedCycleKey, currentCycleKey);
  if (gap !== 2) return state;

  const from = parseCycleKey(state.lastCompletedCycleKey);
  if (!from) return state;
  const bridged = new Date(from);
  bridged.setDate(bridged.getDate() + 1);
  const bridgedKey = `${bridged.getFullYear()}-${String(bridged.getMonth() + 1).padStart(2, '0')}-${String(bridged.getDate()).padStart(2, '0')}`;

  return {
    ...state,
    lastCompletedCycleKey: bridgedKey,
    freezesAvailable: state.freezesAvailable - 1,
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
