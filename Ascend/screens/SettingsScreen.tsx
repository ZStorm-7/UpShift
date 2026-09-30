// Settings — five tabs rather than one long scroll:
//
//   General      profile answers from onboarding, display name, bio, AI
//   Account      sign-out, trusted devices, delete account
//   Privacy      the full privacy policy and legal text
//   Subscription current plan and renewal
//   Customize    theme, text size, notifications
//
// Anything that WRITES profile data still lives on EditProfile; the General
// tab shows those answers read-only with a link across, so there's exactly
// one form that owns the profile document (see EditProfileScreen's comment
// about it writing the whole doc without merge).

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Alert, Platform } from 'react-native';
import AnimatedToggle from '../components/AnimatedToggle';
import AnimatedTabBar from '../components/AnimatedTabBar';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Screen, Field, Button } from '../components/ui';
import BottomSheet from '../components/BottomSheet';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, useTheme } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { withMinDuration, withTimeout, AUTH_TRANSITION_MS } from '../utils/timing';
import { confirmAsync } from '../utils/confirm';
import { displayNameFor, NO_BIO_PLACEHOLDER } from '../utils/profileDisplay';
import haptics from '../services/haptics';
import { clearPushToken } from '../services/notifications';
import { isHealthAvailable, requestHealthPermission } from '../services/health';
import { deleteAccount } from '../firebase/account';
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

// Text-size options — see UserProfile.fontScale and utils/textScale.ts for
// how this actually reaches rendered text (it didn't, at all, until that
// file existed; this was a purely cosmetic switcher before).
//
// Deliberately tiny steps. This app leans on a lot of precisely-fitted
// layouts — rings with labels stacked to the pixel, badges sized around a
// fixed number of characters — several of which already needed their own
// `maxFontSizeMultiplier` caps just to survive the OS's OWN "Larger Text"
// accessibility setting (see CalorieRing.tsx, NutritionScreen.tsx). The
// previous range here (0.9–1.3, a 44% spread top to bottom) was large
// enough to genuinely break those same spots. A few percent per step is
// still a visible difference side by side without touching that ceiling.
const FONT_SCALES: { label: string; value: number }[] = [
  { label: 'Small', value: 0.96 },
  { label: 'Default', value: 1 },
  { label: 'Large', value: 1.04 },
  { label: 'Larger', value: 1.08 },
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
  const [tab, setTab] = useState<Tab>('general');
  const [loggingOut, setLoggingOut] = useState(false);

  const [bioDraft, setBioDraft] = useState(profile?.bio ?? '');
  const [nameDraft, setNameDraft] = useState(profile?.displayName ?? '');
  const [savingProfileBits, setSavingProfileBits] = useState(false);

  // Full legal name and nickname — captured at onboarding, editable here
  // rather than on EditProfile (which owns body-stats/avatar/goal instead).
  const [firstNameDraft, setFirstNameDraft] = useState(profile?.firstName ?? '');
  const [middleNameDraft, setMiddleNameDraft] = useState(profile?.middleName ?? '');
  const [lastNameDraft, setLastNameDraft] = useState(profile?.lastName ?? '');
  const [nicknameDraft, setNicknameDraft] = useState(profile?.nickname ?? '');
  const [savingFullName, setSavingFullName] = useState(false);

  async function saveFullName() {
    if (!authUser || !profile || !firstNameDraft.trim() || !lastNameDraft.trim() || !nicknameDraft.trim()) return;
    setSavingFullName(true);
    try {
      const updates = {
        firstName: firstNameDraft.trim(),
        ...(middleNameDraft.trim() ? { middleName: middleNameDraft.trim() } : {}),
        lastName: lastNameDraft.trim(),
        // Kept in sync — everything that still reads lastInitial (Avatar,
        // the leaderboard fallback display name) derives it from lastName.
        lastInitial: lastNameDraft.trim().slice(0, 1).toUpperCase(),
        nickname: nicknameDraft.trim(),
      };
      await setDoc(doc(db, 'users', authUser.uid), updates, { merge: true });
      setProfile({ ...profile, ...updates });
      haptics.setComplete();
    } catch {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSavingFullName(false);
    }
  }

  const notificationsEnabled = profile?.notificationsEnabled !== false;
  const healthSyncEnabled = profile?.healthSyncEnabled === true;
  // Health Connect is Android-only — Apple Health/HealthKit support was
  // removed on request, so this whole section is hidden on iOS below rather
  // than shown with a label for something that no longer exists.
  const healthLabel = 'Health Connect';
  const [connectingHealth, setConnectingHealth] = useState(false);

  // Turning ON asks for the OS permission right away (rather than just
  // flipping a stored flag) so the toggle can't end up "on" with nothing
  // actually granted — same reasoning as every other permission flow in
  // this file (verification email, trusted devices). Turning OFF just stops
  // Dashboard's health sync from running again; it deliberately does NOT
  // try to revoke the OS-level grant, since Health Connect doesn't let an
  // app do that from inside itself — only the user can, from the Health
  // Connect app's own settings.
  async function handleToggleHealthSync(next: boolean) {
    if (connectingHealth) return;
    if (!next) {
      await saveProfileBits({ healthSyncEnabled: false });
      return;
    }
    setConnectingHealth(true);
    try {
      const available = await isHealthAvailable();
      if (!available) {
        Alert.alert(
          `${healthLabel} isn't available`,
          'Install the Health Connect app from the Play Store, then try again.'
        );
        return;
      }
      const granted = await requestHealthPermission();
      if (!granted) {
        Alert.alert(
          'Permission denied',
          `UpShift wasn't given access to ${healthLabel}. You can turn this on again anytime, or grant access from your device's Health Connect app settings.`
        );
        return;
      }
      await saveProfileBits({ healthSyncEnabled: true });
      Alert.alert('Connected', `UpShift will pull in today's steps and offer your ${healthLabel} weight when you log in.`);
    } catch {
      Alert.alert('Could not connect', 'Please check your connection and try again.');
    } finally {
      setConnectingHealth(false);
    }
  }

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
      // Best-effort, before logOut() invalidates the auth token this write
      // needs — a device no longer signed into this account shouldn't stay
      // a valid push-delivery target for it. Wrapped in its own withTimeout
      // and its own catch: a genuinely HUNG request (not just a rejected
      // one — a bad network can do either) would otherwise block the
      // `await` below forever, leaving "Signing out…" up with no escape and
      // logOut() never even called. This is best-effort cleanup, not a
      // precondition for signing out — it must never be able to block it.
      if (authUser) {
        await withTimeout(clearPushToken(authUser.uid), 4000).catch(() => {});
      }
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
      // Every device this account has a push-token doc for, not just this
      // one — "log out everywhere" should mean nothing keeps getting
      // pushed to either. Falls back to just this device's token if the
      // Trusted Devices list hasn't loaded (sessionsDoc is only fetched
      // once the Account tab is opened — see the effect above).
      //
      // Each delete gets its own withTimeout, not just a .catch() — a
      // REJECTED promise is handled by .catch() alone, but a HUNG one (a
      // request that never settles either way, which a bad network can
      // absolutely do) would sit inside Promise.all forever with only
      // .catch() attached, blocking the sign-out below it indefinitely.
      const deviceIds = sessionsDoc?.devices ? Object.keys(sessionsDoc.devices) : [];
      await Promise.all(
        deviceIds.map(id =>
          withTimeout(
            deleteDoc(doc(db, 'users', authUser.uid, 'meta', 'pushTokens', 'devices', id)),
            4000
          ).catch(() => {})
        )
      );
      await withTimeout(clearPushToken(authUser.uid), 4000).catch(() => {});
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
      // device.id IS the deviceId push tokens are keyed by (both come from
      // the same getDeviceId()) — deleting it here works for the OTHER-
      // device case too, unlike clearPushToken() elsewhere in this file,
      // which only ever clears the CURRENT device's own token. A no-op,
      // harmlessly, if that device never registered one.
      await withTimeout(
        deleteDoc(doc(db, 'users', authUser.uid, 'meta', 'pushTokens', 'devices', device.id)),
        4000
      ).catch(() => {});
      if (isThisDevice) {
        await withMinDuration(withTimeout(logOut()), AUTH_TRANSITION_MS);
        navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      }
    } catch {
      Alert.alert('Could not sign out that device', 'Please check your connection and try again.');
    }
  }

  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  // The code the user has to retype exactly (case included) before the
  // Delete button enables — freshly generated each time the modal opens
  // (see openDeleteModal), never reused across attempts.
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteInput, setDeleteInput] = useState('');

  // Excludes visually-ambiguous characters (0/O, 1/l/I) for the same reason
  // firebase/friends.ts's friend-code alphabet does — this one gets READ
  // off the screen and retyped by hand, so a character nobody can tell
  // apart from another would make "type it exactly" needlessly frustrating
  // rather than more deliberate. Mixed case (unlike the friend code, which
  // is uppercase-only) is the whole point here: retyping the exact case is
  // what makes this a real transcription task instead of a glance-and-tap.
  function generateDeleteCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function openDeleteModal() {
    if (!authUser || deletingAccount) return;
    setDeleteCode(generateDeleteCode());
    setDeleteInput('');
    setDeleteModalVisible(true);
  }

  async function handleDeleteAccount() {
    if (deleteInput !== deleteCode) return;
    setDeleteModalVisible(false);
    setDeletingAccount(true);
    try {
      await deleteAccount();
      // The Cloud Function has already deleted the Auth user server-side —
      // this local signOut just clears the client's now-dangling cached
      // session immediately, same as handleLogout, rather than leaving it
      // to expire on its own the next time a token refresh fails.
      await logOut();
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch {
      Alert.alert(
        'Could not delete account',
        'Please check your connection and try again. Nothing was deleted.'
      );
    } finally {
      setDeletingAccount(false);
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

      <AnimatedTabBar
        tabs={TABS}
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
        palette={palette}
        scrollable
        style={styles.tabScroll}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'general' && (
          <>
            <Section title="Full name" palette={palette}>
              <View style={styles.formBlock}>
                <Field
                  label="First name"
                  placeholder="First name"
                  value={firstNameDraft}
                  onChangeText={setFirstNameDraft}
                  autoCapitalize="words"
                />
                <Field
                  label="Middle name (optional)"
                  placeholder="Middle name"
                  value={middleNameDraft}
                  onChangeText={setMiddleNameDraft}
                  autoCapitalize="words"
                />
                <Field
                  label="Last name"
                  placeholder="Last name"
                  value={lastNameDraft}
                  onChangeText={setLastNameDraft}
                  autoCapitalize="words"
                />
                <Field
                  label="Nickname"
                  placeholder="Nickname"
                  value={nicknameDraft}
                  onChangeText={setNicknameDraft}
                  autoCapitalize="words"
                  maxLength={30}
                />
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  Your full name is kept private. Other people only ever see
                  "{profile?.firstName ?? 'First'} {(profile?.lastName ?? profile?.lastInitial ?? '').slice(0, 1).toUpperCase()}." —
                  your nickname is just for how the app talks to you.
                </Text>
                <Button
                  label={savingFullName ? 'Saving…' : 'Save'}
                  onPress={saveFullName}
                  disabled={savingFullName || !firstNameDraft.trim() || !lastNameDraft.trim() || !nicknameDraft.trim()}
                  fullWidth
                />
              </View>
            </Section>

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

            <Section title="Your answers" palette={palette}>
              <Row
                label="Date of birth"
                value={profile?.dateOfBirth || '—'}
                palette={palette}
              />
              <Row label="Age" value={profile?.age != null ? String(profile.age) : '—'} palette={palette} />
              <Row
                label="Height"
                value={profile?.heightFeet != null ? `${profile.heightFeet} ft ${profile.heightInches ?? 0} in` : '—'}
                palette={palette}
              />
              <Row label="Gender" value={profile?.gender || '—'} palette={palette} />
              <Row label="Activity level" value={profile?.activityLevel || '—'} palette={palette} />
              <Row
                label="Goals"
                value={profile?.goals?.length ? profile.goals.join(', ') : (profile?.goal || '—')}
                palette={palette}
              />
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

            <Section title="Danger zone" palette={palette}>
              <TappableRow
                label={deletingAccount ? 'Deleting…' : 'Delete account'}
                onPress={openDeleteModal}
                palette={palette}
                destructive
              />
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

            {/* Android only — Health Connect is the only health source left
                (Apple Health/HealthKit was removed on request), and it
                doesn't exist on iOS at all. Requires a native EAS/dev-client
                build — see services/health.ts. The toggle itself always
                fails soft (isHealthAvailable/requestHealthPermission never
                throw), so this is harmless to show even in Expo Go or on
                web; it'll just report "not available" there. */}
            {Platform.OS !== 'ios' && (
              <Section title="Health sync" palette={palette}>
                <Row
                  label={`Connect ${healthLabel}`}
                  palette={palette}
                  right={
                    connectingHealth ? (
                      <Text style={[styles.rowValue, { color: palette.textMuted }]}>Connecting…</Text>
                    ) : (
                      <AnimatedToggle
                        value={healthSyncEnabled}
                        onValueChange={handleToggleHealthSync}
                        palette={palette}
                        accessibilityLabel={`Connect ${healthLabel}`}
                      />
                    )
                  }
                />
                <Text style={[styles.hint, { color: palette.textMuted, padding: spacing.lg, paddingTop: 0 }]}>
                  Pulls in today's step count and offers your logged weight when you check in — read-only, nothing is ever written back to {healthLabel}.
                </Text>
              </Section>
            )}

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

      {/* Delete-account confirmation — retyping a freshly generated,
          case-sensitive code rather than a plain Yes/No dialog. The random
          code (never a fixed word like "DELETE") means this can't be
          muscle-memory-tapped through by someone used to confirming other
          dialogs in the app; they have to actually read the screen. */}
      <BottomSheet
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        palette={palette}>
        <Text style={[styles.deleteModalTitle, { color: palette.textPrimary }]}>Delete your account?</Text>
        <Text style={[styles.deleteModalBody, { color: palette.textSecondary }]}>
          This permanently deletes your profile, logged food and workouts, streak, weight history, and
          leaderboard position. This cannot be undone.
        </Text>
        <Text style={[styles.deleteModalBody, { color: palette.textSecondary }]}>
          Type the code below exactly (capitalization included) to confirm.
        </Text>
        <View style={[styles.deleteCodeBox, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
          <Text style={[styles.deleteCodeText, { color: palette.textPrimary }]} selectable>
            {deleteCode}
          </Text>
        </View>
        <Field
          placeholder="Type the code above"
          value={deleteInput}
          onChangeText={setDeleteInput}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
        />
        <View style={styles.deleteModalButtons}>
          <Button
            label="Cancel"
            onPress={() => setDeleteModalVisible(false)}
            variant="secondary"
            style={styles.flexOne}
          />
          <Button
            label="Delete account"
            onPress={handleDeleteAccount}
            variant="danger"
            disabled={deleteInput !== deleteCode}
            style={styles.flexTwo}
          />
        </View>
      </BottomSheet>
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
  deleteModalTitle: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
  },
  deleteModalBody: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  deleteCodeBox: {
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteCodeText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 20,
    letterSpacing: 3,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexOne: { flex: 1 },
  flexTwo: { flex: 2 },

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
});
