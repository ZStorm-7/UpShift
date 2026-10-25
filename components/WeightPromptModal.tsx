// Daily weight prompt. Pops on the first Dashboard visit each day; user
// can log a weight or dismiss with "Skip today". Skipping writes a marker
// to Firestore so the modal doesn't reappear until tomorrow.

import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import haptics from '../services/haptics';
import { useLanguage } from '../i18n/LanguageContext';

type Props = {
  visible: boolean;
  currentWeight: number | null;
  onSubmit: (weightLbs: number) => Promise<void>;
  onSkip: () => Promise<void>;
};

export default function WeightPromptModal({ visible, currentWeight, onSubmit, onSkip }: Props) {
  const palette = usePalette();
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0 || num > 1500) {
      // Silently reject — the input's border will color to indicate error
      // (see the numeric check on `value` below).
      return;
    }
    setSubmitting(true);
    haptics.setComplete();
    try {
      await onSubmit(Math.round(num * 10) / 10);
    } finally {
      setSubmitting(false);
      setValue('');
    }
  }

  async function handleSkip() {
    haptics.selection();
    await onSkip();
  }

  const num = parseFloat(value);
  const valid = value.length > 0 && Number.isFinite(num) && num > 0 && num < 1500;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip} accessibilityLabel={t('weightTitle')}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.scrim, { backgroundColor: palette.scrim }]}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>{t('weightTitle')}</Text>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {currentWeight
              ? t('weightSubLast').replace('{n}', String(currentWeight))
              : t('weightSubNew')}
          </Text>

          <View style={[styles.inputRow, { borderColor: valid || value === '' ? palette.borderStrong : palette.danger }]}>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={currentWeight ? String(currentWeight) : '175'}
              placeholderTextColor={palette.textMuted}
              keyboardType="decimal-pad"
              style={[styles.input, { color: palette.textPrimary }]}
              autoFocus
              onSubmitEditing={valid ? handleSubmit : undefined}
              returnKeyType="done"
              accessibilityLabel={t('weightInputLabel')}
            />
            <Text style={[styles.unit, { color: palette.textMuted }]}>lbs</Text>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!valid || submitting}
            style={[
              styles.save,
              { backgroundColor: palette.accent },
              (!valid || submitting) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('weightSaveLabel')}>
            <Text style={[styles.saveText, { color: palette.textOnAccent }]}>
              {submitting ? t('weightSaving') : t('weightSave')}
            </Text>
          </Pressable>

          <Pressable onPress={handleSkip} hitSlop={12} style={styles.skip}>
            <Text style={[styles.skipText, { color: palette.textMuted }]}>{t('weightSkip')}</Text>
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
  inputRow: {
    flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm,
    borderBottomWidth: 2, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  // minWidth 0 lets the field shrink inside the row (web gives inputs an intrinsic width that spilled past the card).
  input: { flex: 1, minWidth: 0, fontFamily: fontFamily.sansBlack, fontSize: 42, lineHeight: 48, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  unit:  { fontFamily: fontFamily.sansBold, fontSize: 18 },
  save: {
    borderRadius: radius.lg, paddingVertical: spacing.md,
    alignItems: 'center', marginTop: spacing.md,
  },
  saveText: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  skip: { alignSelf: 'center', paddingVertical: spacing.sm },
  skipText: { fontFamily: fontFamily.sans, fontSize: 13, textDecorationLine: 'underline' },
});
