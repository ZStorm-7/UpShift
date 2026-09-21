// Apple HealthKit integration (iOS only) — read-only import of steps,
// workouts, weight, and sleep (plus heart rate as a small bonus) into
// UpShift's existing Firestore shapes. See services/health.ts for the
// Platform.OS dispatcher that exposes this alongside services/healthConnect
// (Android) under one identical interface, and context/UserContext.tsx /
// firebase/progress.ts / firebase/weight.ts for the data shapes this feeds.
//
// LIBRARY CHOICE, for the record:
//   - `expo-health` was checked first per the task brief. It does not exist
//     as a real library — the name is squatted on npm with nothing but an
//     empty 0.0.0 placeholder version, so there's nothing to import.
//   - `react-native-health`, the older community wrapper, hasn't published a
//     release since October 2024. It predates Expo SDK 57 and predates React
//     Native's New Architecture entirely, so it's a dead end for this app.
//   - `@kingstinct/react-native-healthkit` is the actively-maintained
//     alternative — its changelog shows releases through this month — with a
//     first-party Expo config plugin (see the "@kingstinct/react-native-healthkit"
//     entry in app.json's plugins array) and full TypeScript typings for
//     100+ quantity/category identifiers, which is how every identifier
//     string and function signature below was verified (against the
//     installed package's own .d.ts files, not guessed from docs).
//     It's built on Nitro Modules (react-native-nitro-modules), which
//     requires the New Architecture — this app already ships
//     react-native-worklets + Reanimated 4, and Reanimated 4 dropped
//     old-architecture support outright, so New Architecture is already a
//     hard requirement here independent of this choice. CONFIDENCE: high on
//     the API surface (typechecked against the real package), but this has
//     never run on a device or simulator — see the loud caveat in the final
//     report. Pinned to 14.1.0 (not the newer 15.x that shipped literally
//     the same week this was written) to avoid landing on a release with no
//     track record yet.
//
// Every exported function fails soft — false/null/[]/0 rather than throwing
// — on Android, web, a device/simulator without HealthKit, a denied
// permission, or a missing native module. This mirrors the exact
// lazy-require-in-try/catch pattern services/notifications.ts already uses
// for expo-notifications, for the same reason: this app is also run through
// Expo web, where native modules like this one don't exist at all, and a
// crash-on-import there would take down every screen that imports this file
// transitively, not just the health feature.

import { Platform } from 'react-native';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

let HealthKit: HealthKitModule | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    HealthKit = require('@kingstinct/react-native-healthkit');
  } catch {
    HealthKit = null;
  }
}

// The HealthKit identifiers this app ever asks to read. Kept in one place so
// requestHealthPermission and the individual fetchers can't drift apart —
// asking for less here than a fetcher below queries for would silently turn
// that fetcher into a permanent "denied" no-op.
const READ_QUANTITY_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeight',
] as const;
const READ_CATEGORY_TYPES = ['HKCategoryTypeIdentifierSleepAnalysis'] as const;

// "HKWorkoutTypeIdentifier" — a plain string constant the library exports,
// not a quantity/category type, but requestAuthorization's `toRead` list
// takes any ObjectTypeIdentifier and this is the one that unlocks
// queryWorkoutSamples.
function workoutTypeIdentifier(): string | null {
  return HealthKit ? (HealthKit as any).WorkoutTypeIdentifier : null;
}

// Local calendar date "YYYY-MM-DD" — matches getTodayKey()/WeightEntry.date
// in firebase/progress.ts and firebase/weight.ts, deliberately reimplemented
// here (rather than imported) so this service has no dependency on the
// Firebase layer and stays a pure "read health data" module.
function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function isHealthAvailable(): Promise<boolean> {
  if (!HealthKit) return false;
  try {
    return await HealthKit.isHealthDataAvailableAsync();
  } catch {
    // Simulators and some devices without HealthKit throw here rather than
    // resolving false — either way, "not available" is the right answer.
    return false;
  }
}

export async function requestHealthPermission(): Promise<boolean> {
  if (!HealthKit) return false;
  try {
    const workoutType = workoutTypeIdentifier();
    const toRead = [
      ...READ_QUANTITY_TYPES,
      ...READ_CATEGORY_TYPES,
      ...(workoutType ? [workoutType] : []),
    ] as unknown as import('@kingstinct/react-native-healthkit').ObjectTypeIdentifier[];
    return await HealthKit.requestAuthorization({ toRead });
  } catch {
    return false;
  }
}

export async function fetchTodaySteps(): Promise<number> {
  if (!HealthKit) return 0;
  try {
    // queryStatisticsForQuantity's cumulativeSum option is what HealthKit
    // itself uses to de-duplicate overlapping sources (e.g. a phone AND a
    // watch both recording steps) — summing raw queryQuantitySamples results
    // instead would double-count anyone wearing an Apple Watch.
    const stats = await HealthKit.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      { filter: { date: { startDate: startOfToday(), endDate: new Date() } }, unit: 'count' }
    );
    return Math.round(stats.sumQuantity?.quantity ?? 0);
  } catch {
    return 0;
  }
}

export async function fetchRecentWeight(): Promise<{ value: number; date: string } | null> {
  if (!HealthKit) return null;
  try {
    const sample = await HealthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'lb');
    if (!sample) return null;
    return { value: Math.round(sample.quantity * 10) / 10, date: toDateKey(sample.startDate) };
  } catch {
    return null;
  }
}

// Onboarding's health-sync prefill only, added alongside the four required
// fetchers — height doesn't change often, so "most recent sample" is a fine
// answer even if it was logged well in the past.
export async function fetchHeight(): Promise<number | null> {
  if (!HealthKit) return null;
  try {
    const sample = await HealthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierHeight', 'in');
    return sample ? Math.round(sample.quantity) : null;
  } catch {
    return null;
  }
}

// HealthKit reports a workout's duration as a Quantity (a value + a unit
// string), not a bare number of minutes — this normalizes whichever unit
// HealthKit handed back rather than assuming seconds.
function durationQuantityToMinutes(q: { unit: string; quantity: number } | undefined): number {
  if (!q) return 0;
  if (q.unit === 'min') return Math.round(q.quantity);
  if (q.unit === 'hr') return Math.round(q.quantity * 60);
  return Math.round(q.quantity / 60); // HealthKit's default duration unit is seconds ('s')
}

export async function fetchRecentWorkouts(
  days: number
): Promise<{ type: string; durationMin: number; calories?: number; date: string }[]> {
  if (!HealthKit) return [];
  try {
    const workouts = await HealthKit.queryWorkoutSamples({
      filter: { date: { startDate: daysAgo(days), endDate: new Date() } },
      limit: 0,
      ascending: false,
    });
    return workouts.map(w => ({
      // WorkoutActivityType is a numeric TS enum, which TypeScript compiles
      // with a reverse mapping baked in — `Enum[42]` gives back the name
      // ("running") the same way `Enum.running` gives back 42.
      type: (HealthKit as any).WorkoutActivityType[w.workoutActivityType] ?? 'other',
      durationMin: durationQuantityToMinutes(w.duration),
      calories: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned.quantity) : undefined,
      date: toDateKey(w.startDate),
    }));
  } catch {
    return [];
  }
}

// HealthKit's asleep-related category values — everything except "inBed"
// (in bed, not necessarily asleep) and "awake" counts as actual sleep time.
// asleepUnspecified and asleep share the same numeric value (1) in the SDK
// (the latter superseded the former without changing the raw value), so
// checking against the numeric set below covers both without listing one
// name twice.
const ASLEEP_VALUES = new Set<number>([1, 3, 4, 5]); // asleep(Unspecified)/Core/Deep/REM — see CategoryValueSleepAnalysis

export async function fetchRecentSleep(days: number): Promise<{ hours: number; date: string }[]> {
  if (!HealthKit) return [];
  try {
    const samples = await HealthKit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: daysAgo(days), endDate: new Date() } },
      limit: 0,
      ascending: true,
    });
    // Bucketed by the calendar date the sleep segment STARTED on, then
    // summed — a single night can be recorded as several segments (falling
    // asleep, a brief wake, falling back asleep), and this app wants one
    // "hours slept" number per day, matching how sleepHours already works
    // elsewhere (SleepScreen, the day doc's own sleepHours field).
    const byDate = new Map<string, number>();
    for (const sample of samples) {
      if (!ASLEEP_VALUES.has(sample.value as unknown as number)) continue;
      const dateKey = toDateKey(sample.startDate);
      const hours = (sample.endDate.getTime() - sample.startDate.getTime()) / 3_600_000;
      byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + hours);
    }
    return Array.from(byDate.entries())
      .map(([date, hours]) => ({ date, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// Bonus, per the task brief ("heart rate too, if trivially available") — not
// part of the four required fetchers, and not currently wired into any
// screen. Exposed in case a future pass wants it; see the final report.
export async function fetchLatestHeartRate(): Promise<number | null> {
  if (!HealthKit) return null;
  try {
    const sample = await HealthKit.getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRate', 'count/min' as any);
    return sample ? Math.round(sample.quantity) : null;
  } catch {
    return null;
  }
}
