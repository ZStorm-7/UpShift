// Small pieces of the Workout screen: the rest countdown, the how-to card and the set logger.

import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { spacing, radius, layout } from '../../theme/tokens';
import { fontFamily } from '../../theme/fonts';
import { usePalette } from '../../theme/themedColors';
import { useLanguage } from '../../i18n/LanguageContext';
import { clockMmSs, restRemaining } from '../../services/training/rest';
import { guideFor } from '../../data/exerciseGuides';
import type { Suggestion } from '../../services/training/progression';
import haptics from '../../services/haptics';
import sound from '../../services/sound';

const fmt = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
export const fill = fmt;

/** Counts down to a wall-clock end time and tells the person when rest is over. */
export function RestTimerBar({ endAt, onSkip, onAdd, onDone }: { endAt: number; onSkip: () => void; onAdd: () => void; onDone: () => void }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const [left, setLeft] = useState(() => restRemaining(endAt, Date.now()));
  const finished = useRef(false);
  useEffect(() => { finished.current = false; setLeft(restRemaining(endAt, Date.now())); }, [endAt]);
  useEffect(() => {
    const id = setInterval(() => {
      const r = restRemaining(endAt, Date.now());
      setLeft(r);
      if (r <= 0 && !finished.current) { finished.current = true; haptics.goalMet(); sound.restTimerEnd(); onDone(); }
    }, 250);
    return () => clearInterval(id);
  }, [endAt, onDone]);
  return (
    <View style={[styles.restBar, { backgroundColor: palette.surfaceRaised, borderColor: palette.borderStrong }]} accessibilityLiveRegion="polite">
      <View style={{ flex: 1 }}>
        <Text style={[styles.restLabel, { color: palette.textMuted }]}>{t('wkRest').toUpperCase()}</Text>
        <Text style={[styles.restTime, { color: palette.textPrimary }]} accessibilityLabel={`${t('wkRest')} ${clockMmSs(left)}`}>{clockMmSs(left)}</Text>
      </View>
      <Pressable onPress={onAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('wkAdd15')} style={[styles.restBtn, { borderColor: palette.border }]}>
        <Text style={[styles.restBtnText, { color: palette.textPrimary }]}>{t('wkAdd15')}</Text>
      </Pressable>
      <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('wkSkipRest')} style={[styles.restBtn, { backgroundColor: palette.accent, borderColor: palette.accent }]}>
        <Text style={[styles.restBtnText, { color: palette.textOnAccent }]}>{t('wkSkipRest')}</Text>
      </Pressable>
    </View>
  );
}

export function ExerciseGuideCard({ name }: { name: string }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const g = guideFor(name);
  if (!g) return null;
  return (
    <View style={[styles.guide, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
      <Text style={[styles.guideMuscles, { color: palette.textMuted }]}>{g.muscles.toUpperCase()}</Text>
      <Text style={[styles.guideHead, { color: palette.textSecondary }]}>{t('wkHowTo')}</Text>
      <Text style={[styles.guideBody, { color: palette.textPrimary }]}>{g.cue}</Text>
      <Text style={[styles.guideHead, { color: palette.textSecondary }]}>{t('wkMistake')}</Text>
      <Text style={[styles.guideBody, { color: palette.textPrimary }]}>{g.mistake}</Text>
    </View>
  );
}

export type SetRow = { weight: string; reps: string; done: boolean };

const reasonKey = { start: null, 'add-weight': 'wkReasonAddWeight', 'add-reps': 'wkReasonAddReps', repeat: 'wkReasonRepeat', ease: 'wkReasonEase' } as const;

export function SuggestionLine({ s, last }: { s: Suggestion; last: { weight: number; reps: number } | null }) {
  const palette = usePalette();
  const { t } = useLanguage();
  const lastTxt = last ? (last.weight > 0 ? fmt(t('wkLast'), { w: last.weight, r: last.reps }) : fmt(t('wkLastReps'), { r: last.reps })) : null;
  const tryTxt = s.weight > 0 ? fmt(t('wkTry'), { w: s.weight, r: s.reps }) : fmt(t('wkTryReps'), { r: s.reps });
  const why = reasonKey[s.reason] ? t(reasonKey[s.reason] as any) : null;
  return (
    <View style={{ gap: 2 }}>
      {!!lastTxt && <Text style={[styles.sugLast, { color: palette.textMuted }]}>{lastTxt}</Text>}
      <Text style={[styles.sugTry, { color: palette.accent }]}>{tryTxt}</Text>
      {!!why && <Text style={[styles.sugWhy, { color: palette.textSecondary }]}>{why}</Text>}
    </View>
  );
}

export function SetLogger({ rows, onChange, onToggle }: { rows: SetRow[]; onChange: (i: number, patch: Partial<SetRow>) => void; onToggle: (i: number) => void }) {
  const palette = usePalette();
  const { t } = useLanguage();
  return (
    <View style={{ gap: spacing.sm }}>
      {rows.map((r, i) => (
        <View key={i} style={styles.setRow}>
          <Text style={[styles.setN, { color: palette.textMuted }]}>{fmt(t('wkSetN'), { n: i + 1 })}</Text>
          <TextInput
            value={r.weight} onChangeText={v => onChange(i, { weight: v.replace(/[^0-9.,]/g, '').slice(0, 7) })}
            placeholder={t('wkWeight')} placeholderTextColor={palette.textMuted} keyboardType="decimal-pad" maxLength={7}
            accessibilityLabel={`${t('wkWeight')}, ${fmt(t('wkSetN'), { n: i + 1 })}`}
            style={[styles.input, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }]} />
          <TextInput
            value={r.reps} onChangeText={v => onChange(i, { reps: v.replace(/[^0-9]/g, '').slice(0, 3) })}
            placeholder={t('wkReps')} placeholderTextColor={palette.textMuted} keyboardType="number-pad" maxLength={3}
            accessibilityLabel={`${t('wkReps')}, ${fmt(t('wkSetN'), { n: i + 1 })}`}
            style={[styles.input, { color: palette.textPrimary, borderColor: palette.border, backgroundColor: palette.surfaceRaised }]} />
          <Pressable
            onPress={() => onToggle(i)} hitSlop={6} accessibilityRole="checkbox" accessibilityState={{ checked: r.done }} aria-checked={r.done}
            accessibilityLabel={fmt(t('wkSetDone'), { n: i + 1 })}
            style={[styles.check, { borderColor: r.done ? palette.accent : palette.borderStrong, backgroundColor: r.done ? palette.accent : 'transparent' }]}>
            <Text style={{ color: r.done ? palette.textOnAccent : palette.textMuted, fontFamily: fontFamily.sansBold }}>{r.done ? '✓' : ''}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  restBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, borderWidth: layout.hairline, padding: spacing.md },
  restLabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8 },
  restTime: { fontFamily: fontFamily.sansBlack, fontSize: 28 },
  restBtn: { minHeight: 44, minWidth: 56, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: layout.hairline, alignItems: 'center', justifyContent: 'center' },
  restBtnText: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  guide: { borderRadius: radius.md, borderWidth: layout.hairline, padding: spacing.md, gap: 4 },
  guideMuscles: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8 },
  guideHead: { fontFamily: fontFamily.sansBold, fontSize: 12, marginTop: 4 },
  guideBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  sugLast: { fontFamily: fontFamily.sans, fontSize: 12 },
  sugTry: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  sugWhy: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 17 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setN: { fontFamily: fontFamily.sansBold, fontSize: 12, width: 48 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.md, borderWidth: layout.hairline, paddingHorizontal: spacing.md, fontFamily: fontFamily.sansBold, fontSize: 16 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
