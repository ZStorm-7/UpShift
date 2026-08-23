import { Platform } from 'react-native';

// Mirrors services/sound.ts's pattern exactly: lazy-load the native module
// inside a try/catch so a missing/misconfigured native module degrades to
// "notifications silently don't fire" instead of crashing the app on boot —
// same reasoning as sound and haptics before it.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

// Local-only, no server. This is the tradeoff documented for the user: a
// notification scheduled this way can say "your quests reset soon" but
// can't check live Firestore state at the moment it actually fires — all it
// knows is whatever was true when it was scheduled, which is why
// scheduleStreakRiskReminder below is designed to be called again every time
// that state might have changed (quest completed, app opened) rather than
// scheduled once and forgotten.
let configured = false;
function configureHandler() {
  if (!Notifications || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    // SDK 57's shape — `shouldShowAlert` was replaced by the
    // banner/list pair in a prior SDK and is no longer part of the type,
    // so it's deliberately not included here.
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('quest-reminders', {
      name: 'Quest & streak reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => {});
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  configureHandler();
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  try {
    const status = await Notifications.getPermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

const STREAK_RISK_IDENTIFIER = 'streak-risk-reminder';

// Fires once, this evening, if — and only if — there's still something to
// lose. Safe to call as often as you like (every quest completion, every
// app foreground): it always cancels whatever was previously scheduled
// under this identifier first, so calling it again with updated state never
// leaves a stale, now-wrong reminder sitting in the queue alongside a new
// correct one.
//
// `hour` (24-hour, local time) is when the reminder should fire if the day
// still needs it — defaults to 8pm, a couple hours before the app's noon-UTC
// quest rollover in most US time zones would be too aggressive to hardcode,
// so this is intentionally a plain local-evening nudge rather than a
// precisely-timed one.
export async function scheduleStreakRiskReminder(
  hasIncompleteQuests: boolean,
  currentStreak: number,
  hour = 20
): Promise<void> {
  if (!Notifications) return;
  configureHandler();

  const granted = await hasNotificationPermission();
  if (!granted) return;

  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_IDENTIFIER).catch(() => {});

  // Nothing at risk — either the day's quests are already done, or there's
  // no streak yet to protect (day 0 has nothing to lose, so a reminder here
  // would just be noise).
  if (!hasIncompleteQuests || currentStreak <= 0) return;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) return; // already past the reminder hour today

  const secondsUntil = Math.round((target.getTime() - now.getTime()) / 1000);
  if (secondsUntil < 60) return; // too close to fire meaningfully

  const body =
    currentStreak === 1
      ? "You've got quests left today — finish them to keep your streak going."
      : `You've got quests left today — finish them to keep your ${currentStreak}-day streak alive.`;

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_RISK_IDENTIFIER,
    content: {
      title: 'Streak at risk',
      body,
      sound: true,
    },
    // SDK 57 requires the explicit `type` discriminant on the trigger —
    // the older bare `{ seconds, repeats }` shape (no `type` field) is no
    // longer accepted.
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
      repeats: false,
      channelId: Platform.OS === 'android' ? 'quest-reminders' : undefined,
    },
  }).catch(() => {});
}

export async function cancelStreakRiskReminder(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_IDENTIFIER).catch(() => {});
}

export async function cancelAllReminders(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

export function notificationsAvailable(): boolean {
  return Notifications !== null;
}
