// SleepScreen — replaces the old sleep modal (and the SleepPromptModal
// popup) with a full screen, because sleep now carries a second concern
// the popup had no room for: the user's chosen bedtime, which drives the
// nightly wind-down reminder.
//
// Reached two ways:
//   * Tapping the Sleep stat card on the Dashboard (normal visit).
//   * Automatically once a day, from the Dashboard's sleep-prompt effect,
//     with route.params.dailyPrompt === true — which just adds the "Skip
//     today" affordance so the daily nudge stays dismissible.
//
// NOTE on "lock apps at bedtime": iOS and Android do not permit a normal
// app to block or close other apps — that needs Apple's Family Controls
// entitlement (granted case-by-case to parental-control apps) or Android's
// restricted UsageStats permission. What this screen does instead is what
// IS possible: a scheduled local notification at the chosen bedtime. The
// copy below is deliberately honest about that rather than implying the
// app can lock anything.

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import AnimatedToggle from '../components/AnimatedToggle';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button, Field } from '../components/ui';
import { useUser } from '../context/UserContext';
import { dayDocRef, getTodayKey } from '../firebase/progress';
import { scheduleBedtimeReminder, cancelBedtimeReminder, requestNotificationPermission } from '../services/notifications';
import haptics from '../services/haptics';
import { safeGoBack } from '../utils/nav';

const DEFAULT_BEDTIME_HOUR = 22;
const DEFAULT_BEDTIME_MINUTE = 0;

// Parses "11:00 PM" / "11:00pm" into minutes since midnight (0–1439).
// AM/PM is REQUIRED, not optional — this used to accept a bare "10:30" and
// silently treat it as 10:30 AM, which for a BEDTIME is almost always the
// wrong half of the day (nobody means "10:30 in the morning" when setting a
// bedtime reminder). That meant the reminder got scheduled 12 hours off from
// what the person actually wanted and just never fired at the real bedtime —
// not a notifications bug, a parsing one. Returns null for anything that
// doesn't match (including a missing AM/PM), so the caller shows an error
// instead of guessing.
function parseTimeToMinutes(input: string): number | null {
  const trimmed = input.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];
  if (hours < 1 || hours > 12) return null;
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function SleepScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { authUser, profile, setProfile } = useUser();
  const isDailyPrompt = route?.params?.dailyPrompt === true;

  const [sleepInput, setSleepInput] = useState('');
  const [bedTimeInput, setBedTimeInput] = useState('');
  const [wakeTimeInput, setWakeTimeInput] = useState('');
  const [timeError, setTimeError] = useState('');
  const [loggedHours, setLoggedHours] = useState<number | null>(null);

  const [bedtimeInput, setBedtimeInput] = useState('');
  const [bedtimeError, setBedtimeError] = useState('');
  const [savingBedtime, setSavingBedtime] = useState(false);

  const bedtimeHour = profile?.bedtimeHour ?? DEFAULT_BEDTIME_HOUR;
  const bedtimeMinute = profile?.bedtimeMinute ?? DEFAULT_BEDTIME_MINUTE;
  const reminderEnabled = profile?.bedtimeReminderEnabled !== false;

  const toggleReminder = async (value: boolean) => {
    if (!authUser || !profile) return;
    if (value) {
      // scheduleBedtimeReminder only CHECKS whether permission is already
      // granted — it never prompts — so flipping this on for someone who has
      // never granted notification permission used to silently schedule
      // nothing at all: the toggle would show on, the screen would say
      // "Currently set for 10:30 PM," and no notification would ever fire.
      // Requesting here is what actually gets the OS permission dialog in
      // front of the user at the one moment it makes sense to ask.
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'UpShift needs notification permission to send your bedtime reminder. Enable it in Settings to turn this on.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        return; // toggle stays off — nothing was scheduled, so nothing should claim to be
      }
    }
    // AnimatedToggle fires its own selection haptic on press now.
    // Optimistic — this is a plain on/off flag, not worth blocking the
    // switch's own animation on a round trip.
    setProfile({ ...profile, bedtimeReminderEnabled: value });
    if (value) {
      await scheduleBedtimeReminder(true, bedtimeHour, bedtimeMinute);
    } else {
      await cancelBedtimeReminder();
    }
    try {
      await setDoc(doc(db, 'users', authUser.uid), { bedtimeReminderEnabled: value }, { merge: true });
    } catch {
      // Reminder scheduling above already reflects the user's choice on this
      // device; a failed write just means the next profile load re-reads the
      // old value from Firestore. Not worth an error banner for a switch.
    }
  };

  // The reminder defaults to ON for every account (see `reminderEnabled`
  // above) so a brand-new user sees it active without ever touching the
  // toggle — but nothing schedules the actual OS notification until this
  // screen's toggle/save handlers run at least once. Without this, "on" was
  // purely a Firestore flag: the screen would claim a reminder was set and
  // none would ever fire for anyone who never opened Sleep and touched
  // something. Reconciling on mount (only if enabled, and cheap/idempotent —
  // scheduleBedtimeReminder always cancels-then-reschedules) makes "on" mean
  // what it says the first time this screen is ever visited, same as it
  // already does after every subsequent toggle/save.
  useEffect(() => {
    if (!authUser || !profile || !reminderEnabled) return;
    requestNotificationPermission().then(granted => {
      if (granted) scheduleBedtimeReminder(true, bedtimeHour, bedtimeMinute);
    });
    // Only ever needs to run once per visit to this screen — re-running on
    // every bedtimeHour/bedtimeMinute change would fight with saveBedtime's
    // own explicit reschedule and double up the permission check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid]);

  useEffect(() => {
    if (!authUser) return;
    getDoc(dayDocRef(authUser.uid))
      .then(snap => setLoggedHours(snap.data()?.sleepHours ?? 0))
      .catch(() => setLoggedHours(0));
  }, [authUser?.uid]);

  const saveSleep = async (hours: number, fromTimes: boolean) => {
    if (!authUser) return;
    setLoggedHours(hours);
    haptics.setComplete();
    try {
      // Explicitly writing sleepLoggedFromTimes (rather than omitting it)
      // because this is a merge write: omitting would mean "keep whatever
      // is already there", and quest 53 reads that flag to tell a
      // bedtime+waketime entry apart from a plain hours entry.
      await setDoc(
        dayDocRef(authUser.uid),
        { sleepHours: hours, sleepLoggedFromTimes: fromTimes },
        { merge: true },
      );
    } catch {
      // silent — the value is shown locally; a failed write retries on the
      // next log rather than blocking the user here.
    }
    safeGoBack(navigation);
  };

  const submitManualHours = () => {
    const hours = parseFloat(sleepInput) || 0;
    if (hours > 0 && hours <= 24) saveSleep(hours, false);
  };

  // Turns a bedtime + wake time into hours slept, handling the overnight
  // wraparound (11:00 PM → 7:00 AM is 8 hours, not negative four).
  const submitFromTimes = () => {
    const bedMinutes = parseTimeToMinutes(bedTimeInput);
    const wakeMinutes = parseTimeToMinutes(wakeTimeInput);
    if (bedMinutes === null || wakeMinutes === null) {
      setTimeError('Use a format like "11:00 PM" or "7:30 AM" for both times.');
      return;
    }
    setTimeError('');
    let diffMinutes = wakeMinutes - bedMinutes;
    if (diffMinutes <= 0) diffMinutes += 24 * 60;
    saveSleep(Math.round((diffMinutes / 60) * 4) / 4, true);
  };

  const skipToday = async () => {
    haptics.selection();
    safeGoBack(navigation);
    if (!authUser) return;
    try {
      await setDoc(
        doc(db, 'users', authUser.uid, 'meta', 'sleepPromptSkips'),
        { skippedDate: getTodayKey() },
        { merge: true },
      );
    } catch {}
  };

  const saveBedtime = async () => {
    if (!authUser || !profile || savingBedtime) return;
    const minutes = parseTimeToMinutes(bedtimeInput);
    if (minutes === null) {
      setBedtimeError('Use a format like "10:30 PM".');
      return;
    }
    setBedtimeError('');
    setSavingBedtime(true);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    try {
      await setDoc(doc(db, 'users', authUser.uid), { bedtimeHour: hour, bedtimeMinute: minute }, { merge: true });
      setProfile({ ...profile, bedtimeHour: hour, bedtimeMinute: minute });
      // Only reschedule if the reminder is actually on — updating the TIME
      // shouldn't have the side effect of silently turning the reminder back
      // ON for someone who switched it off above.
      if (reminderEnabled) await scheduleBedtimeReminder(true, hour, minute);
      setBedtimeInput('');
      haptics.setComplete();
    } catch {
      setBedtimeError('Could not save. Please try again.');
    } finally {
      setSavingBedtime(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <KeyboardAvoidingView style={styles.flexOne} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppBar title="Sleep" onBack={() => safeGoBack(navigation)} />

        <Text style={[styles.heading, { color: palette.textPrimary }]}>How'd you sleep?</Text>
        {loggedHours !== null && loggedHours > 0 && (
          <Text style={[styles.loggedNote, { color: palette.accentText }]}>
            Logged today: {loggedHours}h
          </Text>
        )}

        <View style={styles.quickRow}>
          {[5, 6, 7, 8, 9, 10].map(h => (
            <Pressable
              key={h}
              onPress={() => saveSleep(h, false)}
              style={[styles.quickBtn, { backgroundColor: palette.accentSoft, borderColor: palette.accentBorder }]}
              accessibilityRole="button"
              accessibilityLabel={`${h} hours`}>
              <Text style={[styles.quickBtnText, { color: palette.accentText }]}>{h}h</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.orText, { color: palette.textMuted }]}>or enter an exact amount</Text>
        <Field
          placeholder="Hours (e.g. 7.5)"
          value={sleepInput}
          onChangeText={setSleepInput}
          keyboardType="numeric"
        />
        <Button label="Save hours" onPress={submitManualHours} fullWidth />

        <Text style={[styles.orText, { color: palette.textMuted }]}>or calculate from bedtime & wake time</Text>
        <View style={styles.row}>
          <View style={styles.flexOne}>
            <Field placeholder="e.g. 11:00 PM" value={bedTimeInput} onChangeText={setBedTimeInput} />
          </View>
          <View style={styles.flexOne}>
            <Field placeholder="e.g. 7:30 AM" value={wakeTimeInput} onChangeText={setWakeTimeInput} />
          </View>
        </View>
        {timeError !== '' && <Text style={[styles.errorText, { color: palette.danger }]}>{timeError}</Text>}
        <Button label="Calculate & save" onPress={submitFromTimes} variant="secondary" fullWidth />

        {isDailyPrompt && (
          <Pressable onPress={skipToday} hitSlop={12} style={styles.skip}>
            <Text style={[styles.skipText, { color: palette.textMuted }]}>Skip today</Text>
          </Pressable>
        )}

        {/* Bedtime reminder — its own toggle, independent of Settings'
            "Streak & quest reminders" switch, which has nothing to do with
            sleep. This card is Sleep's one and only home for it. */}
        <View style={[styles.bedtimeCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.bedtimeHeaderRow}>
            <Text style={[styles.bedtimeTitle, { color: palette.textPrimary }]}>Bedtime reminder</Text>
            <AnimatedToggle
              value={reminderEnabled}
              onValueChange={toggleReminder}
              palette={palette}
              accessibilityLabel="Bedtime reminder"
            />
          </View>
          <Text style={[styles.bedtimeCurrent, { color: palette.textSecondary }]}>
            {reminderEnabled
              ? `Currently set for ${formatTime(bedtimeHour, bedtimeMinute)}`
              : 'Off — no wind-down notification will be sent.'}
          </Text>
          <Text style={[styles.bedtimeNote, { color: palette.textMuted }]}>
            We'll send you a wind-down notification at this time each night. UpShift
            can't lock or close other apps — iOS and Android don't allow that — so
            this is a nudge, not a blocker.
          </Text>
          <Field
            placeholder="e.g. 10:30 PM"
            value={bedtimeInput}
            onChangeText={setBedtimeInput}
          />
          {bedtimeError !== '' && <Text style={[styles.errorText, { color: palette.danger }]}>{bedtimeError}</Text>}
          <Button
            label={savingBedtime ? 'Saving…' : 'Update bedtime'}
            onPress={saveBedtime}
            variant="secondary"
            disabled={savingBedtime}
            fullWidth
          />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  heading: { fontFamily: fontFamily.serif, fontSize: 24, marginTop: spacing.sm },
  loggedNote: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickBtn: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, borderWidth: layout.hairline,
    minWidth: 56, alignItems: 'center',
  },
  quickBtnText: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  orText: { fontFamily: fontFamily.sans, fontSize: 13, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  errorText: { fontFamily: fontFamily.sans, fontSize: 13 },
  skip: { alignSelf: 'center', paddingVertical: spacing.md },
  skipText: { fontFamily: fontFamily.sans, fontSize: 13, textDecorationLine: 'underline' },
  bedtimeCard: {
    marginTop: spacing.xl,
    borderRadius: radius.lg, borderWidth: layout.hairline,
    padding: spacing.lg, gap: spacing.sm,
  },
  bedtimeHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
  },
  bedtimeTitle: { fontFamily: fontFamily.serif, fontSize: 18 },
  bedtimeCurrent: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  bedtimeNote: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 18, marginBottom: spacing.xs },
});
