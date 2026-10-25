// One interface over the two very different platform implementations of
// mindful breaks, so screens never touch a native module directly.
//
//  Android: our own module (modules/upshift-breaks). A foreground service reads
//           Usage Access to see which app is in front, and brings UpShift to
//           the front after N minutes of use. The user picks apps by name.
//  iOS:     Apple's Screen Time APIs through react-native-device-activity. The
//           user picks apps in Apple's own picker (apps are never named to us),
//           Apple counts the usage, and the apps are shielded when N minutes
//           are up. Needs Apple's Family Controls entitlement and a dev build.
//
// Both are optional at runtime: in Expo Go, on web, or in a build made before
// the module existed, `capability()` reports 'none' and the rest is a no-op,
// so in-app breaks still work.

import { Platform } from 'react-native';
import AndroidNative, { InstalledApp, PendingBreak } from '../../modules/upshift-breaks';

export type { InstalledApp, PendingBreak };

export type BreakCapability = 'android' | 'ios' | 'none';

// ---- iOS library (loaded lazily so Android and web never touch it) ----
type DeviceActivity = typeof import('react-native-device-activity');
let ios: DeviceActivity | null = null;
if (Platform.OS === 'ios') {
  try { ios = require('react-native-device-activity'); } catch { ios = null; }
}

export const IOS_SELECTION_ID = 'upshift-mindful-breaks';
const IOS_ACTIVITY = 'upshift-mindful-breaks-activity';
const IOS_EVENT = 'break-threshold';
const BREAK_URL = 'upshift://break';

export function capability(): BreakCapability {
  if (Platform.OS === 'android' && AndroidNative) return 'android';
  if (Platform.OS === 'ios' && ios) return 'ios';
  return 'none';
}

// ---- Permissions ----
export type Permissions = {
  capability: BreakCapability;
  // Android
  usageAccess: boolean;
  overlay: boolean;
  // iOS: Screen Time authorization
  screenTime: 'approved' | 'denied' | 'notDetermined' | 'unavailable';
  // Everything needed for a hard-stop break is granted.
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
export type NativeSettings = { enabled: boolean; intervalMin: number; androidPackages: string[] };

// Push the user's choices to the platform. Safe to call repeatedly.
export async function applySettings(s: NativeSettings): Promise<void> {
  const cap = capability();
  if (cap === 'android' && AndroidNative) {
    AndroidNative.setConfig(s.enabled, s.intervalMin, s.androidPackages);
    return;
  }
  if (cap === 'ios' && ios) {
    if (!s.enabled) { stopIos(); return; }
    await startIos(s.intervalMin);
  }
}

// ---- iOS ----
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
  try { ios?.stopMonitoring([IOS_ACTIVITY]); ios?.unblockSelection({ activitySelectionId: IOS_SELECTION_ID }); } catch { /* ignore */ }
}

async function startIos(intervalMin: number): Promise<void> {
  if (!ios) return;
  const token = ios.getFamilyActivitySelectionId(IOS_SELECTION_ID);
  if (!token) return; // no apps chosen yet
  try {
    ios.stopMonitoring([IOS_ACTIVITY]);
    // When N minutes of use are reached: shield the chosen apps and notify.
    ios.configureActions({
      activityName: IOS_ACTIVITY,
      callbackName: 'eventDidReachThreshold',
      eventName: IOS_EVENT,
      actions: [
        { type: 'blockSelection', familyActivitySelectionId: IOS_SELECTION_ID, shieldId: 'upshift-break' },
        { type: 'sendNotification', payload: shieldPayload() },
      ],
    });
    // What the user sees on the blocked app. iOS can't open another app from a
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
    await ios.startMonitoring(
      IOS_ACTIVITY,
      { intervalStart: { hour: 0, minute: 0 }, intervalEnd: { hour: 23, minute: 59 }, repeats: true },
      [{ eventName: IOS_EVENT, familyActivitySelection: token, threshold: { minute: intervalMin } }],
    );
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

// The exercise is done: lift the block and start a fresh interval.
export async function markBreakDone(intervalMin: number): Promise<void> {
  const cap = capability();
  try {
    if (cap === 'android') AndroidNative?.markBreakDone();
    if (cap === 'ios' && ios) {
      ios.unblockSelection({ activitySelectionId: IOS_SELECTION_ID });
      await startIos(intervalMin); // restart monitoring so the next N minutes count from now
    }
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
