// ForgotPasswordScreen — the first step of the PIN-based password reset,
// reached from AuthScreen's "Forgot password?" link (log-in mode only).
// Collects the email, requests a 6-digit code (see
// firebase/passwordReset.ts), and hands off to ResetPasswordScreen to
// enter that code alongside a new password.

import { useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, type } from '../theme/tokens';
import { Screen, AppBar, Field, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { requestPasswordResetPin } from '../firebase/passwordReset';
import haptics from '../services/haptics';

export default function ForgotPasswordScreen({ navigation }: any) {
  const palette = usePalette();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit() {
    if (inFlight.current || !email) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordResetPin(email.trim());
      haptics.setComplete();
      navigation.navigate('ResetPassword', { email: email.trim() });
    } catch (err: any) {
      haptics.error();
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <AppBar title="Forgot password" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Enter index={0}>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Enter the email address on your account and we'll send you a 6-digit code to reset your
            password.
          </Text>
        </Enter>
        <Enter index={1} style={styles.form}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={email ? handleSubmit : undefined}
          />
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
            label={submitting ? 'Sending…' : 'Send code'}
            onPress={handleSubmit}
            disabled={!email || submitting}
            fullWidth
          />
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
});
