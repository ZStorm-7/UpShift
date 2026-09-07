// Haptics — the physical half of feedback.
//
// The design pairs every reward moment with a vibration. This module is the
// single place that decides how strong each one is, so "level up feels like
// the biggest thing that happens" is a fact about one file rather than an
// accident of which screen called which API.
//
// Three deliberate constraints:
//
// 1. Everything is wrapped and swallowed. A haptic is decoration. If
//    expo-haptics isn't installed yet, or the device has no motor, or the OS
//    refuses the call, the app must carry on — a failed vibration must never
//    be able to stop a quest from being marked complete.
//
// 2. The import is lazy and guarded. `expo-haptics` is resolved on first use
//    inside a try/catch rather than at module load, so the app still bundles
//    and runs before you've run `npx expo install expo-haptics`. Until then
//    every call here is a silent no-op.
//
// 3. Web gets nothing. There is no haptic engine in a browser, and
//    navigator.vibrate is ignored by every desktop browser and by iOS Safari.
//    Calling it would be noise, so on web these all return immediately.

import { Platform } from 'react-native';

type HapticsModule = {
  impactAsync: (style: unknown) => Promise<void>;
  notificationAsync: (type: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Heavy: unknown };
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
};

// `undefined` = not tried yet, `null` = tried and unavailable. The distinction
// matters: without it, a missing package means a require() attempt on every
// single quest tick.
let cached: HapticsModule | null | undefined;

function load(): HapticsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('expo-haptics') as HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True once expo-haptics has resolved. Useful for a Settings toggle that
 *  should hide itself on a device that can't vibrate anyway. */
export function hapticsAvailable(): boolean {
  return load() !== null;
}

// A user-facing switch lives in Settings. Most people leave haptics on, but
// the ones who turn them off feel strongly about it, and an app that keeps
// buzzing after you've said no is an app people delete.
let enabled = true;

export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

export function areHapticsEnabled(): boolean {
  return enabled;
}

function guard(fn: (h: HapticsModule) => Promise<void>) {
  if (!enabled) return;
  const h = load();
  if (!h) return;
  // Fire and forget. Awaiting a haptic would put a round-trip to the native
  // side in front of the state update that actually matters.
  fn(h).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

/**
 * Quest ticked off. The lightest thing the phone can do — this fires several
 * times a day and anything heavier becomes nagging.
 */
export function questTick() {
  guard(h => h.impactAsync(h.ImpactFeedbackStyle.Light));
}

/**
 * A set marked complete during a workout. Medium, because your hand is
 * usually nowhere near the phone and a light tap goes unnoticed on a bench.
 */
export function setComplete() {
  guard(h => h.impactAsync(h.ImpactFeedbackStyle.Medium));
}

/**
 * LEVEL UP. The big one.
 *
 * A success notification rather than an impact: on iOS that's a distinct
 * three-part pattern the OS reserves for "something good concluded", so it
 * genuinely feels different from every other buzz in the app rather than
 * just louder. Followed by a heavy impact ~180ms later, timed to land on the
 * ring burst in the level-up takeover, so the vibration and the visual are
 * clearly the same event.
 */
export function levelUp() {
  guard(async h => {
    await h.notificationAsync(h.NotificationFeedbackType.Success);
    setTimeout(() => {
      guard(hh => hh.impactAsync(hh.ImpactFeedbackStyle.Heavy));
    }, 180);
  });
}

/**
 * A daily goal met — calories, water, sleep. Success, but without the second
 * beat, so it reads as a smaller sibling of the level-up rather than a rival
 * to it.
 */
export function goalMet() {
  guard(h => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/** Something went wrong — a failed save, a rejected input. */
export function error() {
  guard(h => h.notificationAsync(h.NotificationFeedbackType.Error));
}

/** Moving through a picker or segmented control. The subtlest of the lot. */
export function selection() {
  guard(h => h.selectionAsync());
}

export default {
  questTick,
  setComplete,
  levelUp,
  goalMet,
  error,
  selection,
  setHapticsEnabled,
  areHapticsEnabled,
  hapticsAvailable,
};
