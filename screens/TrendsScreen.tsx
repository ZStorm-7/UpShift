// Trends that explain: patterns in the last four weeks of the person's own days.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen, AppBar, Card } from '../components/ui';
import { spacing, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { loadDaySummaries } from '../firebase/weekly';
import { buildInsights, lastDays, type Insight } from '../services/insights/trends';

const fmt = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), s);
const COMPARE_KEY = {
  'goodSleep:water': 'trGoodSleepWater', 'goodSleep:workoutRate': 'trGoodSleepWorkoutRate', 'goodSleep:calories': 'trGoodSleepCalories',
  'workout:water': 'trWorkoutWater', 'workout:sleep': 'trWorkoutSleep', 'workout:calories': 'trWorkoutCalories',
} as const;
const METRIC_KEY = { water: 'trMetricWater', sleep: 'trMetricSleep', calories: 'trMetricCalories', workouts: 'trMetricWorkouts' } as const;

export default function TrendsScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { t } = useLanguage();
  const [insights, setInsights] = useState<Insight[] | null>(null);

  useEffect(() => {
    if (!authUser) return;
    let alive = true;
    loadDaySummaries(authUser.uid, lastDays(new Date(), 28))
      .then(days => alive && setInsights(buildInsights(days)))
      .catch(() => alive && setInsights([]));
    return () => { alive = false; };
  }, [authUser?.uid]);

  const text = (i: Insight): string => i.kind === 'compare'
    ? fmt(t(COMPARE_KEY[`${i.cause}:${i.effect}` as keyof typeof COMPARE_KEY] as any), { a: i.with, b: i.without })
    : fmt(t((i.pct > 0 ? 'trTrendUp' : 'trTrendDown') as any), { metric: t(METRIC_KEY[i.metric] as any), pct: Math.abs(i.pct), from: i.from, to: i.to });

  return (
    <Screen scroll>
      <AppBar title={t('trTitle')} onBack={() => navigation.goBack()} />
      <View style={styles.body}>
        <Text style={[styles.intro, { color: palette.textSecondary }]}>{t('trIntro')}</Text>
        {insights === null ? (
          <ActivityIndicator color={palette.accent} />
        ) : insights.length === 0 ? (
          <Card><Text style={[styles.line, { color: palette.textPrimary }]}>{t('trNone')}</Text></Card>
        ) : insights.map((i, n) => (
          <Card key={n}>
            <Text style={[styles.line, { color: palette.textPrimary }]}>{text(i)}</Text>
            {i.kind === 'compare' && <Text style={[styles.note, { color: palette.textSecondary }]}>{fmt(t('trBasedOn'), { n1: i.nWith, n2: i.nWithout })}</Text>}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: layout.bottomInset },
  intro: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  line: { fontFamily: fontFamily.sansSemi, fontSize: 16, lineHeight: 23 },
  note: { fontFamily: fontFamily.sans, fontSize: 13, marginTop: spacing.xs },
});
