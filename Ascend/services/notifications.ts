import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getDeviceId } from '../firebase/sessions';

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

// ── Water reminders ───────────────────────────────────────────────────
//
// Fires several times a day, every day, at fixed local hours — not tied to
// today's actual intake (a local notification can't check live Firestore
// state at fire time, same limitation documented above for the streak
// reminder). One DAILY-repeating trigger per hour, each under its own
// identifier so re-scheduling can cancel exactly this set without touching
// the streak or sleep or workout reminders living alongside them.
const WATER_REMINDER_HOURS = [10, 13, 16, 19];
const WATER_REMINDER_IDS = WATER_REMINDER_HOURS.map(h => `water-reminder-${h}`);

export async function scheduleWaterReminders(enabled: boolean): Promise<void> {
  if (!Notifications) return;
  configureHandler();

  await Promise.all(
    WATER_REMINDER_IDS.map(id => Notifications!.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
  if (!enabled) return;

  const granted = await hasNotificationPermission();
  if (!granted) return;

  await Promise.all(
    WATER_REMINDER_HOURS.map((hour, i) =>
      Notifications!.scheduleNotificationAsync({
        identifier: WATER_REMINDER_IDS[i],
        content: {
          title: 'Time to hydrate',
          body: 'Log a glass of water to stay on pace for today\'s goal.',
          sound: true,
        },
        trigger: {
          type: Notifications!.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
          channelId: Platform.OS === 'android' ? 'quest-reminders' : undefined,
        },
      }).catch(() => {})
    )
  );
}

export async function cancelWaterReminders(): Promise<void> {
  if (!Notifications) return;
  await Promise.all(
    WATER_REMINDER_IDS.map(id => Notifications!.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

// ── Sleep / bedtime reminder ─────────────────────────────────────────────
//
// One nightly alarm-style nudge at the user's target bedtime, repeating
// daily. Same local-only caveat as the others — it fires every night
// regardless of whether sleep was already logged, because there's no way
// for a scheduled local notification to check that at fire time.
const BEDTIME_REMINDER_IDENTIFIER = 'bedtime-reminder';

export async function scheduleBedtimeReminder(
  enabled: boolean,
  hour: number = 22,
  minute: number = 0,
): Promise<void> {
  // Callers pass the user's stored bedtime, which may legitimately be
  // undefined (never set) — a default parameter only applies to
  // `undefined`, so that case lands on 22:00 as intended.
  if (!Notifications) return;
  configureHandler();

  await Notifications.cancelScheduledNotificationAsync(BEDTIME_REMINDER_IDENTIFIER).catch(() => {});
  if (!enabled) return;

  const granted = await hasNotificationPermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: BEDTIME_REMINDER_IDENTIFIER,
    content: {
      title: 'Wind down',
      body: 'Bedtime is coming up — start winding down to hit your sleep goal.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? 'quest-reminders' : undefined,
    },
  }).catch(() => {});
}

export async function cancelBedtimeReminder(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(BEDTIME_REMINDER_IDENTIFIER).catch(() => {});
}

// ── Workout reminder ──────────────────────────────────────────────────
//
// Fires once, this evening, ONLY if today's workout hasn't been completed
// yet at the moment this is called — mirrors scheduleStreakRiskReminder's
// "cancel then maybe reschedule" pattern so it can safely be called again
// every time workout-completion state changes (finishing a workout should
// silence tonight's nudge immediately, not wait for a stale one to fire).
const WORKOUT_REMINDER_IDENTIFIER = 'workout-reminder';

export async function scheduleWorkoutReminder(
  workoutCompletedToday: boolean,
  hour = 18
): Promise<void> {
  if (!Notifications) return;
  configureHandler();

  await Notifications.cancelScheduledNotificationAsync(WORKOUT_REMINDER_IDENTIFIER).catch(() => {});
  if (workoutCompletedToday) return;

  const granted = await hasNotificationPermission();
  if (!granted) return;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now.getTime()) return; // already past the reminder hour today

  const secondsUntil = Math.round((target.getTime() - now.getTime()) / 1000);
  if (secondsUntil < 60) return;

  await Notifications.scheduleNotificationAsync({
    identifier: WORKOUT_REMINDER_IDENTIFIER,
    content: {
      title: 'Get today\'s workout in',
      body: 'You haven\'t logged a workout today — a quick session keeps your progress moving.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsUntil,
      repeats: false,
      channelId: Platform.OS === 'android' ? 'quest-reminders' : undefined,
    },
  }).catch(() => {});
}

export async function cancelWorkoutReminder(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(WORKOUT_REMINDER_IDENTIFIER).catch(() => {});
}

// ── Trial expiry reminders ────────────────────────────────────────────
//
// Three one-shot notifications tied to the 7-day app-side trial (see
// context/SubscriptionContext.tsx for how the trial itself is tracked).
// Unlike every reminder above, these are scheduled ONCE, at the exact
// moment the trial starts, as fixed offsets from that single timestamp —
// there's no "reschedule as state changes" pattern here because the trial's
// start time never moves once set.
const TRIAL_3_DAYS_LEFT_IDENTIFIER = 'trial-3-days-left';
const TRIAL_1_DAY_LEFT_IDENTIFIER = 'trial-1-day-left';
const TRIAL_ENDED_IDENTIFIER = 'trial-ended';
const TRIAL_REMINDER_IDENTIFIERS = [
  TRIAL_3_DAYS_LEFT_IDENTIFIER,
  TRIAL_1_DAY_LEFT_IDENTIFIER,
  TRIAL_ENDED_IDENTIFIER,
];

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 7;

/**
 * Schedules the 3-days-left, 1-day-left, and trial-ended notifications
 * against `trialStartedAt` (the same timestamp SubscriptionContext writes
 * to Firestore when the trial begins). Safe to call even if some or all of
 * the offsets have already passed — each one is skipped rather than
 * scheduled with a negative/near-zero delay, which the API would either
 * reject or fire immediately for.
 */
export async function scheduleTrialExpiryReminders(trialStartedAt: number): Promise<void> {
  if (!Notifications) return;
  configureHandler();

  // Clear any previous schedule first — belt-and-suspenders, since in
  // practice this is only ever called once per account (see startTrial's
  // one-trial-ever guard), but a stale entry left behind by some future
  // change would otherwise sit alongside a new one under the same identifier
  // conflict.
  await cancelTrialExpiryReminders();

  const granted = await hasNotificationPermission();
  if (!granted) return;

  const now = Date.now();

  const scheduleAt = async (identifier: string, targetTime: number, title: string, body: string) => {
    const secondsUntil = Math.round((targetTime - now) / 1000);
    if (secondsUntil < 60) return; // already passed, or too close to fire meaningfully
    await Notifications!.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: true },
      trigger: {
        type: Notifications!.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
        repeats: false,
        channelId: Platform.OS === 'android' ? 'quest-reminders' : undefined,
      },
    }).catch(() => {});
  };

  await scheduleAt(
    TRIAL_3_DAYS_LEFT_IDENTIFIER,
    trialStartedAt + (TRIAL_DAYS - 3) * DAY_MS,
    'Your trial ends in 3 days',
    'Subscribe now to keep your progress, streaks, and history going without a gap.'
  );
  await scheduleAt(
    TRIAL_1_DAY_LEFT_IDENTIFIER,
    trialStartedAt + (TRIAL_DAYS - 1) * DAY_MS,
    'Your trial ends tomorrow',
    'Last day of full access — subscribe now to avoid losing it.'
  );
  await scheduleAt(
    TRIAL_ENDED_IDENTIFIER,
    trialStartedAt + TRIAL_DAYS * DAY_MS,
    'Your trial has ended',
    'Subscribe to keep using UpShift — your data is saved and waiting.'
  );
}

export async function cancelTrialExpiryReminders(): Promise<void> {
  if (!Notifications) return;
  await Promise.all(
    TRIAL_REMINDER_IDENTIFIERS.map(id => Notifications!.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

export async function cancelAllReminders(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

export function notificationsAvailable(): boolean {
  return Notifications !== null;
}

// ── Push token registration (real background push) ───────────────────
//
// A new-message push is now sent server-side: functions/src/index.ts runs
// as a Cloud Function on every new conversations/{id}/messages/{id} doc and
// posts to Expo's push API, which delivers via FCM (Android) / APNs (iOS)
// even when this app is fully closed — the one thing the old purely-local
// notifyNewMessage (fired from a live onSnapshot listener) could never do.
// This section's only job is keeping that Cloud Function supplied with
// somewhere to deliver to.
//
// Keyed by device, at users/{uid}/meta/pushTokens/{deviceId} — one doc per
// signed-in device, mirroring firebase/sessions.ts's existing per-device
// Trusted Devices doc (same getDeviceId()). A single shared field on the
// profile would mean only the last device to sign in ever gets pushed to;
// this app already tracks multiple simultaneous devices per account for
// sessions, so push tokens follow the same shape and every signed-in device
// gets notified.
//
// getExpoPushTokenAsync (unlike scheduleNotificationAsync elsewhere in this
// file) needs a `projectId` — read from app.json's extra.eas.projectId via
// expo-constants — and only ever resolves to a real token in an EAS build
// (dev client or standalone); it throws in Expo Go, which the catch below
// treats as just another "push isn't available right now" case, matching
// this whole file's fail-open pattern.
export async function registerPushToken(uid: string): Promise<void> {
  if (!Notifications) return;
  configureHandler();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const deviceId = await getDeviceId();
    await setDoc(
      doc(db, 'users', uid, 'meta', 'pushTokens', 'devices', deviceId),
      { expoPushToken: tokenResponse.data, platform: Platform.OS, updatedAt: Date.now() },
      { merge: true }
    );
  } catch {
    // Expo Go, a denied permission, offline, or no projectId configured —
    // any of these just means no push this session, not a crash.
  }
}

// Called on sign-out so a device that's no longer logged into this account
// stops being a valid delivery target for its pushes — see
// components/PushTokenRegistrar.tsx and SettingsScreen's logout handlers.
export async function clearPushToken(uid: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await deleteDoc(doc(db, 'users', uid, 'meta', 'pushTokens', 'devices', deviceId));
  } catch {
    // Best-effort — worst case a stale token lingers until the Cloud
    // Function's own DeviceNotRegistered cleanup (see functions/src/index.ts)
    // removes it after the next failed send.
  }
}
