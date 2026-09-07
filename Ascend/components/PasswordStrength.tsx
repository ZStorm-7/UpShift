// Password strength checklist — shown under the password field on sign-up
// so the requirement is visible BEFORE the user submits and gets bounced
// back with an error, rather than something Firebase only tells them about
// after they've already tried.
//
// The rules are deliberately ordinary (length + the three character
// classes + one special character) rather than anything exotic — the goal
// is nudging people off "password1" and single-word passwords, not a
// security audit. `isPasswordStrong` is the single source of truth for
// what "all checkmarks" means, so the checklist UI and the submit button's
// disabled state can never disagree about it.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, type } from '../theme/tokens';
import { Palette } from '../theme/themedColors';

export const PASSWORD_RULES: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { key: 'number', label: 'One number', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
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
