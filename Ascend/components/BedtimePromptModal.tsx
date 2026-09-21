// One-time, first-login bedtime-reminder prompt. Shown exactly once per
// user — the very first time they land on the Dashboard after finishing
// onboarding — then never again (see DashboardScreen's
// users/{uid}/meta/onboarding.bedtimePromptShown flag). Replaces the old
// daily forced-navigation sleep popup: this asks ONLY about a bedtime
// reminder, nothing about sleep hours. The user can still change the
// bedtime and toggle the reminder later from SleepScreen.

import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import haptics from '../services/haptics';

type Props = {
  visible: boolean;
  defaultHour: number;
  defaultMinute: number;
  onConfirm: (hour: number, minute: number) => Promise<void>;
  onSkip: () => Promise<void>;
};

// Same "10:30 PM" / 24-hour parser SleepScreen uses for its bedtime field —
// duplicated here (rather than imported) since SleepScreen doesn't export
// it and this modal has no other reason to depend on that screen.
function parseTimeToMinutes(input: string): number | null {
  const trimmed = input.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default function BedtimePromptModal({ visible, defaultHour, defaultMinute, onConfirm, onSkip }: Props) {
  const palette = usePalette();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const typed = value.trim();
    let hour = defaultHour;
    let minute = defaultMinute;
    if (typed.length > 0) {
      const minutes = parseTimeToMinutes(typed);
      if (minutes === null) {
        setError('Use a format like "10:30 PM".');
        return;
      }
      hour = Math.floor(minutes / 60);
      minute = minutes % 60;
    }
    setError('');
    setSubmitting(true);
    haptics.setComplete();
    try {
      await onConfirm(hour, minute);
    } finally {
      setSubmitting(false);
      setValue('');
    }
  }

  async function handleSkip() {
    haptics.selection();
    await onSkip();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.scrim, { backgroundColor: palette.scrim }]}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Set a bedtime reminder?</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            We'll nudge you to start winding down at {formatTime(defaultHour, defaultMinute)}, or pick your own
            time below. You can change this anytime from the Sleep screen.
          </Text>

          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={formatTime(defaultHour, defaultMinute)}
            placeholderTextColor={palette.textMuted}
            style={[styles.input, { color: palette.textPrimary, borderColor: palette.borderStrong }]}
            autoCapitalize="characters"
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            accessibilityLabel="Bedtime"
          />
          {error !== '' && <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>}

          <Pressable
            onPress={handleConfirm}
            disabled={submitting}
            style={[styles.save, { backgroundColor: palette.accent }, submitting && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Enable bedtime reminder">
            <Text style={[styles.saveText, { color: palette.textOnAccent }]}>
              {submitting ? 'Saving…' : 'Enable reminder'}
            </Text>
          </Pressable>

          <Pressable onPress={handleSkip} hitSlop={12} style={styles.skip}>
            <Text style={[styles.skipText, { color: palette.textMuted }]}>Not now</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%', maxWidth: 400,
    borderRadius: radius.xl, borderWidth: layout.hairline,
    padding: spacing.xl, gap: spacing.md,
  },
  title: { fontFamily: fontFamily.serif, fontSize: 22 },
  subtitle: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  input: {
    fontFamily: fontFamily.sansBold, fontSize: 18,
    borderWidth: layout.hairline, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    textAlign: 'center', marginTop: spacing.sm,
  },
  errorText: { fontFamily: fontFamily.sans, fontSize: 12 },
  save: {
    borderRadius: radius.lg, paddingVertical: spacing.md,
    alignItems: 'center', marginTop: spacing.md,
  },
  saveText: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  skip: { alignSelf: 'center', paddingVertical: spacing.sm },
  skipText: { fontFamily: fontFamily.sans, fontSize: 13, textDecorationLine: 'underline' },
});
