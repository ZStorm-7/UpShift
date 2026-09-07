// Settings — five tabs rather than one long scroll:
//
//   General      profile answers from onboarding, display name, bio, AI
//   Account      sign-out, trusted devices, delete account
//   Privacy      the full privacy policy and legal text
//   Subscription current plan and renewal
//   Customize    theme, text size, language, notifications
//
// Anything that WRITES profile data still lives on EditProfile; the General
// tab shows those answers read-only with a link across, so there's exactly
// one form that owns the profile document (see EditProfileScreen's comment
// about it writing the whole doc without merge).

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Alert } from 'react-native';
import AnimatedToggle from '../components/AnimatedToggle';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Screen, Field, Button } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, useTheme } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES, LanguageCode } from '../i18n/translations';
import { withMinDuration, withTimeout, AUTH_TRANSITION_MS } from '../utils/timing';
import { confirmAsync } from '../utils/confirm';
import { displayNameFor, NO_BIO_PLACEHOLDER } from '../utils/profileDisplay';
import haptics from '../services/haptics';
import PrivacyPolicyContent from '../components/PrivacyPolicyContent';
import { safeGoBack } from '../utils/nav';
import {
  getDeviceId,
  sessionsDocRef,
  activeDevices,
  invalidateAllSessions,
  revokeDevice,
  SessionsDoc,
  DeviceEntry,
} from '../firebase/sessions';

type Tab = 'general' | 'account' | 'privacy' | 'subscription' | 'customize';

const TABS: { key: Tab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'account', label: 'Account' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'subscription', label: 'Plan' },
  { key: 'customize', label: 'Customize' },
];

// Text-size options. Applied as a multiplier on the app's own type scale —
// see UserProfile.fontScale.
const FONT_SCALES: { label: string; value: number }[] = [
  { label: 'Small', value: 0.9 },
  { label: 'Default', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Larger', value: 1.3 },
];

export default function SettingsScreen({ navigation }: any) {
  const palette = usePalette();
  const { mode, autoMode, manualMode, setAutoMode, setManualMode } = useTheme();
  const { authUser, profile, setProfile, logOut, emailVerified, sendVerificationEmail } = useUser();
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  async function handleResendVerification() {
    if (resendingVerification) return;
    setResendingVerification(true);
    try {
      await sendVerificationEmail();
      haptics.setComplete();
      setVerificationSent(true);
    } catch {
      Alert.alert('Could not send email', 'Please check your connection and try again.');
    } finally {
      setResendingVerification(false);
    }
  }
  const { status, trialDaysRemaining, goToManageSubscription, presentCustomerCenter } = useSubscription();
  const { language, setLanguage } = useLanguage();
  const [tab, setTab] = useState<Tab>('general');
  const [loggingOut, setLoggingOut] = useState(false);

  const [bioDraft, setBioDraft] = useState(profile?.bio ?? '');
  const [nameDraft, setNameDraft] = useState(profile?.displayName ?? '');
  const [savingProfileBits, setSavingProfileBits] = useState(false);

  const notificationsEnabled = profile?.notificationsEnabled !== false;

  // Writes ONLY the fields this screen owns, with merge — deliberately not
  // the whole-document setDoc that EditProfile does, so the two can't
  // clobber each other's fields.
  async function saveProfileBits(updates: Record<string, any>) {
    if (!authUser || !profile) return;
    setSavingProfileBits(true);
    try {
      await setDoc(doc(db, 'users', authUser.uid), updates, { merge: true });
      setProfile({ ...profile, ...updates });
      haptics.setComplete();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSavingProfileBits(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    const confirmed = await confirmAsync({
      title: 'Log out?',
      message: 'Are you sure you want to log out? Your data stays saved and will be here when you sign back in.',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (!confirmed) return;
    setLoggingOut(true);
    try {
      await withMinDuration(withTimeout(logOut()), AUTH_TRANSITION_MS);
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch {
      // A stalled/failed sign-out is rare, but leaving the spinner up
      // forever with no way out is worse than staying on Settings so the
      // user can try again.
    } finally {
      setLoggingOut(false);
    }
  }

  // Trusted devices — loaded only when the Account tab is actually open,
  // since it's the one tab whose data isn't already sitting in context.
  const [sessionsDoc, setSessionsDoc] = useState<Partial<SessionsDoc> | undefined>();
  const [thisDeviceId, setThisDeviceId] = useState<string>('');
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    if (tab !== 'account' || !authUser) return;
    getDeviceId().then(setThisDeviceId);
    const unsubscribe = onSnapshot(sessionsDocRef(authUser.uid), snap => {
      setSessionsDoc(snap.data() as Partial<SessionsDoc> | undefined);
    });
    return unsubscribe;
  }, [tab, authUser?.uid]);

  async function handleLogoutAllDevices() {
    if (!authUser || loggingOutAll) return;
    const confirmed = await confirmAsync({
      title: 'Log out of all devices?',
      message: 'Every device signed into this account — including this one — will be signed out. You can log back in anywhere at any time.',
      confirmLabel: 'Log out everywhere',
      destructive: true,
    });
    if (!confirmed) return;
    setLoggingOutAll(true);
    try {
      await invalidateAllSessions(authUser.uid);
      // Signs THIS device out immediately rather than waiting for its own
      // listener to catch the change — same instant feedback a normal
      // "Log out" tap gives.
      await withMinDuration(withTimeout(logOut()), AUTH_TRANSITION_MS);
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch {
      Alert.alert('Could not log out everywhere', 'Please check your connection and try again.');
    } finally {
      setLoggingOutAll(false);
    }
  }

  async function handleRevokeDevice(device: DeviceEntry & { id: string }) {
    if (!authUser) return;
    const isThisDevice = device.id === thisDeviceId;
    const confirmed = await confirmAsync({
      title: isThisDevice ? 'Sign out this device?' : `Sign out "${device.name}"?`,
      message: isThisDevice
        ? 'This will sign you out here.'
        : `That device will be signed out the next time it connects.`,
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await revokeDevice(authUser.uid, device.id);
      if (isThisDevice) {
        await withMinDuration(withTimeout(logOut()), AUTH_TRANSITION_MS);
        navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
    } catch {
      Alert.alert('Could not sign out that device', 'Please check your connection and try again.');
    }
  }

  async function handleCancelSubscription() {
    // RevenueCat's Customer Center is a full self-service screen (plan
    // details, switch/cancel, support) that RevenueCat itself gates behind
    // the right confirmations — reaching for our own "cancel subscription?"
    // dialog in front of it would just be a second, redundant confirmation.
    // Only fall back to the plain confirm + store-deep-link when the
    // Customer Center genuinely isn't available (Expo Go, SDK not yet
    // configured with a key).
    const opened = await presentCustomerCenter();
    if (opened) return;

    const confirmed = await confirmAsync({
      title: 'Cancel subscription?',
      message: 'This will end your access to UpShift when your current billing period ends. Your progress and data stay saved, but you won\'t be able to log new entries.',
      confirmLabel: 'Manage in store',
      cancelLabel: 'Keep subscription',
    });
    if (confirmed) goToManageSubscription();
  }

  const subscriptionLabel =
    status === 'trial' ? `Free trial · ${trialDaysRemaining ?? 0} days left`
    : status === 'active_monthly' ? 'Active · Monthly'
    : status === 'active_annual'  ? 'Active · Annual'
    : status === 'trial_expired'  ? 'Trial expired'
    : 'Not subscribed';

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <View style={styles.header}>
        <Pressable
          onPress={() => safeGoBack(navigation)}
          hitSlop={16}
          accessibilityLabel="Back"
          accessibilityRole="button">
          <Text style={[styles.back, { color: palette.textPrimary }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}>
        {TABS.map(item => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => { haptics.selection(); setTab(item.key); }}
              style={[
                styles.tab,
                { borderColor: palette.border },
                active && { backgroundColor: palette.accent, borderColor: palette.accent },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}>
              <Text style={[styles.tabText, { color: active ? palette.textOnAccent : palette.textSecondary }]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'general' && (
          <>
            <Section title="How people see you" palette={palette}>
              <View style={styles.formBlock}>
                <Field
                  label="Name people will see you as"
                  placeholder={displayNameFor(profile)}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoCapitalize="words"
                  maxLength={30}
                />
                <Field
                  label="Bio"
                  placeholder={NO_BIO_PLACEHOLDER}
                  value={bioDraft}
                  onChangeText={setBioDraft}
                  autoCapitalize="sentences"
                  maxLength={200}
                />
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  Shown when someone taps you on the leaderboard.
                  {!profile?.bio && !bioDraft ? ` Right now it says "${NO_BIO_PLACEHOLDER}"` : ''}
                </Text>
                <Button
                  label={savingProfileBits ? 'Saving…' : 'Save'}
                  onPress={() => saveProfileBits({
                    displayName: nameDraft.trim(),
                    bio: bioDraft.trim(),
                  })}
                  disabled={savingProfileBits}
                  fullWidth
                />
              </View>
            </Section>

            <Section title="Ascend AI" palette={palette}>
              <TappableRow
                label="Open Ascend AI"
                onPress={() => navigation.navigate('AscendAI')}
                palette={palette}
              />
            </Section>

            <Section title="Your answers" palette={palette}>
              <Row label="Age" value={profile?.age != null ? String(profile.age) : '—'} palette={palette} />
              <Row
                label="Height"
                value={profile?.heightFeet != null ? `${profile.heightFeet}' ${profile.heightInches ?? 0}"` : '—'}
                palette={palette}
              />
              <Row label="Gender" value={profile?.gender || '—'} palette={palette} />
              <Row label="Activity level" value={profile?.activityLevel || '—'} palette={palette} />
              <Row label="Goal" value={profile?.goal || '—'} palette={palette} />
              <Row
                label="Birthday"
                value={profile?.birthdayMonth && profile?.birthdayDay ? `${profile.birthdayMonth}/${profile.birthdayDay}` : '—'}
                palette={palette}
              />
              <Row
                label="Physical considerations"
                value={profile?.physicalConditions?.length ? profile.physicalConditions.join(', ') : 'None'}
                palette={palette}
              />
              <TappableRow
                label="Edit these answers"
                onPress={() => navigation.navigate('EditProfile')}
                palette={palette}
              />
            </Section>
          </>
        )}

        {tab === 'account' && (
          <>
            {/* A REMINDER, not a gate — the trial is meant to be
                frictionless, so this is the only place email verification
                shows up before a real subscription exists. See
                VerifyEmailScreen for the hard gate that replaces this once
                the trial converts to a paid plan. */}
            {status === 'trial' && !emailVerified && (
              <Section title="Email" palette={palette}>
                <Row label="Verification" value="Not verified" palette={palette} />
                <TappableRow
                  label={
                    resendingVerification ? 'Sending…'
                    : verificationSent ? 'Sent — check your inbox'
                    : 'Send verification email'
                  }
                  onPress={handleResendVerification}
                  palette={palette}
                />
              </Section>
            )}

            <Section title="Session" palette={palette}>
              <TappableRow
                label={loggingOut ? 'Signing out…' : 'Log out'}
                onPress={handleLogout}
                palette={palette}
                destructive
              />
              {/* Client-only implementation — no Cloud Functions / Admin
                  SDK, so no Blaze billing requirement. Every device
                  listens for its own revocation via Firestore; see
                  firebase/sessions.ts for exactly how and its stated
                  limitation (an offline device catches up on reconnect,
                  not instantly). */}
              <TappableRow
                label={loggingOutAll ? 'Signing out everywhere…' : 'Log out of all devices'}
                onPress={handleLogoutAllDevices}
                palette={palette}
                destructive
              />
            </Section>

            <Section title="Trusted devices" palette={palette}>
              {activeDevices(sessionsDoc).length === 0 ? (
                <Row label="No devices yet" value="" palette={palette} />
              ) : (
                activeDevices(sessionsDoc).map(device => (
                  <View key={device.id} style={[styles.row, { borderBottomColor: palette.divider }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>
                        {device.name}{device.id === thisDeviceId ? ' · This device' : ''}
                      </Text>
                      <Text style={[styles.deviceMeta, { color: palette.textMuted }]}>
                        Last active {formatRelativeTime(device.lastSeen)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleRevokeDevice(device)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Sign out ${device.name}`}>
                      <Text style={[styles.revokeLink, { color: palette.loss }]}>Sign out</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </Section>
          </>
        )}

        {tab === 'privacy' && (
          <Section title="Legal" palette={palette}>
            <View style={styles.legalBlock}>
              <PrivacyPolicyContent palette={palette} />
            </View>
            <TappableRow
              label="Contact us about your data"
              onPress={() => Linking.openURL('mailto:hello@upshift.app?subject=Privacy request')}
              palette={palette}
            />
          </Section>
        )}

        {tab === 'subscription' && (
          <Section title="Your plan" palette={palette}>
            <Row label="Status" value={subscriptionLabel} palette={palette} />
            <Row
              label="Price"
              value={
                status === 'active_monthly' ? '$9.99 / month'
                : status === 'active_annual' ? '$99.99 / year'
                : status === 'trial' ? 'Free during trial'
                : '—'
              }
              palette={palette}
            />
            {status === 'trial' && (
              <Row label="Trial ends in" value={`${trialDaysRemaining ?? 0} days`} palette={palette} />
            )}
            {(status === 'active_monthly' || status === 'active_annual') && (
              <TappableRow label="Manage or cancel" onPress={handleCancelSubscription} palette={palette} destructive />
            )}
            {(status === 'trial_expired' || status === 'none') && (
              <TappableRow label="View plans" onPress={() => navigation.navigate('Subscription')} palette={palette} />
            )}
          </Section>
        )}

        {tab === 'customize' && (
          <>
            <Section title="Appearance" palette={palette}>
              <Row
                label="Automatic (day / night)"
                palette={palette}
                right={
                  <AnimatedToggle
                    value={autoMode}
                    onValueChange={setAutoMode}
                    palette={palette}
                    accessibilityLabel="Automatic day/night theme"
                  />
                }
              />
              {autoMode ? (
                <Row
                  label="Currently"
                  value={mode === 'light' ? 'Light (daytime)' : 'Dark (nighttime)'}
                  palette={palette}
                />
              ) : (
                <View style={styles.optionBlock}>
                  <Text style={[styles.rowLabel, { color: palette.textPrimary, marginBottom: spacing.sm }]}>Theme</Text>
                  <View style={[styles.switcher, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
                    {(['light', 'dark'] as const).map(m => {
                      const active = manualMode === m;
                      return (
                        <Pressable
                          key={m}
                          onPress={() => { haptics.selection(); setManualMode(m); }}
                          style={[styles.switcherOption, active && { backgroundColor: palette.accent }]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}>
                          <Text style={[styles.switcherText, { color: active ? palette.textOnAccent : palette.textSecondary }]}>
                            {m === 'light' ? 'Light' : 'Dark'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </Section>

            <Section title="Text size" palette={palette}>
              <View style={styles.optionBlock}>
                <View style={[styles.switcher, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
                  {FONT_SCALES.map(opt => {
                    const active = (profile?.fontScale ?? 1) === opt.value;
                    return (
                      <Pressable
                        key={opt.label}
                        onPress={() => { haptics.selection(); saveProfileBits({ fontScale: opt.value }); }}
                        style={[styles.switcherOption, active && { backgroundColor: palette.accent }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}>
                        <Text style={[styles.switcherText, { color: active ? palette.textOnAccent : palette.textSecondary }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Section>

            <Section title="Language" palette={palette}>
              <View style={styles.optionBlock}>
                <View style={styles.langWrap}>
                  {LANGUAGES.map(lang => {
                    const active = language === lang.code;
                    return (
                      <Pressable
                        key={lang.code}
                        onPress={() => {
                          haptics.selection();
                          setLanguage(lang.code as LanguageCode);
                          saveProfileBits({ language: lang.code });
                        }}
                        style={[
                          styles.langChip,
                          { borderColor: palette.border, backgroundColor: palette.surfaceSunken },
                          active && { backgroundColor: palette.accentSoft, borderColor: palette.accent },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={lang.label}>
                        <Text style={[styles.langChipText, { color: active ? palette.accent : palette.textSecondary }]}>
                          {lang.nativeLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  Some languages are only partly translated — anything missing
                  falls back to English.
                </Text>
              </View>
            </Section>

            <Section title="Notifications" palette={palette}>
              <Row
                label="Streak & quest reminders"
                palette={palette}
                right={
                  <AnimatedToggle
                    value={notificationsEnabled}
                    onValueChange={v => saveProfileBits({ notificationsEnabled: v })}
                    palette={palette}
                    accessibilityLabel="Streak and quest reminders"
                  />
                }
              />
            </Section>

            <Section title="About" palette={palette}>
              <TappableRow
                label="Send feedback"
                onPress={() => Linking.openURL('mailto:hello@upshift.app?subject=UpShift feedback')}
                palette={palette}
              />
              <Row label="Version" value="1.0.0" palette={palette} />
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, palette, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>{title.toUpperCase()}</Text>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {children}
      </View>
    </View>
  );
}

function formatRelativeTime(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function Row({ label, value, right, palette }: any) {
  return (
    <View style={[styles.row, { borderBottomColor: palette.divider }]}>
      <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>{label}</Text>
      {right ? right : (
        <Text style={[styles.rowValue, { color: palette.textSecondary }]} numberOfLines={2}>
          {value}
        </Text>
      )}
    </View>
  );
}

function TappableRow({ label, onPress, palette, destructive }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderBottomColor: palette.divider }]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Text style={[styles.rowLabel, { color: destructive ? palette.loss : palette.textPrimary }]}>
        {label}
      </Text>
      <Text style={[styles.rowChevron, { color: palette.textMuted }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  back: { fontFamily: fontFamily.sans, fontSize: 15 },
  title: { fontFamily: fontFamily.serif, fontSize: 22 },

  // flexGrow:0 keeps the tab strip from expanding to fill the column, but on
  // its own it left the ScrollView's height to be inferred — and a horizontal
  // ScrollView that infers a height ends up shorter than the pills inside it,
  // which is what clipped the bottom of every tab. flexShrink:0 stops the
  // content ScrollView below from squeezing it, and the contentContainer
  // centers + pads the pills so they're never flush against the clip edge.
  tabScroll: { flexGrow: 0, flexShrink: 0, marginTop: spacing.md },
  tabRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: layout.hairline,
  },
  tabText: { fontFamily: fontFamily.sansBold, fontSize: 13 },

  content: { padding: spacing.lg, paddingBottom: layout.bottomInset, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8, paddingHorizontal: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: layout.hairline, overflow: 'hidden' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderBottomWidth: layout.hairline, minHeight: 52, gap: spacing.md,
  },
  rowLabel: { fontFamily: fontFamily.sans, fontSize: 15, flexShrink: 1 },
  rowValue: { fontFamily: fontFamily.sans, fontSize: 15, textAlign: 'right', flexShrink: 1 },
  deviceMeta: { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },
  revokeLink: { fontFamily: fontFamily.sansBold, fontSize: 13 },
  rowChevron: { fontFamily: fontFamily.sans, fontSize: 24, marginTop: -4 },

  formBlock: { padding: spacing.lg, gap: spacing.md },
  optionBlock: { padding: spacing.lg, gap: spacing.sm },
  legalBlock: { padding: spacing.lg },
  hint: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17 },

  switcher: {
    flexDirection: 'row', gap: 4,
    borderRadius: radius.pill, borderWidth: layout.hairline, padding: 3,
  },
  switcherOption: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  switcherText: { fontFamily: fontFamily.sansBold, fontSize: 13 },

  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  langChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: layout.hairline,
  },
  langChipText: { fontFamily: fontFamily.sans, fontSize: 13 },
});
