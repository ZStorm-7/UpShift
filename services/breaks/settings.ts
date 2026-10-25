// Mindful-break settings: what they are, their defaults and bounds, and how
// they are stored. The list of watched apps is deliberately NOT here: it is
// per device (Android package names, or iOS Screen Time tokens that only make
// sense on that phone) and stays in native storage. Storage lives in
// settingsStore.ts so this file stays free of Firebase and unit-testable.

export const DEFAULT_INTERVAL_MIN = 30;
export const MIN_INTERVAL_MIN = 5;
export const MAX_INTERVAL_MIN = 180;
export const INTERVAL_CHOICES = [10, 15, 20, 30, 45, 60] as const;

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
};

export const DEFAULT_BREAK_SETTINGS: BreakSettings = {
  enabled: false,
  intervalMin: DEFAULT_INTERVAL_MIN,
  includeUpShift: true,
  pauseWorkout: true,
  pauseAudio: true,
  pauseQuestClock: true,
};

export function normalizeInterval(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_INTERVAL_MIN;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, n));
}

export function normalizeSettings(raw: Partial<BreakSettings> | undefined | null): BreakSettings {
  const d = DEFAULT_BREAK_SETTINGS;
  const b = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    enabled: b(raw?.enabled, d.enabled),
    intervalMin: normalizeInterval(raw?.intervalMin),
    includeUpShift: b(raw?.includeUpShift, d.includeUpShift),
    pauseWorkout: b(raw?.pauseWorkout, d.pauseWorkout),
    pauseAudio: b(raw?.pauseAudio, d.pauseAudio),
    pauseQuestClock: b(raw?.pauseQuestClock, d.pauseQuestClock),
  };
}
