// WeightScreen — the dedicated weight-tracking screen reached from the
// Dashboard nav row.
//
// Weight already had a full read/write story before this screen existed —
// firebase/weight.ts's upsertTodayWeight/latestWeight/weightChange, and
// DashboardScreen's own quick-log modal + daily WeightPromptModal both use
// it. This screen is a THIRD entry point into that same data, not a new
// system: it reads the same `users/{uid}/meta/weightLog` doc and writes
// through the same upsertTodayWeight helper, so a weigh-in logged here,
// from the Dashboard modal, or from the daily prompt all agree immediately
// — there's exactly one log, however you get to it.

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getDoc, setDoc } from 'firebase/firestore';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar, Button, Field } from '../components/ui';
import { useUser } from '../context/UserContext';
import { weightLogDocRef, upsertTodayWeight, latestWeight, weightChange, WeightEntry } from '../firebase/weight';
import { safeGoBack } from '../utils/nav';
import haptics from '../services/haptics';

export default function WeightScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    getDoc(weightLogDocRef(authUser.uid))
      .then(snap => setEntries((snap.data()?.entries as WeightEntry[]) || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [authUser?.uid]);

  const current = latestWeight(entries);
  const change = weightChange(entries);

  const saveWeight = async () => {
    if (!authUser || saving) return;
    const value = parseFloat(weightInput);
    if (!value || value <= 0 || value > 1000) {
      setError('Enter a weight between 1 and 1000 lbs.');
      return;
    }
    setError('');
    setSaving(true);
    const updated = upsertTodayWeight(entries, value);
    try {
      await setDoc(weightLogDocRef(authUser.uid), { entries: updated });
      setEntries(updated);
      setWeightInput('');
      haptics.setComplete();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Most recent first — the log itself stays oldest-first (upsertTodayWeight
  // sorts that way so weightChange's "first vs last" math holds), this just
  // reverses for display since "what did I weigh most recently" is the
  // question this list answers.
  const recentFirst = [...entries].reverse();

  return (
    <Screen scroll>
      <AppBar title="Weight" onBack={() => safeGoBack(navigation)} />

      <View style={[styles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.summaryValue, { color: palette.textPrimary }]}>
          {current ? `${current.weightLbs}` : '—'}
          <Text style={[styles.summaryUnit, { color: palette.textMuted }]}> lbs</Text>
        </Text>
        {change !== null && change !== 0 && (
          <Text style={[styles.summaryChange, { color: change > 0 ? palette.loss : palette.success }]}>
            {change > 0 ? '+' : ''}{change} lbs since your first log
          </Text>
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>LOG TODAY'S WEIGHT</Text>
      <Field
        placeholder="e.g. 150"
        value={weightInput}
        onChangeText={setWeightInput}
        keyboardType="numeric"
      />
      {error !== '' && <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>}
      <Button
        label={saving ? 'Saving…' : 'Save weight'}
        onPress={saveWeight}
        disabled={saving || !weightInput}
        fullWidth
        style={styles.saveButton}
      />

      <Text style={[styles.sectionLabel, { color: palette.textMuted, marginTop: spacing.xl }]}>HISTORY</Text>
      {loading ? null : recentFirst.length === 0 ? (
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Nothing logged yet — your first entry starts the trend line.
        </Text>
      ) : (
        <View style={[styles.historyCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {recentFirst.map((entry, i) => (
            <View key={entry.date}>
              {i > 0 && <View style={[styles.rowDivider, { backgroundColor: palette.divider }]} />}
              <View style={styles.historyRow}>
                <Text style={[styles.historyDate, { color: palette.textSecondary }]}>{entry.date}</Text>
                <Text style={[styles.historyValue, { color: palette.textPrimary }]}>{entry.weightLbs} lbs</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  summaryValue: { fontFamily: fontFamily.sansBlack, fontSize: 44 },
  summaryUnit: { fontFamily: fontFamily.sans, fontSize: 18 },
  summaryChange: { fontFamily: fontFamily.sansBold, fontSize: 14 },
  sectionLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorText: { fontFamily: fontFamily.sans, fontSize: 13, marginTop: spacing.xs },
  saveButton: { marginTop: spacing.sm },
  emptyText: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  historyCard: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    paddingHorizontal: spacing.lg,
  },
  rowDivider: { height: layout.hairline },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  historyDate: { fontFamily: fontFamily.sans, fontSize: 14 },
  historyValue: { fontFamily: fontFamily.sansBold, fontSize: 15 },
});
