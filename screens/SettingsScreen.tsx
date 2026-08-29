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
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert, Linking, Platform } from 'react-native';
import { Screen } from '../components/ui';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, useTheme } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { withMinDuration, AUTH_TRANSITION_MS } from '../utils/timing';
import haptics from '../services/haptics';

export default function SettingsScreen({ navigation }: any) {
  const palette = usePalette();
  const { mode, setMode } = useTheme();
  const { profile, logOut } = useUser();
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

        {/* Appearance */}
        <Section title="Appearance" palette={palette}>
          <Row
            label="Dark mode"
            palette={palette}
            right={
              <Switch
                value={mode === 'dark'}
                onValueChange={v => { haptics.selection(); setMode(v ? 'dark' : 'light'); }}
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

        {/* Notifications */}
        <Section title="Notifications" palette={palette}>
          <Row
            label="Streak & quest reminders"
            palette={palette}
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={() => {/* wired via EditProfile currently */}}
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
