// Health data import — Platform.OS dispatcher over services/appleHealth.ts
// (iOS HealthKit) and services/healthConnect.ts (Android Health Connect).
// Two files rather than one because the underlying APIs (identifiers, query
// shapes, permission models) share almost nothing between platforms — this
// file is the one place that hides that split, so every caller (Settings,
// Dashboard) imports from here and never has its own Platform.OS branch.
//
// IMPORTANT — cannot be exercised in Expo Go or the web preview: both
// underlying libraries are native modules requiring a custom dev client /
// EAS build. Every function below still fails soft (false/null/[]/0) rather
// than throwing when the native module isn't present, so importing this
// file is always safe (e.g. from Expo web), but the actual health data path
// has not been runtime-tested — see the final report.

import { Platform } from 'react-native';
import * as AppleHealth from './appleHealth';
import * as HealthConnect from './healthConnect';

const impl = Platform.OS === 'ios' ? AppleHealth : HealthConnect;

export type HealthWorkout = { type: string; durationMin: number; calories?: number; date: string };
export type HealthSleepNight = { hours: number; date: string };
export type HealthWeightEntry = { value: number; date: string };

/** Whether the underlying health API exists on this device at all — false
 * on web, on Android without the Health Connect app installed, and (for
 * some data) on the iOS Simulator. Does NOT imply permission was granted. */
export const isHealthAvailable: () => Promise<boolean> = impl.isHealthAvailable;

/** Requests read access to steps, workouts, weight, sleep, and heart rate.
 * Resolves false on denial, on an unsupported platform, or if the native
 * module isn't present — never throws. */
export const requestHealthPermission: () => Promise<boolean> = impl.requestHealthPermission;

/** Today's step count so far, deduplicated across sources where the
 * platform API supports that. 0 on any failure or if nothing has synced. */
export const fetchTodaySteps: () => Promise<number> = impl.fetchTodaySteps;

/** The single most recent logged body-weight sample, in pounds, with the
 * local calendar date it was recorded on — or null if there isn't one (or
 * the read failed). Doesn't imply the date is today; callers compare
 * against today's date themselves before treating it as "today's weight." */
export const fetchRecentWeight: () => Promise<HealthWeightEntry | null> = impl.fetchRecentWeight;

/** Most recent logged height, in total inches (e.g. 70 = 5'10") — or null.
 * Used only by Onboarding's health-sync prefill; every other screen in the
 * app stores height as heightFeet/heightInches rather than a single number,
 * so callers convert with Math.floor(inches/12)/inches%12 themselves. */
export const fetchHeight: () => Promise<number | null> = impl.fetchHeight;

/** Workouts/exercise sessions logged in the last `days` days, newest first. */
export const fetchRecentWorkouts: (days: number) => Promise<HealthWorkout[]> = impl.fetchRecentWorkouts;

/** Hours slept per calendar day over the last `days` days, oldest first.
 * Only dates with an actual sleep sample are included — no zero-filling. */
export const fetchRecentSleep: (days: number) => Promise<HealthSleepNight[]> = impl.fetchRecentSleep;

/** Bonus, per the task brief — most recent heart rate reading in bpm, or
 * null. Not currently wired into any screen. */
export const fetchLatestHeartRate: () => Promise<number | null> = impl.fetchLatestHeartRate;
