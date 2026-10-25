// Mindful-break settings: what they are, their defaults and bounds. The list of
// watched apps is deliberately NOT here: it is per device (Android package
// names, or iOS Screen Time tokens that only make sense on that phone) and
// stays in native storage. Storage lives in settingsStore.ts so this file stays
// free of Firebase and unit-testable.

import { asPatternId, DEFAULT_PATTERN } from './timeline';
import type { PatternId } from './timeline';

export const DEFAULT_INTERVAL_MIN = 30;
export const MIN_INTERVAL_MIN = 5;
export const MAX_INTERVAL_MIN = 180;
export const INTERVAL_CHOICES = [10, 15, 20, 30, 45, 60] as const;
export const STRICT_CHOICES = [15, 30, 60] as const;
export const DAILY_CAP_CHOICES = [0, 3, 5, 8] as const; // 0 = no limit

export type Schedule = {
  enabled: boolean;
  // 0 = Sunday ... 6 = Saturday (the same as JavaScript's Date#getDay).
  days: number[];
  // Minutes after midnight. endMin < startMin means the window runs overnight.
  startMin: number;
  endMin: number;
};

export type BreakSettings = {
  enabled: boolean;
  // Minutes of active use in watched apps between breaks.
  intervalMin: number;
  // Count and interrupt time spent inside UpShift itself.
  includeUpShift: boolean;
  // What a break pauses while it is on screen.
  pauseWorkout: boolean;
  pauseAudio: boolean;
  pauseQuestClock: boolean;
  // The breathing rhythm (every one is 15 seconds).
  pattern: PatternId;
  // Ask "what are you opening this for?" after the breathing.
  intention: boolean;
  // Soft ambient sound during the break. Off = haptics only.
  sound: boolean;
  // Only run breaks inside these days and hours.
  schedule: Schedule;
  // Most breaks per day (0 = no limit).
  dailyCap: number;
  // Shorten the gap late at night or when you keep switching apps.
  adaptive: boolean;
  // Runtime values (epoch ms, 0 = not active). Kept with the settings so they
  // survive a restart and are visible to the background service.
  pausedUntil: number;
  strictUntil: number;
};

export const DEFAULT_SCHEDULE: Schedule = { enabled: false, days: [1, 2, 3, 4, 5], startMin: 9 * 60, endMin: 17 * 60 };

export const DEFAULT_BREAK_SETTINGS: BreakSettings = {
  enabled: false,
  intervalMin: DEFAULT_INTERVAL_MIN,
  includeUpShift: true,
  pauseWorkout: true,
  pauseAudio: true,
  pauseQuestClock: true,
  pattern: DEFAULT_PATTERN,
  intention: true,
  sound: true,
  schedule: DEFAULT_SCHEDULE,
  dailyCap: 0,
  adaptive: false,
  pausedUntil: 0,
  strictUntil: 0,
};

export function normalizeInterval(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, n));
}

const minuteOfDay = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 1440 ? n : fallback;
};

export function normalizeSchedule(raw: Partial<Schedule> | undefined | null): Schedule {
  const d = DEFAULT_SCHEDULE;
  const days = Array.isArray(raw?.days)
    ? [...new Set(raw!.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : d.days;
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : d.enabled,
    days,
    startMin: minuteOfDay(raw?.startMin, d.startMin),
    endMin: minuteOfDay(raw?.endMin, d.endMin),
  };
}

export function normalizeCap(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(50, n);
}

// A stored "until" that has already passed is the same as none.
const until = (v: unknown, now: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > now ? Math.round(n) : 0;
};

export function normalizeSettings(raw: Partial<BreakSettings> | undefined | null, now: number = Date.now()): BreakSettings {
  const d = DEFAULT_BREAK_SETTINGS;
  const b = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    enabled: b(raw?.enabled, d.enabled),
    intervalMin: normalizeInterval(raw?.intervalMin),
    includeUpShift: b(raw?.includeUpShift, d.includeUpShift),
    pauseWorkout: b(raw?.pauseWorkout, d.pauseWorkout),
    pauseAudio: b(raw?.pauseAudio, d.pauseAudio),
    pauseQuestClock: b(raw?.pauseQuestClock, d.pauseQuestClock),
    pattern: asPatternId(raw?.pattern),
    intention: b(raw?.intention, d.intention),
    sound: b(raw?.sound, d.sound),
    schedule: normalizeSchedule(raw?.schedule),
    dailyCap: normalizeCap(raw?.dailyCap),
    adaptive: b(raw?.adaptive, d.adaptive),
    pausedUntil: until(raw?.pausedUntil, now),
    strictUntil: until(raw?.strictUntil, now),
  };
}
