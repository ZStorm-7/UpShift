// One interface over the two very different platform implementations of
// mindful breaks, so screens never touch a native module directly.
//
//  Android: our own module (modules/upshift-breaks). A foreground service reads
//           Usage Access to see which app is in front and applies the whole
//           policy (schedule, daily cap, adaptive timing, strict mode, pause)
//           in services/breaks/policy.ts's Kotlin twin. The user picks apps by name.
//  iOS:     Apple's Screen Time APIs through react-native-device-activity. The
//           user picks apps in Apple's own picker (apps are never named to us),
//           Apple counts the usage, and the apps are shielded when N minutes are
//           up. Needs Apple's Family Controls entitlement and a dev build.
//           Supported on iOS: interval, schedule windows, strict mode, the
//           emergency pause. NOT supported: daily cap and adaptive timing (the
//           Screen Time extension runs without our code, so it can't count
//           breaks or watch app switching).
//
// Both are optional at runtime: in Expo Go, on web, or in a build made before
// the module existed, `capability()` reports 'none' and the rest is a no-op,
// so in-app breaks still work.

import { Platform } from 'react-native';
import AndroidNative, { InstalledApp, PendingBreak } from '../../modules/upshift-breaks';
import { toPolicy } from './policy';
import type { BreakSettings } from './settings';

export type { InstalledApp, PendingBreak };

export type BreakCapability = 'android' | 'ios' | 'none';

// ---- iOS library (loaded lazily so Android and web never touch it) ----
type DeviceActivity = typeof import('react-native-device-activity');
let ios: DeviceActivity | null = null;
if (Platform.OS === 'ios') {
  try { ios = require('react-native-device-activity'); } catch { ios = null; }
}

export const IOS_SELECTION_ID = 'upshift-mindful-breaks';
const IOS_ACTIVITY = 'upshift-mb';
const IOS_EVENT = 'break-threshold';
const BREAK_URL = 'upshift://break';

export function capability(): BreakCapability {
  if (Platform.OS === 'android' && AndroidNative) return 'android';
  if (Platform.OS === 'ios' && ios) return 'ios';
  return 'none';
}

/** What the current platform can enforce, so settings can say so honestly. */
export function supports(feature: 'dailyCap' | 'adaptive' | 'schedule' | 'strict' | 'pause'): boolean {
  const cap = capability();
  if (cap === 'android') return true;
  if (cap === 'ios') return feature === 'schedule' || feature === 'strict' || feature === 'pause';
  return feature === 'dailyCap' || feature === 'pause'; // in-app breaks honor these
}

// ---- Permissions ----
export type Permissions = {
  capability: BreakCapability;
  usageAccess: boolean;
  overlay: boolean;
  screenTime: 'approved' | 'denied' | 'notDetermined' | 'unavailable';
  ready: boolean;
};

export function getPermissions(): Permissions {
  const cap = capability();
  if (cap === 'android' && AndroidNative) {
    const usageAccess = AndroidNative.hasUsageAccess();
    const overlay = AndroidNative.canDrawOverlays();
    return { capability: cap, usageAccess, overlay, screenTime: 'unavailable', ready: usageAccess && overlay };
  }
  if (cap === 'ios' && ios) {
    const status = ios.getAuthorizationStatus();
    const screenTime = status === ios.AuthorizationStatus.approved ? 'approved'
      : status === ios.AuthorizationStatus.denied ? 'denied' : 'notDetermined';
    return { capability: cap, usageAccess: false, overlay: false, screenTime, ready: screenTime === 'approved' };
  }
  return { capability: 'none', usageAccess: false, overlay: false, screenTime: 'unavailable', ready: false };
}

export async function requestScreenTimeAccess(): Promise<boolean> {
  if (!ios) return false;
  try {
    await ios.requestAuthorization('individual');
    return ios.getAuthorizationStatus() === ios.AuthorizationStatus.approved;
  } catch {
    return false;
  }
}

export const openUsageAccessSettings = () => AndroidNative?.openUsageAccessSettings();
export const openOverlaySettings = () => AndroidNative?.openOverlaySettings();
export const openBatterySettings = () => AndroidNative?.openBatterySettings();

// ---- Android: app list ----
export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (!AndroidNative) return [];
  try { return await AndroidNative.getInstalledApps(); } catch { return []; }
}

export function getAndroidWatchedPackages(): string[] {
  try { return AndroidNative?.getConfig().packages ?? []; } catch { return []; }
}

// ---- Applying the settings ----

// Push the user's choices to the platform. Safe to call repeatedly.
export async function applySettings(s: BreakSettings, androidPackages: string[], now: number = Date.now()): Promise<void> {
  const cap = capability();
  if (cap === 'android' && AndroidNative) {
    AndroidNative.setPolicy(JSON.stringify(toPolicy(s)), androidPackages);
    return;
  }
  if (cap === 'ios' && ios) await applyIos(s, now);
}

// ---- iOS ----
type IosWindow = { name: string; weekday?: number; startMin: number; endMin: number };

const hm = (m: number) => ({ hour: Math.floor(m / 60) % 24, minute: m % 60 });

// iOS wants each schedule as a start and end on ONE day, at least 15 minutes
// long. Overnight windows are therefore split at midnight into two.
export function iosWindows(s: BreakSettings): IosWindow[] {
  const sch = s.schedule;
  if (!sch.enabled) return [{ name: `${IOS_ACTIVITY}-all`, startMin: 0, endMin: 1439 }];
  const out: IosWindow[] = [];
  const add = (day: number, startMin: number, endMin: number) => {
    if (endMin - startMin >= 15) out.push({ name: `${IOS_ACTIVITY}-d${day}-${startMin}`, weekday: day + 1, startMin, endMin });
  };
  for (const d of sch.days) {
    if (sch.startMin === sch.endMin) add(d, 0, 1439);
    else if (sch.startMin < sch.endMin) add(d, sch.startMin, sch.endMin);
    else { add(d, sch.startMin, 1439); add((d + 1) % 7, 0, sch.endMin); }
  }
  return out;
}

function shieldPayload() {
  return {
    title: 'Time for a 15-second breathing break',
    body: 'Tap to start. Your apps unlock when you finish.',
    sound: 'default' as const,
    interruptionLevel: 'active' as const,
    userInfo: { url: BREAK_URL },
  };
}

function stopIos() {
  try {
    ios?.stopMonitoring();
    ios?.unblockSelection({ activitySelectionId: IOS_SELECTION_ID });
  } catch { /* ignore */ }
}

async function applyIos(s: BreakSettings, now: number): Promise<void> {
  if (!ios) return;
  stopIos();
  if (!s.enabled) return;
  const token = ios.getFamilyActivitySelectionId(IOS_SELECTION_ID);
  if (!token) return; // no apps chosen yet

  try {
    // What the user sees on a blocked app. iOS can't open another app from a
    // shield, so the button sends the notification that opens UpShift.
    ios.updateShield(
      {
        title: 'Take a breath',
        subtitle: 'Finish a 15-second breathing break in UpShift to continue.',
        primaryButtonLabel: 'Open UpShift',
        iconSystemName: 'lungs.fill',
        backgroundColor: { red: 10, green: 10, blue: 10, alpha: 1 },
        titleColor: { red: 255, green: 255, blue: 255, alpha: 1 },
        subtitleColor: { red: 200, green: 200, blue: 200, alpha: 1 },
        primaryButtonBackgroundColor: { red: 0, green: 200, blue: 5, alpha: 1 },
        primaryButtonLabelColor: { red: 0, green: 0, blue: 0, alpha: 1 },
      },
      { primary: { behavior: 'close', actions: [{ type: 'sendNotification', payload: shieldPayload() }] } },
    );

    const paused = s.pausedUntil > now;

    // Strict mode: block right now, and lift the block when the time is up.
    if (s.strictUntil > now && !paused) {
      ios.blockSelection({ activitySelectionId: IOS_SELECTION_ID });
      const end = new Date(s.strictUntil);
      const start = new Date(now);
      const name = `${IOS_ACTIVITY}-strict`;
      ios.configureActions({
        activityName: name, callbackName: 'intervalDidEnd',
        actions: [{ type: 'unblockSelection', familyActivitySelectionId: IOS_SELECTION_ID }],
      });
      await ios.startMonitoring(name, {
        intervalStart: { hour: start.getHours(), minute: start.getMinutes() },
        intervalEnd: { hour: end.getHours(), minute: end.getMinutes() },
        repeats: false,
      }, []);
      return;
    }

    // The emergency pause: nothing is monitored until it is over, then monitoring resumes.
    const resumeFrom = paused ? new Date(s.pausedUntil) : null;

    for (const w of iosWindows(s)) {
      ios.configureActions({
        activityName: w.name,
        callbackName: 'eventDidReachThreshold',
        eventName: IOS_EVENT,
        actions: [
          { type: 'blockSelection', familyActivitySelectionId: IOS_SELECTION_ID, shieldId: 'upshift-break' },
          { type: 'sendNotification', payload: shieldPayload() },
        ],
      });
      const startMin = resumeFrom ? Math.max(w.startMin, resumeFrom.getHours() * 60 + resumeFrom.getMinutes()) : w.startMin;
      if (w.endMin - startMin < 15) continue;
      await ios.startMonitoring(
        w.name,
        {
          intervalStart: { ...(w.weekday ? { weekday: w.weekday } : {}), ...hm(startMin) },
          intervalEnd: { ...(w.weekday ? { weekday: w.weekday } : {}), ...hm(w.endMin) },
          repeats: !resumeFrom,
        },
        [{ eventName: IOS_EVENT, familyActivitySelection: token, threshold: { minute: s.intervalMin } }],
      );
    }
  } catch {
    /* Screen Time can throw if the entitlement or authorization is missing */
  }
}

export function iosHasSelection(): boolean {
  try { return !!ios?.getFamilyActivitySelectionId(IOS_SELECTION_ID); } catch { return false; }
}

// ---- Break lifecycle ----

// A break launched from another app that hasn't been finished.
export function getPendingBreak(): PendingBreak | null {
  const cap = capability();
  try {
    if (cap === 'android') return AndroidNative?.getPendingBreak() ?? null;
    if (cap === 'ios' && ios?.isShieldActive()) return { pkg: '', label: '' };
  } catch { /* ignore */ }
  return null;
}

// Breaks finished today according to the background service (the daily cap uses this one).
export function getNativeCompletedToday(): number {
  try { return AndroidNative?.getConfig().completedToday ?? 0; } catch { return 0; }
}

// The exercise is done: lift the block and start a fresh interval.
export async function markBreakDone(settings: BreakSettings): Promise<void> {
  const cap = capability();
  try {
    if (cap === 'android') AndroidNative?.markBreakDone();
    if (cap === 'ios' && ios) {
      ios.unblockSelection({ activitySelectionId: IOS_SELECTION_ID });
      await applyIos(settings, Date.now()); // restart monitoring so the next N minutes count from now
    }
  } catch { /* ignore */ }
}

// An emergency pass cut the break short: lift it, but do NOT count it as finished.
export async function abandonBreak(settings: BreakSettings): Promise<void> {
  const cap = capability();
  try {
    if (cap === 'android') AndroidNative?.abandonBreak();
    if (cap === 'ios' && ios) await applyIos(settings, Date.now());
  } catch { /* ignore */ }
}

// "Exit": return to the app the user was in. Resolves to what actually happened
// so the UI can say so honestly (iOS can't switch apps programmatically).
export async function exitToPreviousApp(pkg?: string): Promise<'returned' | 'backgrounded' | 'unsupported'> {
  if (capability() === 'android' && AndroidNative) {
    try {
      if (pkg && AndroidNative.returnToApp(pkg)) return 'returned';
      await AndroidNative.moveToBack();
      return 'backgrounded';
    } catch { return 'unsupported'; }
  }
  return 'unsupported';
}

// Open UpShift's own break UI from a notification tap (iOS) or deep link.
export const BREAK_DEEP_LINK = BREAK_URL;

// The iOS Apple-provided app picker, loaded on demand.
export function getIosPickerComponent(): any | null {
  try { return ios?.DeviceActivitySelectionSheetViewPersisted ?? null; } catch { return null; }
}
