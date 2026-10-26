import { Platform } from 'react-native';
import { CHECKIN_CATEGORY, CHECKIN_IDENTIFIER, CHECKIN_ACTION_LOG_WATER, type ResponseLike } from './habits/checkin';

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
  hour = 20,
  bodyOverride?: string | null
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

  const body = bodyOverride ? bodyOverride :
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


// ---- Daily check-in: repeats every day at the chosen time, with a "+250 ml water" button ----
export type CheckinTexts = { title: string; body: string; action: string };

export async function scheduleDailyCheckin(hour: number, minute: number, texts: CheckinTexts): Promise<boolean> {
  if (!Notifications) return false;
  configureHandler();
  if (!(await hasNotificationPermission())) return false;
  try {
    await Notifications.cancelScheduledNotificationAsync(CHECKIN_IDENTIFIER).catch(() => {});
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily-checkin', { name: 'Daily check-in', importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
    }
    // The button's label comes with the category, so it is re-set every time in the current language.
    await Notifications.setNotificationCategoryAsync(CHECKIN_CATEGORY, [
      { identifier: CHECKIN_ACTION_LOG_WATER, buttonTitle: texts.action, options: { opensAppToForeground: false } },
    ]);
    await Notifications.scheduleNotificationAsync({
      identifier: CHECKIN_IDENTIFIER,
      content: { title: texts.title, body: texts.body, sound: true, categoryIdentifier: CHECKIN_CATEGORY },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour, minute,
        channelId: Platform.OS === 'android' ? 'daily-checkin' : undefined,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelDailyCheckin(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(CHECKIN_IDENTIFIER).catch(() => {});
}

/** Calls back whenever the person taps a notification or one of its buttons. Returns a stop function. */
export function onNotificationResponse(cb: (r: ResponseLike) => void): () => void {
  if (!Notifications) return () => {};
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(r => cb(r as unknown as ResponseLike));
    return () => sub.remove();
  } catch { return () => {}; }
}

/** The response that opened the app from a closed state, if any. */
export async function lastNotificationResponse(): Promise<ResponseLike | null> {
  if (!Notifications) return null;
  try { return ((await Notifications.getLastNotificationResponseAsync()) as unknown as ResponseLike) ?? null; } catch { return null; }
}
