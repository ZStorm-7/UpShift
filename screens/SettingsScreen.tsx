// Settings — a dedicated screen so the Dashboard header doesn't need to
// hold the logout, theme toggle, notification toggle, and subscription
// management all at once.
//
// Content selection is based on what settings are common across MacroFactor,
// MyFitnessPal, Strava, and Fitbit: appearance (light/dark), notifications,
// units (imperial/metric), language, haptics, sound, subscription
// management, help & feedback, privacy policy, terms, sign out, delete
// account.
//
// Only settings that either (a) don't affect app data or (b) reversibly
// affect the user's experience are shown here. Anything that touches
// profile data (name, age, weight) stays on EditProfile.

import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert, Linking, Platform, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, useTheme } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { withMinDuration, AUTH_TRANSITION_MS } from '../utils/timing';
import haptics from '../services/haptics';
import { useLanguage } from '../i18n/LanguageContext';
import { deleteMyAccount } from '../firebase/account';
import { useBreak } from '../context/BreakContext';
import { getAuthErrorMessage } from '../firebase/authErrors';

export default function SettingsScreen({ navigation }: any) {
  const palette = usePalette();
  const { mode, setMode } = useTheme();
  const { profile, logOut, authUser, emailVerified, resendVerification, refreshEmailVerified, reauthenticate } = useUser();
  const { t } = useLanguage();
  const { settings: breakSettings, disableAll: disableBreaks } = useBreak();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const { status, trialDaysRemaining, goToManageSubscription } = useSubscription();
  const [loggingOut, setLoggingOut] = useState(false);
  const inFlight = useRef(false);

  const notificationsEnabled = profile?.notificationsEnabled !== false;

  async function handleLogout() {
    if (inFlight.current) return;
    inFlight.current = true;
    Alert.alert(
      'Log out?',
      'Are you sure you want to log out? Your data stays saved and will be here when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => { inFlight.current = false; } },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await withMinDuration(logOut(), AUTH_TRANSITION_MS);
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } finally {
              inFlight.current = false;
              setLoggingOut(false);
            }
          },
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    if (deleting || !deletePassword) return;
    setDeleting(true);
    setDeleteError('');
    try {
      // The server insists on a login from the last few minutes.
      await reauthenticate(deletePassword);
      await deleteMyAccount();
      await disableBreaks(); // stop the background monitor on this device
      haptics.setComplete();
      // The auth user no longer exists server-side; clear local state.
      await logOut().catch(() => {});
      setDeleteOpen(false);
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch (e: any) {
      haptics.error();
      const code = e?.code as string | undefined;
      setDeleteError(
        code?.startsWith('auth/') ? getAuthErrorMessage(e) : t('deleteFailed'),
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleResendVerification() {
    try { await resendVerification(); setVerifyNote(t('verificationSent')); }
    catch (e: any) { setVerifyNote(getAuthErrorMessage(e)); }
  }

  function handleCancelSubscription() {
    Alert.alert(
      'Cancel subscription?',
      'This will end your access to UpShift when your current billing period ends. Your progress and data stay saved, but you won\'t be able to log new entries.',
      [
        { text: 'Keep subscription', style: 'cancel' },
        {
          text: 'Manage in store',
          onPress: () => goToManageSubscription(),
        },
      ],
    );
  }

  const subscriptionLabel =
    status === 'trial' ? `Free trial · ${trialDaysRemaining ?? 0} days left`
    : status === 'active_monthly' ? 'Active · Monthly'
    : status === 'active_annual'  ? 'Active · Annual'
    : status === 'trial_expired'  ? 'Trial expired'
    : 'Not subscribed';

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={16}
            accessibilityLabel="Back"
            accessibilityRole="button">
            <Text style={[styles.back, { color: palette.textPrimary }]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Settings</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Account */}
        <Section title="Account" palette={palette}>
          <Row label="Email" value={authUser?.email ?? ''} palette={palette} />
          <Row
            label={t('verifyEmail')}
            value={emailVerified ? t('emailVerified') : t('emailNotVerified')}
            palette={palette}
          />
          {!emailVerified && (
            <>
              <TappableRow label={t('resendVerification')} onPress={handleResendVerification} palette={palette} />
              <TappableRow
                label={t('checkVerified')}
                onPress={async () => { await refreshEmailVerified().catch(() => {}); setVerifyNote(''); }}
                palette={palette}
              />
              {verifyNote !== '' && (
                <Text style={{ color: palette.textSecondary, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: 13 }}>
                  {verifyNote}
                </Text>
              )}
            </>
          )}
        </Section>

        {/* Appearance */}
        <Section title="Appearance" palette={palette}>
          <Row
            label="Dark mode"
            palette={palette}
            right={
              <Switch
                value={mode === 'dark'}
                onValueChange={v => { haptics.selection(); setMode(v ? 'dark' : 'light'); }}
                accessibilityLabel="Dark mode"
                trackColor={{ true: palette.accent, false: palette.borderStrong }}
              />
            }
          />
        </Section>

        {/* Subscription */}
        <Section title="Subscription" palette={palette}>
          <Row label="Status" value={subscriptionLabel} palette={palette} />
          {(status === 'active_monthly' || status === 'active_annual') && (
            <TappableRow
              label="Manage or cancel"
              onPress={handleCancelSubscription}
              palette={palette}
              destructive
            />
          )}
          {(status === 'trial_expired' || status === 'none') && (
            <TappableRow
              label="View plans"
              onPress={() => navigation.navigate('Subscription')}
              palette={palette}
            />
          )}
        </Section>

        {/* Mindful breaks */}
        <Section title={t('breaksSection')} palette={palette}>
          <TappableRow
            label={`${t('breaksTitle')} · ${breakSettings.enabled ? t('breaksStatusOn') : '—'}`}
            onPress={() => navigation.navigate('BreaksSettings')}
            palette={palette}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications" palette={palette}>
          <Row
            label="Streak & quest reminders"
            palette={palette}
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={() => {/* wired via EditProfile currently */}}
                accessibilityLabel="Streak and quest reminders"
                trackColor={{ true: palette.accent, false: palette.borderStrong }}
              />
            }
          />
        </Section>

        {/* About */}
        <Section title="About" palette={palette}>
          <TappableRow
            label="Privacy policy"
            onPress={() => Linking.openURL('https://upshift.app/privacy')}
            palette={palette}
          />
          <TappableRow
            label="Send feedback"
            onPress={() => Linking.openURL('mailto:hello@upshift.app?subject=UpShift feedback')}
            palette={palette}
          />
          <Row label="Version" value="1.0.0" palette={palette} />
        </Section>

        {/* Danger zone */}
        <Section title="Your data" palette={palette}>
          <TappableRow
            label={t('deleteAccount')}
            onPress={() => { setDeletePassword(''); setDeleteError(''); setDeleteOpen(true); }}
            palette={palette}
            destructive
          />
        </Section>

        {/* Log out — pinned to bottom of scroll */}
        <View style={styles.logoutBlock}>
          <Pressable
            onPress={handleLogout}
            style={[styles.logoutBtn, { borderColor: palette.borderStrong }]}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            disabled={loggingOut}>
            <Text style={[styles.logoutText, { color: palette.loss }]}>
              {loggingOut ? 'Signing out…' : 'Log out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <View style={[styles.modalScrim, { backgroundColor: palette.scrim }]}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}>
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]} accessibilityRole="header">{t('deleteAccountTitle')}</Text>
            <Text style={[styles.modalBody, { color: palette.textSecondary }]}>{t('deleteAccountBody')}</Text>
            <Text style={[styles.modalBody, { color: palette.textPrimary, marginTop: spacing.md }]}>{t('enterPasswordToConfirm')}</Text>
            <TextInput
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              editable={!deleting}
              accessibilityLabel={t('enterPasswordToConfirm')}
              style={[styles.modalInput, { color: palette.textPrimary, borderColor: palette.borderStrong, backgroundColor: palette.surfaceRaised }]}
            />
            {deleteError !== '' && (
              <Text style={{ color: palette.loss, marginTop: spacing.sm }} accessibilityRole="alert">{deleteError}</Text>
            )}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" disabled={deleting} onPress={() => setDeleteOpen(false)} style={styles.modalBtn}>
                <Text style={{ color: palette.textSecondary, fontFamily: fontFamily.sansSemi }}>{t('coachCancel')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deleting || !deletePassword}
                onPress={handleDeleteAccount}
                style={[styles.modalBtn, { backgroundColor: palette.loss, opacity: deleting || !deletePassword ? 0.5 : 1 }]}>
                {deleting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontFamily: fontFamily.sansBold }}>{t('deleteForever')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

function Row({ label, value, right, palette }: any) {
  return (
    <View style={[styles.row, { borderBottomColor: palette.divider }]}>
      <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>{label}</Text>
      {right ? right : <Text style={[styles.rowValue, { color: palette.textSecondary }]}>{value}</Text>}
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
  modalScrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: radius.xl, borderWidth: 1, padding: spacing.xl },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: 22, marginBottom: spacing.sm },
  modalBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  modalInput: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontFamily: fontFamily.sans, fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.xl },
  modalBtn: { minWidth: 96, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: layout.bottomInset, gap: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: fontFamily.sans, fontSize: 15 },
  title: { fontFamily: fontFamily.serif, fontSize: 22 },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8, paddingHorizontal: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: layout.hairline, overflow: 'hidden' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderBottomWidth: layout.hairline, minHeight: 52,
  },
  rowLabel: { fontFamily: fontFamily.sans, fontSize: 15 },
  rowValue: { fontFamily: fontFamily.sans, fontSize: 15 },
  rowChevron: { fontFamily: fontFamily.sans, fontSize: 24, marginTop: -4 },
  logoutBlock: { paddingTop: spacing.xxl },
  logoutBtn: {
    borderWidth: 1, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  logoutText: { fontFamily: fontFamily.sansBold, fontSize: 15 },
});
