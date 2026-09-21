// VerifyEmailScreen — the hard gate, reached only once a subscription is
// actually active (never during the free trial — see App.tsx's
// needsEmailVerification and SubscriptionScreen's post-purchase routing,
// the two places that send someone here).
//
// The trial deliberately does NOT block on this: it's a reminder there
// (see the Settings row and SubscriptionContext), not a wall, because the
// trial's whole point is a frictionless no-card look at the app. Money
// changing hands is a different situation — a subscriber whose email
// bounces can't be reached about a billing problem, a receipt, or a
// password reset, so this is the one moment verifying stops being optional.

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button } from '../components/ui';
import { spacing, radius, type } from '../theme/tokens';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { legalAcceptanceDocRef } from './LegalGateScreen';
import { getAuthErrorMessage } from '../firebase/authErrors';
import { confirmAsync } from '../utils/confirm';
import haptics from '../services/haptics';

// Resending too quickly just spends the same rate limit Firebase already
// enforces server-side (auth/too-many-requests) — this cooldown is purely
// so the button itself communicates "wait a moment" instead of the user
// mashing it and getting a cryptic error back.
const RESEND_COOLDOWN_S = 30;

export default function VerifyEmailScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, logOut, loadProfile, sendVerificationEmail, refreshEmailVerified } = useUser();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setNotice('');
    try {
      await sendVerificationEmail();
      haptics.setComplete();
      setNotice(`Verification email sent to ${authUser?.email}.`);
      setCooldown(RESEND_COOLDOWN_S);
      const timer = setInterval(() => {
        setCooldown(s => {
          if (s <= 1) { clearInterval(timer); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setNotice(getAuthErrorMessage(err));
      haptics.error();
    } finally {
      setResending(false);
    }
  }

  async function handleCheck() {
    if (checking || !authUser) return;
    setChecking(true);
    setNotice('');
    try {
      const verified = await refreshEmailVerified();
      if (!verified) {
        setNotice("Still not verified — check your inbox (and spam folder) for the link.");
        haptics.error();
        return;
      }
      haptics.goalMet();
      // Same fork RootNavigator uses on a fresh boot, done here explicitly
      // because this screen is reached both mid-flow (brand-new subscriber,
      // fresh off LegalGate's "not accepted yet") and on a cold boot from a
      // returning subscriber who already has both — those need different
      // next stops, and this is the one place that knows which.
      const legalSnap = await getDoc(legalAcceptanceDocRef(authUser.uid));
      const hasLegalAcceptance = legalSnap.exists() && !!legalSnap.data()?.accepted;
      if (!hasLegalAcceptance) {
        navigation.replace('LegalGate');
        return;
      }
      const hasProfile = await loadProfile(authUser.uid);
      navigation.replace(hasProfile ? 'Dashboard' : 'Onboarding');
    } catch {
      setNotice('Could not check verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    if (loggingOut) return;
    const confirmed = await confirmAsync({
      title: 'Log out?',
      message: 'Signed up with the wrong email? Log out and create a new account with the right one.',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (!confirmed) return;
    setLoggingOut(true);
    try {
      await logOut();
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: palette.accentSoft }]}>
          <Ionicons name="mail-unread" size={36} color={palette.accent} />
        </View>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Verify your email</Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          You're subscribed — one last step. We sent a link to{'\n'}
          <Text style={{ fontFamily: type.heading.fontFamily }}>{authUser?.email}</Text>.
          Tap it, then come back here.
        </Text>

        {!!notice && (
          <View style={[styles.noticeBanner, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
            <Text style={[styles.noticeText, { color: palette.textSecondary }]}>{notice}</Text>
          </View>
        )}

        <Button
          label={checking ? 'Checking…' : "I've verified — Continue"}
          onPress={handleCheck}
          disabled={checking}
          fullWidth
          glow
        />

        <Pressable onPress={handleResend} disabled={resending || cooldown > 0} hitSlop={10} style={styles.resendLink}>
          {resending
            ? <ActivityIndicator color={palette.textSecondary} />
            : <Text style={[styles.resendText, { color: cooldown > 0 ? palette.textMuted : palette.accentText }]}>
                {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
              </Text>}
        </Pressable>

        <Pressable onPress={handleLogout} disabled={loggingOut} hitSlop={10} style={styles.logoutLink}>
          <Text style={[styles.logoutText, { color: palette.textMuted }]}>
            Wrong email? Log out
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...type.title,
    textAlign: 'center',
  },
  subtitle: {
    ...type.body,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  noticeBanner: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  noticeText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  resendLink: {
    paddingVertical: spacing.sm,
  },
  resendText: {
    ...type.body,
    fontWeight: '600',
  },
  logoutLink: {
    paddingVertical: spacing.sm,
  },
  logoutText: {
    ...type.bodySm,
  },
});
