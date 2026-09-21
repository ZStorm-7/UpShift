// LegalGateScreen — the one-time, all-in-one legal acceptance gate shown
// once between the paywall/VerifyEmail step and Onboarding.
//
// Replaces the three things that used to be spread across LiabilityScreen
// and DataConsentScreen: the exercise-injury waiver, the plain-language
// "what we collect and why" summary, AND the full Privacy Policy / Terms of
// Service documents (previously reachable only from Settings, never part of
// the mandatory gate). One scroll, one checkbox, one "I agree" — see the
// onboarding-flow task for why these were consolidated rather than kept as
// three separate taps.
//
// Deliberately NOT stored on the main `users/{uid}` profile document: that
// document's mere existence is what RootNavigator uses to decide "has this
// user finished Onboarding" (see App.tsx's hasProfile check) — writing a
// flag there before Onboarding has run would make the doc "exist"
// prematurely and misroute a user straight to Dashboard with no profile. It
// lives in its own meta doc instead, same pattern as the two screens this
// replaces.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { spacing, radius, layout, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, Button } from '../components/ui';
import { useUser } from '../context/UserContext';
import haptics from '../services/haptics';
import ScrollFadeOverlay, { useScrollOverflow } from '../components/ScrollFadeOverlay';
import PrivacyPolicyContent from '../components/PrivacyPolicyContent';
import TermsOfServiceContent from '../components/TermsOfServiceContent';

export function legalAcceptanceDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'legalAcceptance');
}

const LIABILITY_TEXT =
  "Exercise carries an inherent risk of injury. By using UpShift's workout features, you confirm that you are physically able to participate in exercise and that you are voluntarily participating with full knowledge of the risks involved.\n\n" +
  'UpShift, its developers, and affiliates are not responsible for any injury, loss, or damage of any kind that may result from participating in workouts recommended or tracked through this app.\n\n' +
  'If you have any medical condition, injury, or physical limitation, consult a physician before beginning any exercise program. Stop immediately and seek medical attention if you experience pain, dizziness, or discomfort during a workout. This app is not a substitute for professional medical advice, diagnosis, or treatment.';

export default function LegalGateScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  // Only ever false for a brand-new signup — an existing account reaching
  // this screen (one that predates it, and so is missing the acceptance
  // doc too) already has a profile and belongs back on Dashboard, not
  // Onboarding. Mirrors the old DataConsentScreen's initialParams.
  const hasProfile = !!route?.params?.hasProfile;
  const overflow = useScrollOverflow();

  const accept = async () => {
    if (!authUser || !checked || accepting) return;
    setAccepting(true);
    try {
      await setDoc(
        legalAcceptanceDocRef(authUser.uid),
        { accepted: true, acceptedAt: Date.now(), version: 1 },
        { merge: true }
      );
      haptics.setComplete();
      // A brand-new signup continues into the "Let's get started" preview
      // and health sync before Onboarding; an existing account (predating
      // this gate) that already has a profile goes straight to Dashboard.
      navigation.replace(hasProfile ? 'Dashboard' : 'OnboardingIntro');
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Before you start</Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          Please read and accept the following to continue.
        </Text>

        <View style={styles.scrollWrap}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            onContentSizeChange={overflow.onContentSizeChange}
            onLayout={overflow.onLayout}
            onScroll={overflow.onScroll}
            scrollEventThrottle={16}>
            <Section title="Your safety" palette={palette}>
              <Text style={[styles.text, { color: palette.textSecondary }]}>{LIABILITY_TEXT}</Text>
            </Section>

            <Section title="Privacy Policy" palette={palette}>
              <PrivacyPolicyContent palette={palette} />
            </Section>

            <Section title="Terms of Service" palette={palette}>
              <TermsOfServiceContent palette={palette} />
            </Section>
          </ScrollView>
          <ScrollFadeOverlay visible={overflow.showFade} />
        </View>

        <Pressable
          onPress={() => { haptics.selection(); setChecked(v => !v); }}
          style={styles.checkRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="I have read and accept the above">
          <View
            style={[
              styles.checkbox,
              { borderColor: palette.borderStrong },
              checked && { backgroundColor: palette.accent, borderColor: palette.accent },
            ]}>
            {checked && <Ionicons name="checkmark" size={16} color={palette.textOnAccent} />}
          </View>
          <Text style={[styles.checkLabel, { color: palette.textPrimary }]}>
            I have read and accept the above
          </Text>
        </Pressable>
        <Button
          label={accepting ? 'Please wait…' : 'Continue'}
          onPress={accept}
          disabled={!checked || accepting}
          fullWidth
        />
      </View>
    </Screen>
  );
}

function Section({ title, palette, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontFamily: fontFamily.serif, fontSize: 26, marginTop: spacing.xl },
  subtitle: { ...type.body },
  scrollWrap: { flex: 1, position: 'relative' },
  scroll: { flex: 1 },
  scrollContent: { gap: spacing.xl, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamily.serif, fontSize: 19 },
  text: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21 },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: radius.sm, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkLabel: { fontFamily: fontFamily.sansBold, fontSize: 14, flex: 1 },
});
