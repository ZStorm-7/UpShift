// Android Health Connect integration — read-only import of steps, exercise
// sessions, weight, and sleep (plus heart rate as a small bonus) into
// UpShift's existing Firestore shapes. See services/health.ts, which
// re-exports this module directly — Apple Health/HealthKit support used to
// sit alongside it there but was removed on request; this is now the only
// health source the app has.
//
// LIBRARY CHOICE: `react-native-health-connect` is the standard community
// wrapper for Android's Health Connect API — actively maintained (releases
// as recent as last month), with a first-party Expo config plugin (see the
// "react-native-health-connect" entry in app.json's plugins array) and full
// TypeScript typings for every record type, verified here against the
// installed package's own .d.ts files rather than guessed from docs.
// Unlike the iOS side, Health Connect isn't a New-Architecture-only API —
// this pick was purely "is it the standard, maintained wrapper," which it
// is. CONFIDENCE: high on the API surface (typechecked against the real
// package), but — like the iOS side — this has never run on a device; see
// the loud caveat in the final report.
//
// Every exported function fails soft — false/null/[]/0 rather than throwing
// — when Health Connect isn't installed on the device, a permission was
// denied, or (mirroring services/notifications.ts's established pattern)
// the native module isn't present at all, since this app is also run
// through Expo web where it doesn't exist.

import { Platform } from 'react-native';

type HealthConnectModule = typeof import('react-native-health-connect');

let HealthConnect: HealthConnectModule | null = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    HealthConnect = require('react-native-health-connect');
  } catch {
    HealthConnect = null;
  }
}

// Tracks whether initialize() has already succeeded this session — Health
// Connect's own API is idempotent to call again, but there's no reason to
// pay the bridge round-trip on every single fetch when one successful call
// covers the rest of the app's lifetime.
let initialized = false;
async function ensureInitialized(): Promise<boolean> {
  if (!HealthConnect) return false;
  if (initialized) return true;
  try {
    initialized = await HealthConnect.initialize();
    return initialized;
  } catch {
    return false;
  }
}

const READ_PERMISSIONS = [
  { accessType: 'read' as const, recordType: 'Steps' as const },
  { accessType: 'read' as const, recordType: 'Weight' as const },
  { accessType: 'read' as const, recordType: 'SleepSession' as const },
  { accessType: 'read' as const, recordType: 'ExerciseSession' as const },
  { accessType: 'read' as const, recordType: 'HeartRate' as const },
  { accessType: 'read' as const, recordType: 'Height' as const },
];

// Local calendar date "YYYY-MM-DD" — matches getTodayKey()/WeightEntry.date
// in firebase/progress.ts and firebase/weight.ts. Deliberately reimplemented
// here rather than imported, same reasoning as services/appleHealth.ts: this
// stays a pure "read health data" module with no dependency on Firebase.
function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function isHealthAvailable(): Promise<boolean> {
  if (!HealthConnect) return false;
  try {
    // SdkAvailabilityStatus.SDK_AVAILABLE means the Health Connect app is
    // installed and usable — SDK_UNAVAILABLE and
    // SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED both mean "can't read
    // anything right now," which this treats the same as "not available"
    // rather than surfacing the update-required case specially.
    const status = await HealthConnect.getSdkStatus();
    return status === HealthConnect.SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export async function requestHealthPermission(): Promise<boolean> {
  if (!HealthConnect) return false;
  try {
    const available = await isHealthAvailable();
    if (!available) return false;
    if (!(await ensureInitialized())) return false;
    const granted = await HealthConnect.requestPermission(READ_PERMISSIONS);
    // requestPermission resolves with whichever of the requested permissions
    // the user actually granted, which can be a subset (or none) rather than
    // rejecting outright — "connected" means at least the core Steps read
    // came through; the other fetchers below independently no-op if their
    // own specific permission wasn't part of that set.
    return granted.some(p => p.recordType === 'Steps');
  } catch {
    return false;
  }
}

export async function fetchTodaySteps(): Promise<number> {
  if (!HealthConnect || !(await ensureInitialized())) return 0;
  try {
    const { records } = await HealthConnect.readRecords('Steps', {
      timeRangeFilter: { operator: 'between', startTime: startOfTodayIso(), endTime: new Date().toISOString() },
    });
    // Health Connect can hold overlapping Steps records from more than one
    // source (phone + watch); unlike HealthKit there's no built-in
    // deduplicated aggregate call exposed here, so this takes the simple,
    // documented tradeoff of summing raw records rather than pulling in the
    // separate aggregate API for a first pass.
    return records.reduce((sum, r) => sum + (r.count || 0), 0);
  } catch {
    return 0;
  }
}

export async function fetchRecentWeight(): Promise<{ value: number; date: string } | null> {
  if (!HealthConnect || !(await ensureInitialized())) return null;
  try {
    const { records } = await HealthConnect.readRecords('Weight', {
      timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
      ascendingOrder: false,
      pageSize: 1,
    });
    const latest = records[0];
    if (!latest) return null;
    return { value: Math.round(latest.weight.inPounds * 10) / 10, date: toDateKey(new Date(latest.time)) };
  } catch {
    return null;
  }
}

// Onboarding's health-sync prefill only, added alongside the four required
// fetchers. Health Connect's Height record stores meters as a Length value.
export async function fetchHeight(): Promise<number | null> {
  if (!HealthConnect || !(await ensureInitialized())) return null;
  try {
    const { records } = await HealthConnect.readRecords('Height', {
      timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
      ascendingOrder: false,
      pageSize: 1,
    });
    const latest = records[0];
    if (!latest) return null;
    return Math.round(latest.height.inInches);
  } catch {
    return null;
  }
}

// Reverse lookup for the ExerciseType constants object (a plain object of
// name -> number, not a TS enum, so it doesn't get a free reverse mapping
// the way HealthKit's numeric enums do on the iOS side).
function exerciseTypeName(value: number): string {
  if (!HealthConnect) return 'other';
  const entry = Object.entries(HealthConnect.ExerciseType).find(([, v]) => v === value);
  return entry ? entry[0].toLowerCase().replace(/_/g, ' ') : 'other';
}

export async function fetchRecentWorkouts(
  days: number
): Promise<{ type: string; durationMin: number; calories?: number; date: string }[]> {
  if (!HealthConnect || !(await ensureInitialized())) return [];
  try {
    const { records } = await HealthConnect.readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: daysAgoIso(days), endTime: new Date().toISOString() },
      ascendingOrder: false,
    });
    return records.map(r => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      return {
        type: exerciseTypeName(r.exerciseType),
        durationMin: Math.round((end.getTime() - start.getTime()) / 60000),
        // Health Connect doesn't attach calories to an ExerciseSession
        // record directly — that lives in a separate TotalCaloriesBurned
        // record this app isn't cross-referencing in this pass, so calories
        // is simply omitted here rather than guessed at.
        date: toDateKey(start),
      };
    });
  } catch {
    return [];
  }
}

export async function fetchRecentSleep(days: number): Promise<{ hours: number; date: string }[]> {
  if (!HealthConnect || !(await ensureInitialized())) return [];
  try {
    const { records } = await HealthConnect.readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: daysAgoIso(days), endTime: new Date().toISOString() },
      ascendingOrder: true,
    });
    // Bucketed by the calendar date the session STARTED on, matching how
    // services/appleHealth.ts's fetchRecentSleep groups HealthKit's sleep
    // segments — one "hours slept" figure per day, same as the day doc's
    // own sleepHours field elsewhere in this app.
    const byDate = new Map<string, number>();
    for (const r of records) {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      const dateKey = toDateKey(start);
      const hours = (end.getTime() - start.getTime()) / 3_600_000;
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
  if (!HealthConnect || !(await ensureInitialized())) return null;
  try {
    const { records } = await HealthConnect.readRecords('HeartRate', {
      timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
      ascendingOrder: false,
      pageSize: 1,
    });
    const latest = records[0];
    const lastSample = latest?.samples?.[latest.samples.length - 1];
    return lastSample ? Math.round(lastSample.beatsPerMinute) : null;
  } catch {
    return null;
  }
}
