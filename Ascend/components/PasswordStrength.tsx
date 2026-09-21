// Password requirement checklist — shown under the password field on sign-up
// so the requirement is visible BEFORE the user submits and gets bounced
// back with an error, rather than something Firebase only tells them about
// after they've already tried.
//
// Deliberately ONE rule: at least 8 characters. Character-class rules
// (uppercase/number/symbol) were removed on purpose — they measurably push
// people toward predictable mutations ("Password1!") without adding real
// entropy, and NIST's own guidance (SP 800-63B) now advises against
// composition rules for exactly that reason. Length is the requirement that
// actually matters, and it's also the only one Firebase itself enforces.
//
// `isPasswordStrong` stays the single source of truth for "requirement
// met", so the checklist UI and the submit button's disabled state can
// never disagree about it. The Cloud Function that resets a password
// server-side enforces the same >= 8 floor independently — see
// verifyPinAndResetPassword in functions/src/index.ts.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, type } from '../theme/tokens';
import { Palette } from '../theme/themedColors';

export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
];

export function isPasswordStrong(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}

type PasswordStrengthChecklistProps = {
  password: string;
  palette: Palette;
};

export function PasswordStrengthChecklist({ password, palette }: PasswordStrengthChecklistProps) {
  return (
    <View style={styles.root} accessibilityRole="summary" accessibilityLabel="Password requirements">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        return (
          <View key={rule.key} style={styles.row}>
            <Ionicons
              name={met ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={met ? palette.success : palette.textMuted}
            />
            <Text style={[styles.label, { color: met ? palette.textPrimary : palette.textMuted }]}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    ...type.bodySm,
  },
});
