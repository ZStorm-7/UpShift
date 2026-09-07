import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import haptics from '../services/haptics';

type Props = {
  visible: boolean;
  onSubmit: (hours: number) => Promise<void>;
  onSkip: () => Promise<void>;
};

export default function SleepPromptModal({ visible, onSubmit, onSkip }: Props) {
  const palette = usePalette();
  const [submitting, setSubmitting] = useState(false);

  async function handleQuickPick(hours: number) {
    if (submitting) return;
    setSubmitting(true);
    haptics.setComplete();
    try {
      await onSubmit(hours);
    } finally {
      setSubmitting(false);
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
          <Text style={[styles.title, { color: palette.textPrimary }]}>How'd you sleep?</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            How many hours did you sleep last night?
          </Text>

          <View style={styles.quickRow}>
            {[5, 6, 7, 8, 9, 10].map(h => (
              <Pressable
                key={h}
                onPress={() => handleQuickPick(h)}
                disabled={submitting}
                style={[
                  styles.quickBtn,
                  { backgroundColor: palette.accentSoft, borderColor: palette.accentBorder },
                  submitting && { opacity: 0.5 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${h} hours`}>
                <Text style={[styles.quickBtnText, { color: palette.accentText }]}>{h}h</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={handleSkip} hitSlop={12} style={styles.skip}>
            <Text style={[styles.skipText, { color: palette.textMuted }]}>Skip today</Text>
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
  title: { fontFamily: fontFamily.serif, fontSize: 24 },
  subtitle: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  quickRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.sm, marginTop: spacing.sm,
    justifyContent: 'center',
  },
  quickBtn: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, borderWidth: layout.hairline,
    minWidth: 56, alignItems: 'center',
  },
  quickBtnText: { fontFamily: fontFamily.sansBold, fontSize: 16 },
  skip: { alignSelf: 'center', paddingVertical: spacing.sm },
  skipText: { fontFamily: fontFamily.sans, fontSize: 13, textDecorationLine: 'underline' },
});
