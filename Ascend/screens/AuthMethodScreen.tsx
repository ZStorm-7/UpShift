// The "choose a sign-in method" screen — reached from BOTH of Welcome's
// buttons ("Log In" and "Get Started"), which pass a `mode: 'login' |
// 'signup'` route param so this one component can adjust its heading/copy
// without needing two near-identical files.
//
// Email is the ONLY sign-in method now — Apple, Google, and phone were all
// removed on request. Apple/Google sign-in worked fine; they were pulled for
// product reasons (keep the auth surface to one flow), not because anything
// was broken with them the way phone sign-in was (see git history for that
// code if either needs to come back later). With only one method, this
// screen is really just a hand-off to AuthScreen's email/password form — but
// it stays a separate screen (rather than Welcome navigating straight to
// Auth) so the route structure doesn't change out from under anything else
// that navigates here with a `mode` param.

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { Screen } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE } from '../components/Splash';
import AuthTransition from '../components/AuthTransition';

// The chevron only, at two-thirds of the splash's size — Welcome has just
// shown the full lockup one screen ago.
const MARK_WIDTH = 44;
const MARK_HEIGHT = 38;

type AuthMethodMode = 'login' | 'signup';

export default function AuthMethodScreen({ navigation, route }: any) {
  const mode: AuthMethodMode = route?.params?.mode === 'login' ? 'login' : 'signup';
  const palette = usePalette();
  // Only ever true for the brief moment between tapping "Continue with
  // email" and the Auth screen taking over — kept (rather than navigating
  // instantly) so the same AuthTransition overlay other auth steps use
  // covers this hand-off too, instead of a bare instant cut.
  const [submitting, setSubmitting] = useState(false);

  const heading = mode === 'login' ? 'Log in to UpShift' : 'Create your account';

  function goToEmail() {
    setSubmitting(true);
    navigation.navigate('Auth', { mode });
  }

  return (
    <Screen style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <Enter index={0}>
          <View accessible accessibilityRole="image" accessibilityLabel="UpShift">
            <Svg width={MARK_WIDTH} height={MARK_HEIGHT} viewBox={MARK_VIEWBOX}>
              <Path
                d={MARK}
                stroke={palette.accent}
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </View>
        </Enter>

        <Enter index={1}>
          <Text style={[styles.title, { color: palette.textPrimary }]} accessibilityRole="header">
            {heading}
          </Text>
        </Enter>

        <Enter index={2} style={styles.methods}>
          <Pressable
            onPress={goToEmail}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Continue with email"
            style={({ pressed }) => [
              styles.methodButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
              pressed && styles.methodButtonPressed,
            ]}>
            <Ionicons name="mail-outline" size={18} color={palette.textPrimary} />
            <Text style={[styles.methodButtonLabel, { color: palette.textPrimary }]}>Continue with email</Text>
          </Pressable>
        </Enter>

        <Enter index={3} style={styles.legalRow}>
          <Text style={[styles.legalText, { color: palette.textMuted }]}>
            By continuing, you agree to our{' '}
            <Text
              onPress={() => navigation.navigate('TermsOfService')}
              accessibilityRole="link"
              accessibilityLabel="Terms of Service"
              style={[styles.legalLink, { color: palette.accentText }]}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              onPress={() => navigation.navigate('PrivacyPolicy')}
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
              style={[styles.legalLink, { color: palette.accentText }]}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Enter>
      </ScrollView>

      {submitting && <AuthTransition />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  title: {
    ...type.title,
    textAlign: 'center',
  },
  methods: {
    width: '100%',
    gap: spacing.md,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  methodButtonPressed: {
    opacity: 0.75,
  },
  methodButtonLabel: {
    ...type.button,
  },
  legalRow: {
    width: '100%',
    paddingTop: spacing.sm,
  },
  legalText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
});
