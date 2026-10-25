// Rewards and streaks for mindful breaks, as pure functions.
//
// XP is deliberately small and capped: 10 XP for each of the first three breaks
// of a day (30 XP max). Without a cap a short interval would turn the feature
// into an XP farm, and a reward for taking breaks must never push someone to
// take more screen time to earn them. Breaks cut short by an emergency pass
// earn nothing.
//
// Avatar frames unlock by the LONGEST streak of days with at least one break,
// so a missed day doesn't take away a frame you earned.

import { dayKey } from './stats';

export const BREAK_XP = 10;
export const BREAK_XP_MAX_PER_DAY = 3; // rewarded breaks per day

// XP for finishing a break when `doneBefore` breaks were already finished today.
export function breakXp(doneBefore: number): number {
  const n = Math.max(0, Math.floor(Number(doneBefore)) || 0);
  return n < BREAK_XP_MAX_PER_DAY ? BREAK_XP : 0;
}

export const DAILY_BREAK_XP_CAP = BREAK_XP * BREAK_XP_MAX_PER_DAY;

// ---- streak of days with at least one finished break ----
export type BreakStreakState = { current: number; longest: number; lastDay: string };
export const EMPTY_BREAK_STREAK: BreakStreakState = { current: 0, longest: 0, lastDay: '' };

export function cleanStreak(raw: any): BreakStreakState {
  const n = (v: unknown) => Math.max(0, Math.min(100_000, Math.floor(Number(v)) || 0));
  return {
    current: n(raw?.current), longest: Math.max(n(raw?.longest), n(raw?.current)),
    lastDay: typeof raw?.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDay) ? raw.lastDay : '',
  };
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

// Call when a break is finished.
export function advanceBreakStreak(s: BreakStreakState, today: string): BreakStreakState {
  if (s.lastDay === today) return s;
  const current = s.lastDay === addDays(today, -1) ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDay: today };
}

// The streak to DISPLAY: a missed day ends it, but only once a full day has passed.
export function liveBreakStreak(s: BreakStreakState, today: string): number {
  return s.lastDay === today || s.lastDay === addDays(today, -1) ? s.current : 0;
}

// ---- avatar frames ----
export type FrameId = 'dawn' | 'aurora' | 'zen';
export const FRAMES: { id: FrameId; days: number; color: string; nameKey: string }[] = [
  { id: 'dawn', days: 3, color: '#2DD4BF', nameKey: 'frameDawn' },
  { id: 'aurora', days: 7, color: '#00C805', nameKey: 'frameAurora' },
  { id: 'zen', days: 30, color: '#F5C84B', nameKey: 'frameZen' },
];

export const unlockedFrames = (longest: number) => FRAMES.filter(f => longest >= f.days);

// The best frame earned so far (shown on the avatar), or null.
export function bestFrame(longest: number) {
  const got = unlockedFrames(longest);
  return got.length ? got[got.length - 1] : null;
}

// The next frame to work toward, with how many more days it takes.
export function nextFrame(longest: number): { id: FrameId; nameKey: string; daysLeft: number } | null {
  const f = FRAMES.find(x => longest < x.days);
  return f ? { id: f.id, nameKey: f.nameKey, daysLeft: f.days - longest } : null;
}
