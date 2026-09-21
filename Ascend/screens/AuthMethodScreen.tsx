// The "choose a sign-in method" screen — reached from BOTH of Welcome's
// buttons ("Log In" and "Get Started"), which pass a `mode: 'login' |
// 'signup'` route param so this one component can adjust its heading/copy
// without needing two near-identical files.
//
// The Apple / Google / phone-number LOGIC below is moved here verbatim from
// the previous single-screen AuthScreen, not rewritten — see each block's
// original comments (kept intact) for why it's built the way it is. Only
// "Continue with email" is new: it hands off to the trimmed-down AuthScreen,
// which now owns just the plain email/password form.

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../context/UserContext';
import { usePalette, useTheme } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { Screen, Field, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE } from '../components/Splash';
import AuthTransition from '../components/AuthTransition';
import { getAuthErrorMessage } from '../firebase/authErrors';
import haptics from '../services/haptics';
import { useLanguage } from '../i18n/LanguageContext';
import { withMinDuration, withTimeout, AUTH_TRANSITION_MS, AUTH_TIMEOUT_MS } from '../utils/timing';
import { auth, firebaseConfig } from '../firebase/config';
import CountryCodePicker from '../components/CountryCodePicker';
import { DEFAULT_COUNTRY, composeE164, extractDigits, formatPhoneDisplay, type Country } from '../utils/phone';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPhoneNumber,
  type AuthCredential,
  type ConfirmationResult,
} from 'firebase/auth';

// ---- Google Sign-In -------------------------------------------------
//
// Uses expo-auth-session's dedicated Google provider (Google.useIdTokenAuthRequest)
// rather than the heavier native @react-native-google-signin/google-signin —
// this keeps sign-in a JS-only, web-based OAuth flow with no native config/
// linking step. NOTE ON CURRENCY: as of this writing, Expo's own docs mark
// the `GoogleAuthRequestConfig` type this hook takes as "@deprecated" and
// point new projects at @react-native-google-signin/google-signin instead —
// but the hook itself is still shipped, typed, and functional in the
// installed expo-auth-session@57.0.12. Given the explicit ask to avoid the
// native module's linking step, this is the supported-enough middle ground;
// revisit if a future expo-auth-session release drops the provider outright.
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

// Required once per app for the in-app browser used by the Google OAuth
// flow to close itself and hand control back to the app after redirecting —
// without this the browser sheet can be left open after a successful
// sign-in on some platforms.
WebBrowser.maybeCompleteAuthSession();

// ---- Apple Sign-In ----------------------------------------------------
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

// ---- Phone Sign-In ------------------------------------------------------
//
// expo-firebase-recaptcha provides the invisible WebView-based reCAPTCHA
// that Firebase JS SDK's signInWithPhoneNumber needs as an "applicationVerifier"
// on native platforms (there's no native app-attestation hook for the plain
// Firebase JS SDK the way there is for @react-native-firebase). IMPORTANT
// CAVEAT, surfaced here rather than left silent: this package was removed
// from Expo's own SDK docs as of SDK 48 and its last real release (2.3.1)
// shipped in 2022 — it is effectively unmaintained. It still installs and
// types cleanly against SDK 57 today, but it has never been updated for
// React Native's New Architecture, which this app's `react-native-worklets`
// dependency implies is in play. Loaded defensively (try/catch, like
// services/notifications.ts's pattern for expo-notifications) so that if it
// fails to load or render on a given device/build, phone sign-in hides
// itself instead of crashing the whole screen. If it turns out not to
// render at all in practice, the two real alternatives are (a) migrating to
// @react-native-firebase, which has native Play Integrity/App Check-backed
// phone auth with no WebView reCAPTCHA needed, or (b) hand-rolling a small
// WebView that loads Google's reCAPTCHA JS directly.
let FirebaseRecaptchaVerifierModal: typeof import('expo-firebase-recaptcha').FirebaseRecaptchaVerifierModal | null = null;
try {
  FirebaseRecaptchaVerifierModal = require('expo-firebase-recaptcha').FirebaseRecaptchaVerifierModal;
} catch {
  FirebaseRecaptchaVerifierModal = null;
}

// The try/catch above only guards a failed IMPORT — it does nothing for a
// failed RENDER, which is exactly what this package does in practice: it
// throws during mount (observed: "Firebase: No Firebase App '[DEFAULT]' has
// been created" — the package's bundled compat-SDK code reaching for a
// legacy `firebase.app()` this project's modular v9+ SDK never registers).
// A render-phase throw with no local boundary would propagate up to the
// app's top-level ErrorBoundary (components/ErrorBoundary.tsx) and take the
// ENTIRE screen down for every visitor, not just the ones who tap "Continue
// with phone number" — unacceptable blast radius for one experimental,
// unmaintained option among several sign-in methods. This tiny local
// boundary contains that failure to just the phone card: on error, it calls
// back so the parent can hide the phone option entirely instead of leaving a
// permanently-broken control on screen.
class RecaptchaBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// The chevron only, at two-thirds of the splash's size — Welcome has just
// shown the full lockup one screen ago.
const MARK_WIDTH = 44;
const MARK_HEIGHT = 38;

// ---- Google client IDs --------------------------------------------------
//
// Set by the app's developer, not by this code. Left blank, the Google
// button below hides itself rather than crashing — same graceful-
// degradation shape as services/foodRecognition.ts's missing
// EXPO_PUBLIC_GEMINI_API_KEY handling.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const GOOGLE_CONFIGURED = !!(GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID);
// Google.useIdTokenAuthRequest THROWS synchronously during render — not a
// rejected promise, an actual thrown Error — when `webClientId` is missing
// AND the app is running on the web target specifically. Fed placeholder
// non-empty strings when unconfigured so the hook's own internal validation
// never sees an undefined value — the button itself still stays hidden via
// GOOGLE_CONFIGURED below, so these placeholders are never actually used to
// attempt a real sign-in.
const GOOGLE_SAFE_IOS_CLIENT_ID = GOOGLE_IOS_CLIENT_ID || 'unconfigured';
const GOOGLE_SAFE_ANDROID_CLIENT_ID = GOOGLE_ANDROID_CLIENT_ID || 'unconfigured';
const GOOGLE_SAFE_WEB_CLIENT_ID = GOOGLE_WEB_CLIENT_ID || 'unconfigured';

type AuthMethodMode = 'login' | 'signup';

export default function AuthMethodScreen({ navigation, route }: any) {
  const mode: AuthMethodMode = route?.params?.mode === 'login' ? 'login' : 'signup';
  const { loadProfile, registerDeviceSession } = useUser();
  const { t } = useLanguage();
  const palette = usePalette();
  const { mode: themeMode } = useTheme();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Guards against a double submit — see AuthScreen's identical comment on
  // why a ref, not the `submitting` state, is what actually prevents two
  // taps in the same frame both reaching Firebase.
  const inFlight = useRef(false);

  // ---- Apple availability --------------------------------------------
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (!cancelled) setAppleAvailable(available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Google request ---------------------------------------------------
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_SAFE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_SAFE_ANDROID_CLIENT_ID,
    webClientId: GOOGLE_SAFE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        finishCredentialSignIn(credential);
      }
    } else if (googleResponse?.type === 'error') {
      setError(getAuthErrorMessage(googleResponse.error));
      haptics.error();
    }
    // finishCredentialSignIn is stable enough across renders for this
    // effect's purpose — only react to a NEW response object.
  }, [googleResponse]);

  // ---- Phone sign-in state ----------------------------------------------
  const recaptchaVerifierRef = useRef<any>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'entry' | 'code'>('entry');
  // Raw national-number digits only (no dashes, no dial code) — the display
  // string is derived from this on every render via formatPhoneDisplay, and
  // the E.164 string Firebase actually needs is assembled from this plus
  // `country.dialCode` via composeE164. Keeping exactly one source of truth
  // for the digits is what stops the dashed display and the wire format
  // from ever disagreeing with each other.
  const [phoneDigits, setPhoneDigits] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);
  // Flipped by RecaptchaBoundary if expo-firebase-recaptcha throws during
  // mount — hides the phone option entirely rather than leaving a
  // permanently non-functional button on screen.
  const [phoneBroken, setPhoneBroken] = useState(false);

  function reportError(err: any) {
    const message = getAuthErrorMessage(err);
    setError(message);
    haptics.error();
  }

  // Shared tail end for every credential-based sign-in (Google, Apple,
  // phone) — a credential sign-in can just as easily be a brand-new user as
  // a returning one, so it needs the same loadProfile -> Dashboard/
  // Onboarding branch AuthScreen's log-in path uses. This logic is
  // unchanged from the original AuthScreen — only relocated.
  async function finishCredentialSignIn(credential: AuthCredential) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      const target = await withMinDuration(
        withTimeout(
          (async () => {
            const userCredential = await signInWithCredential(auth, credential);
            await registerDeviceSession(userCredential.user.uid);
            const hasProfile = await loadProfile(userCredential.user.uid);
            return hasProfile ? 'Dashboard' : 'Onboarding';
          })(),
          AUTH_TIMEOUT_MS
        ),
        AUTH_TRANSITION_MS
      );
      navigation.replace(target);
    } catch (err: any) {
      reportError(err);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleGooglePress() {
    setError('');
    try {
      await promptGoogleAsync();
    } catch (err: any) {
      reportError(err);
    }
  }

  async function handleAppleSignIn() {
    setError('');
    try {
      // A fresh raw nonce per attempt, hashed for Apple (it only ever sees
      // the digest) and passed raw to Firebase, which hashes it again itself
      // to confirm it matches what Apple was given — the standard
      // replay-protection handshake for Sign in with Apple + Firebase.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!appleCredential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: appleCredential.identityToken,
        rawNonce,
      });
      await finishCredentialSignIn(firebaseCredential);
    } catch (err: any) {
      // Apple's own button throws this specific code when the user backs out
      // of the system sheet — not a failure worth a red banner.
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      reportError(err);
    }
  }

  async function handleSendCode() {
    if (!recaptchaVerifierRef.current || !phoneDigits) return;
    setError('');
    setPhoneSubmitting(true);
    try {
      // E.164 assembly happens exactly once, right at the Firebase call —
      // everywhere else in this screen deals only in the dashed display
      // string or the raw digits, never this wire format.
      const e164 = composeE164(country.dialCode, phoneDigits);
      const result = await signInWithPhoneNumber(auth, e164, recaptchaVerifierRef.current);
      confirmationRef.current = result;
      setPhoneStep('code');
    } catch (err: any) {
      reportError(err);
    } finally {
      setPhoneSubmitting(false);
    }
  }

  async function handleVerifyCode() {
    if (!confirmationRef.current || !verificationCode.trim()) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      const target = await withMinDuration(
        withTimeout(
          (async () => {
            const userCredential = await confirmationRef.current!.confirm(verificationCode.trim());
            await registerDeviceSession(userCredential.user.uid);
            const hasProfile = await loadProfile(userCredential.user.uid);
            return hasProfile ? 'Dashboard' : 'Onboarding';
          })(),
          AUTH_TIMEOUT_MS
        ),
        AUTH_TRANSITION_MS
      );
      navigation.replace(target);
    } catch (err: any) {
      reportError(err);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const heading = mode === 'login' ? 'Log in to UpShift' : 'Create your account';

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

        <Enter index={2} style={styles.methods}>
          {Platform.OS === 'ios' && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              // Apple's own HIG-mandated component, colour-matched to the
              // app's current theme — Apple's button ignores custom colours
              // by design, so the closest thing to "on-brand" available here
              // is picking the variant that sits naturally against the
              // current bg.
              buttonStyle={
                themeMode === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {GOOGLE_CONFIGURED && (
            <Pressable
              onPress={handleGooglePress}
              disabled={!googleRequest || submitting}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityState={{ disabled: !googleRequest || submitting }}
              style={({ pressed }) => [
                styles.methodButton,
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.methodButtonPressed,
                (!googleRequest || submitting) && styles.methodButtonDisabled,
              ]}>
              <Ionicons name="logo-google" size={18} color={palette.textPrimary} />
              <Text style={[styles.methodButtonLabel, { color: palette.textPrimary }]}>Continue with Google</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => navigation.navigate('Auth', { mode })}
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

          {!!FirebaseRecaptchaVerifierModal && !phoneBroken && (
            <>
              {!phoneOpen ? (
                <Pressable
                  onPress={() => setPhoneOpen(true)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with phone number"
                  style={({ pressed }) => [
                    styles.methodButton,
                    { backgroundColor: palette.surface, borderColor: palette.border },
                    pressed && styles.methodButtonPressed,
                  ]}>
                  <Ionicons name="call-outline" size={18} color={palette.textPrimary} />
                  <Text style={[styles.methodButtonLabel, { color: palette.textPrimary }]}>Continue with phone number</Text>
                </Pressable>
              ) : (
                <View style={styles.phoneBlock}>
                  {phoneStep === 'entry' ? (
                    <>
                      {/* Field has no built-in prefix slot, so the dial-code
                          button and the digit input are composed by hand here
                          rather than forcing that shape onto the shared
                          component for one screen. */}
                      <View>
                        <Text style={[styles.phoneLabel, { color: palette.textMuted }]}>Phone number</Text>
                        <View
                          style={[
                            styles.phoneRow,
                            { backgroundColor: palette.surface, borderColor: palette.border },
                          ]}>
                          <Pressable
                            onPress={() => setCountryPickerOpen(true)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Country code, currently ${country.name}, plus ${country.dialCode}`}
                            style={styles.dialCodeButton}>
                            <Text style={styles.dialCodeFlag}>{country.flag}</Text>
                            <Text style={[styles.dialCodeText, { color: palette.textPrimary }]}>
                              +{country.dialCode}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color={palette.textMuted} />
                          </Pressable>
                          <View style={[styles.phoneDivider, { backgroundColor: palette.border }]} />
                          {/* A bare TextInput rather than the shared `Field`
                              here — Field draws its own border/background,
                              which would nest a second box inside this row's
                              box. This one inherits the row's border/bg and
                              only supplies the text styling, including the
                              same vertical-centering fix applied to Field
                              itself (see components/ui.tsx's `input` style
                              comment) so this one input doesn't regress the
                              same bug in a different component. */}
                          <TextInput
                            style={[styles.phoneInput, { color: palette.textPrimary }]}
                            value={formatPhoneDisplay(phoneDigits)}
                            onChangeText={(text) => setPhoneDigits(extractDigits(text))}
                            placeholder="555-123-4567"
                            placeholderTextColor={palette.textMuted}
                            keyboardType="phone-pad"
                            returnKeyType="send"
                            onSubmitEditing={phoneDigits ? handleSendCode : undefined}
                            accessibilityLabel="Phone number"
                            textAlignVertical="center"
                            underlineColorAndroid="transparent"
                          />
                        </View>
                      </View>
                      <Button
                        label={phoneSubmitting ? t('pleaseWait') : 'Send code'}
                        onPress={handleSendCode}
                        disabled={!phoneDigits || phoneSubmitting || !recaptchaVerifierRef.current}
                        accessibilityState={{ busy: phoneSubmitting }}
                        variant="secondary"
                        fullWidth
                      />
                    </>
                  ) : (
                    <>
                      <Field
                        label="Verification code"
                        accessibilityLabel="Verification code"
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        placeholder="123456"
                        keyboardType="numeric"
                        maxLength={6}
                        returnKeyType="go"
                        onSubmitEditing={verificationCode.trim() ? handleVerifyCode : undefined}
                      />
                      <Button
                        label={submitting ? t('pleaseWait') : 'Verify'}
                        onPress={handleVerifyCode}
                        disabled={!verificationCode.trim() || submitting}
                        accessibilityState={{ busy: submitting }}
                        variant="secondary"
                        fullWidth
                      />
                    </>
                  )}
                </View>
              )}
            </>
          )}
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

      {/* Invisible WebView-based reCAPTCHA required by signInWithPhoneNumber
          on native platforms — see the import comment above for the
          maintenance caveat on this package.
          Lazy-mounted (only once the user actually opens the phone card),
          NOT always-on — mounting it unconditionally on every visit is what
          originally crashed the ENTIRE screen for every visitor (see
          RecaptchaBoundary's comment). Waiting for `phoneOpen` means only
          someone who actually taps "Continue with phone number" can hit
          whatever this package's real failure mode turns out to be, and
          RecaptchaBoundary contains even that to just this option
          disappearing instead of the whole screen going down. */}
      {!!FirebaseRecaptchaVerifierModal && phoneOpen && !phoneBroken && (
        <RecaptchaBoundary onError={() => setPhoneBroken(true)}>
          <FirebaseRecaptchaVerifierModal
            ref={recaptchaVerifierRef}
            firebaseConfig={firebaseConfig}
            attemptInvisibleVerification
          />
        </RecaptchaBoundary>
      )}

      <CountryCodePicker
        visible={countryPickerOpen}
        onClose={() => setCountryPickerOpen(false)}
        onSelect={setCountry}
      />

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
  methodButtonDisabled: {
    opacity: 0.45,
  },
  methodButtonLabel: {
    ...type.button,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  phoneBlock: {
    width: '100%',
    gap: spacing.md,
  },
  phoneLabel: {
    ...type.label,
    textTransform: 'uppercase',
    marginBottom: spacing.xs + 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: layout.hairline,
    borderRadius: radius.md,
  },
  dialCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: 13,
  },
  dialCodeFlag: {
    fontSize: 16,
  },
  dialCodeText: {
    ...type.body,
  },
  phoneDivider: {
    width: layout.hairline,
    alignSelf: 'stretch',
    marginVertical: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
    paddingVertical: 13,
    paddingRight: spacing.lg,
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
