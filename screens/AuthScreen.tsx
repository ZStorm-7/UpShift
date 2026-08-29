import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useUser } from '../context/UserContext';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, Field, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE } from '../components/Splash';
import AuthTransition from '../components/AuthTransition';
import { getAuthErrorMessage } from '../firebase/authErrors';
import haptics from '../services/haptics';
import { useLanguage } from '../i18n/LanguageContext';
import { withMinDuration, AUTH_TRANSITION_MS } from '../utils/timing';

// The chevron only, at two-thirds of the splash's size. Welcome has just shown
// the full lockup one screen ago; repeating the wordmark here would restate the
// brand instead of continuing it, and the mark alone is enough to say this is
// still the same app.
const MARK_WIDTH = 44;
const MARK_HEIGHT = 38;

export default function AuthScreen({ navigation }: any) {
  const { signUp, logIn, loadProfile } = useUser();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Guards against a double submit, which the `submitting` STATE cannot do on
  // its own: two taps dispatched in the same frame both read the pre-update
  // render, so both get past the disabled check and both hit Firebase. On sign
  // up that's a second createUser call racing the first. A ref updates
  // synchronously, so the second tap sees the flag the first one set.
  const inFlight = useRef(false);

  async function handleSubmit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      // The whole auth exchange — not just the network call — is held to a
      // 500ms floor, so the transition holds even when Firebase answers in
      // 50ms. See AUTH_TRANSITION_MS and utils/timing.ts.
      if (isSignUp) {
        await withMinDuration(signUp(email, password), AUTH_TRANSITION_MS);
        // NEW: subscription gate — every new user sees the paywall / trial
        // offer before onboarding. SubscriptionScreen will route them to
        // Onboarding after they pick a plan or start the trial.
        navigation.replace('Subscription');
      } else {
        const target = await withMinDuration(
          (async () => {
            const uid = await logIn(email, password);
            const hasProfile = await loadProfile(uid);
            return hasProfile ? 'Dashboard' : 'Onboarding';
          })(),
          AUTH_TRANSITION_MS
        );
        navigation.replace(target);
      }
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      setError(message);
      // A failure that only appears as red text is silent to a screen reader
      // and invisible to someone who has already looked away from the phone.
      // Announcing and buzzing are the two channels that reach them.
      AccessibilityInfo.announceForAccessibility?.(message);
      haptics.error();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const disabled = submitting || !email || !password;
  const submitLabel = isSignUp ? t('signUp') : t('logIn');

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fill}>
        {/* keyboardShouldPersistTaps="handled" is what makes the submit button
            reachable while the keyboard is up. Without it the first tap only
            dismisses the keyboard, so the user has to tap the button twice —
            and the second tap lands wherever the layout settled. */}
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
                  stroke={colors.accent}
                  strokeWidth={MARK_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </View>
          </Enter>

          <Enter index={1}>
            <Text style={styles.title} accessibilityRole="header">
              {isSignUp ? t('createAccount') : t('welcomeBack')}
            </Text>
          </Enter>

          <Enter index={2} style={styles.form}>
            <Field
              label={t('email')}
              accessibilityLabel={t('email')}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Field
              label={t('password')}
              accessibilityLabel={t('password')}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              // Sign-up asks the keychain for a NEW password; log-in asks for
              // the stored one. Getting this backwards is why iOS offers to
              // generate a password on a login form.
              autoComplete={isSignUp ? 'new-password' : 'password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={disabled ? undefined : handleSubmit}
            />
          </Enter>

          {/* The error sits directly above the button it relates to, so the
              eye lands on the reason before the retry. It carries a glyph and
              its own words as well as the red — colour is never the only thing
              saying something went wrong. Index 0 because this is a reply to
              the user's tap, not part of the screen's arrival: staggering it
              would delay the answer they are waiting on. */}
          {error !== '' && (
            <Enter index={0}>
              <View
                style={styles.errorBanner}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite">
                <Text style={styles.errorGlyph}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            </Enter>
          )}

          <Enter index={3} style={styles.actions}>
            <Button
              label={submitting ? t('pleaseWait') : submitLabel}
              // The announced name stays the action, not the transient
              // "Please wait…" — otherwise the control reads as having been
              // replaced by a different one mid-tap.
              accessibilityLabel={submitLabel}
              accessibilityState={{ busy: submitting }}
              onPress={handleSubmit}
              disabled={disabled}
              fullWidth
            />

            {/* The only other action on the screen, and deliberately a text
                link rather than a second button: two equally-weighted buttons
                would leave neither of them primary. */}
            <Pressable
              onPress={() => {
                setIsSignUp(!isSignUp);
                // A "no account found with that email" left over from the log
                // in form is not true of the sign-up form the user just
                // switched to, and reads as the new form having failed before
                // they touched it.
                setError('');
              }}
              // Flipping mode under an in-flight request would leave the
              // heading and the button describing the opposite of what is
              // actually being submitted.
              disabled={submitting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isSignUp ? t('logIn') : t('signUp')}
              accessibilityState={{ disabled: submitting }}>
              <Text style={styles.toggleText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.toggleAction}>{isSignUp ? t('logIn') : t('signUp')}</Text>
              </Text>
            </Pressable>
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Covers the form for the 500ms+ the auth exchange takes. Rendered on
          top rather than swapping the form out, so a failed attempt (which
          unsets `submitting` in the `finally`) reveals the same form with the
          error banner already in place, instead of the form having to
          remount from scratch. */}
      {submitting && <AuthTransition />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
  // flexGrow rather than flex so the form stays centred on a tall screen but
  // is free to grow past the viewport — and therefore scroll — once the
  // keyboard has taken half of it.
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
    gap: spacing.md,
  },
  actions: {
    width: '100%',
    gap: spacing.md,
  },
  errorBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderWidth: layout.hairline,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorGlyph: {
    ...type.body,
    color: colors.danger,
  },
  errorText: {
    ...type.bodySm,
    color: colors.danger,
    flex: 1,
  },
  toggleText: {
    ...type.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  toggleAction: {
    color: colors.accent,
    fontFamily: fontFamily.sansBold,
  },
});
