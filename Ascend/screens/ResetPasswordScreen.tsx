// ResetPasswordScreen — step two of the PIN-based password reset. Takes
// the 6-digit code ForgotPasswordScreen just requested, plus a new
// password, and submits both together to verifyPinAndResetPassword (see
// firebase/passwordReset.ts) — the Cloud Function checks the code and, if
// it matches, sets the new password server-side via the Admin SDK.

import { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Field, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { PasswordStrengthChecklist, isPasswordStrong } from '../components/PasswordStrength';
import { requestPasswordResetPin, verifyPinAndResetPassword } from '../firebase/passwordReset';
import haptics from '../services/haptics';

export default function ResetPasswordScreen({ navigation, route }: any) {
  const palette = usePalette();
  const email: string = route?.params?.email ?? '';
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const inFlight = useRef(false);

  const disabled = submitting || pin.length !== 6 || !isPasswordStrong(password);

  async function handleSubmit() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      await verifyPinAndResetPassword(email, pin, password);
      haptics.goalMet();
      // Straight back to a fresh log-in with the new password — mirrors
      // how a successful sign-up/log-in already replaces the whole stack
      // rather than pushing on top of the auth screens.
      navigation.reset({ index: 0, routes: [{ name: 'Auth', params: { mode: 'login' } }] });
    } catch (err: any) {
      haptics.error();
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending) return;
    setResending(true);
    setError('');
    try {
      await requestPasswordResetPin(email);
      haptics.setComplete();
      setResent(true);
    } catch (err: any) {
      haptics.error();
      setError(err?.message || 'Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen>
      <AppBar title="Enter your code" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Enter index={0}>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            We sent a 6-digit code to {email}. Enter it below along with your new password.
          </Text>
        </Enter>
        <Enter index={1} style={styles.form}>
          <Field
            label="6-digit code"
            value={pin}
            onChangeText={(v) => setPin(v.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="numeric"
            maxLength={6}
            returnKeyType="next"
          />
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={disabled ? undefined : handleSubmit}
          />
          <PasswordStrengthChecklist password={password} palette={palette} />
        </Enter>

        {!!error && (
          <Enter index={0}>
            <View style={[styles.errorBanner, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }]}>
              <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
            </View>
          </Enter>
        )}

        <Enter index={2}>
          <Button
            label={submitting ? 'Resetting…' : 'Reset password'}
            onPress={handleSubmit}
            disabled={disabled}
            fullWidth
          />
        </Enter>

        <Enter index={3}>
          <Pressable onPress={handleResend} disabled={resending} hitSlop={8}>
            <Text style={[styles.resendText, { color: palette.textSecondary }]}>
              {resending
                ? 'Sending…'
                : resent
                ? 'Code resent — check your email'
                : "Didn't get a code? "}
              {!resending && !resent && (
                <Text style={[styles.resendAction, { color: palette.accentText }]}>Resend it</Text>
              )}
            </Text>
          </Pressable>
        </Enter>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
  body: {
    ...type.body,
  },
  form: {
    gap: spacing.md,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  resendText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  resendAction: {
    fontFamily: fontFamily.sansBold,
  },
});
