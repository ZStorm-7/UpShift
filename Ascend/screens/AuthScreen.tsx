// Plain email/password entry — reached only via AuthMethodScreen's
// "Continue with email" row. Apple/Google/phone sign-in used to live on
// this same screen behind an isSignUp toggle; they've moved to
// AuthMethodScreen (see that file), which is now the fork point between
// this form and those credential flows. This screen kept everything that
// isn't one of those three: the form itself, its validation/password-
// strength checklist, the submit logic, and the crossfading AuthBackground.
//
// `route.params.mode` ('login' | 'signup') comes from AuthMethodScreen,
// which itself got it from WelcomeScreen — so which of the two forms
// (heading, submit label, background variant) renders here is decided two
// screens up, not by a toggle local to this one. A user can still flip
// between them from here (the text link below the submit button) without
// having to back out to AuthMethodScreen and re-choose "Continue with
// email" — that in-place toggle is unchanged from before.

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { auth } from '../firebase/config';
import { resolvePostAuthRoute } from '../utils/postAuthRoute';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, Field, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE } from '../components/Splash';
import AuthTransition from '../components/AuthTransition';
import AuthBackground from '../components/AuthBackground';
import { PasswordStrengthChecklist, isPasswordStrong } from '../components/PasswordStrength';
import { getAuthErrorMessage } from '../firebase/authErrors';
import { isValidEmail } from '../utils/email';
import { useLanguage } from '../i18n/LanguageContext';
import { withMinDuration, withTimeout, AUTH_TRANSITION_MS, AUTH_TIMEOUT_MS } from '../utils/timing';

// The chevron only, at two-thirds of the splash's size — Welcome has just
// shown the full lockup one screen ago; repeating the wordmark here would
// restate the brand instead of continuing it.
const MARK_WIDTH = 44;
const MARK_HEIGHT = 38;

// Temporarily disabled — password-reset emails aren't reaching inboxes yet
// (Resend delivery issue, still being debugged). The whole flow
// (ForgotPasswordScreen, ResetPasswordScreen, the requestPasswordResetPin/
// verifyPinAndResetPassword Cloud Functions) is untouched and still wired
// up; this flag is the only thing standing between here and it working
// again. Flip back to true once delivery is confirmed working.
const FORGOT_PASSWORD_ENABLED = false;

export default function AuthScreen({ navigation, route }: any) {
  const { signUp, logIn, loadProfile, registerDeviceSession } = useUser();
  const { refreshEntitlement } = useSubscription();
  const { t } = useLanguage();
  const palette = usePalette();
  const initialMode: 'login' | 'signup' = route?.params?.mode === 'login' ? 'login' : 'signup';
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
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

  function reportError(err: any) {
    setError(getAuthErrorMessage(err));
  }

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
        await withMinDuration(withTimeout(signUp(email, password), AUTH_TIMEOUT_MS), AUTH_TRANSITION_MS);
        // A brand-new signup's next stop is Subscription — every new user
        // sees the paywall/trial offer before anything else. Routing here
        // explicitly rather than relying on RootNavigator's initialRouteName
        // is required because the navigator, once mounted, never remounts on
        // sign-in (see App.tsx's comment on why BootSkeleton/isLoading can't
        // be used to re-route here) — so this is the one place a fresh
        // signup's next screen is actually decided. SubscriptionScreen's own
        // trial/purchase handlers continue on to 'LegalGate' from there.
        navigation.replace('Subscription');
      } else {
        // A log-in has to make the SAME landing decision RootNavigator makes
        // on cold boot — entitlement, email verification, legal acceptance,
        // THEN profile — not just "does a profile exist". Skipping straight
        // to Dashboard on `hasProfile` alone (the old behavior) is how a
        // returning user whose trial had expired, or who'd cancelled a paid
        // subscription, could log back in and land on Dashboard with full
        // access, never re-hitting the paywall. See utils/postAuthRoute.ts.
        const target = await withMinDuration(
          withTimeout(
            (async () => {
              const uid = await logIn(email, password);
              return resolvePostAuthRoute({
                uid,
                emailVerified: auth.currentUser?.emailVerified ?? false,
                loadProfile,
                refreshEntitlement,
              });
            })(),
            AUTH_TIMEOUT_MS
          ),
          AUTH_TRANSITION_MS
        );
        navigation.replace(target);
      }
    } catch (err: any) {
      reportError(err);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  // Only gated on sign-up — an existing account's password was created
  // under whatever rules applied when they signed up, and log-in has no
  // business re-litigating that.
  const disabled =
    submitting || !email || !isValidEmail(email) || !password || (isSignUp && !isPasswordStrong(password));
  const submitLabel = isSignUp ? t('signUp') : t('logIn');
  // Empty just means "hasn't typed anything yet" — not an error. Once
  // there's SOMETHING there, a shape that isn't even email-like ("asdf")
  // gets flagged immediately rather than waiting for a Firebase round trip
  // to reject it (sign-up) or silently never matching an account (log-in).
  const emailError = email.length > 0 && !isValidEmail(email) ? 'Enter a valid email address' : undefined;

  return (
    <Screen style={[styles.screen, { backgroundColor: palette.bg }]}>
      {/* Bottom-most layer, behind every other element on the screen. See
          components/AuthBackground.tsx for why sign-up and log-in get two
          different treatments here rather than one shared background. */}
      <AuthBackground variant={isSignUp ? 'signup' : 'login'} />

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
              error={emailError}
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
            {/* Visible as soon as sign-up starts, not just after a failed
                submit — the whole point is the user sees the bar to clear
                before they hit it, not after. */}
            {isSignUp && <PasswordStrengthChecklist password={password} palette={palette} />}
            {/* Log-in only — a sign-up form has no existing password to
                forget yet. Also gated on FORGOT_PASSWORD_ENABLED above. */}
            {!isSignUp && FORGOT_PASSWORD_ENABLED && (
              <Pressable
                onPress={() => navigation.navigate('ForgotPassword')}
                disabled={submitting}
                hitSlop={8}
                style={styles.forgotPasswordRow}
                accessibilityRole="button"
                accessibilityLabel="Forgot password?">
                <Text style={[styles.toggleText, { color: palette.textSecondary }]}>
                  Forgot password?
                </Text>
              </Pressable>
            )}
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
                style={[styles.errorBanner, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite">
                <Ionicons name="warning" size={16} color={palette.danger} />
                <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
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
              <Text style={[styles.toggleText, { color: palette.textSecondary }]}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={[styles.toggleAction, { color: palette.accentText }]}>{isSignUp ? t('logIn') : t('signUp')}</Text>
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
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...type.bodySm,
    flex: 1,
  },
  toggleText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  toggleAction: {
    fontFamily: fontFamily.sansBold,
  },
  forgotPasswordRow: {
    alignSelf: 'flex-end',
  },
});
