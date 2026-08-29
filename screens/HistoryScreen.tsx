// HistoryScreen — three tabs, each with a graph per metric.
//
//   Nutrition tab:   Calories / Protein / Carbs / Fat / Sugar
//   Body tab:        Weight
//   Activity tab:    Water / Sleep / Workouts
//
// Every graph is a HistoryGraph with 1W / 1M / 3M / All zoom. Data comes
// from the daily documents (calories, water, sleep, workouts, per-day
// macro totals derived from the food log) plus the weight log.
//
// The 7-day cap in the previous screen is lifted — this pulls up to 90
// days by default and the graph itself decides how much to show based on
// the selected range.

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { getDoc } from 'firebase/firestore';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import HistoryGraph, { GraphPoint } from '../components/HistoryGraph';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { dayDocRefForKey, getRecentDayKeys } from '../firebase/progress';
import { weightLogDocRef, WeightEntry } from '../firebase/weight';

const DAYS_LOADED = 90;
const DEFAULT_CALORIE_GOAL = 2000;

type Tab = 'nutrition' | 'body' | 'activity';

type DailyData = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  water: number;
  sleep: number;
  workouts: number;
};

export default function HistoryScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('nutrition');
  const [loading, setLoading] = useState(true);
  const [daily, setDaily]     = useState<DailyData[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);

  const CALORIE_GOAL = profile?.calorieGoal || DEFAULT_CALORIE_GOAL;
  const WATER_GOAL   = profile?.waterGoalMl || 2500;

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const keys = getRecentDayKeys(DAYS_LOADED);
      try {
        // Reads all days in parallel. Slow on a stale account with many
        // days but this only runs on the History tab, not on Dashboard
        // load, so the latency is contained to a screen the user came
        // here explicitly to see.
        const [daySnaps, wSnap] = await Promise.all([
          Promise.all(keys.map(k => getDoc(dayDocRefForKey(authUser.uid, k)))),
          getDoc(weightLogDocRef(authUser.uid)),
        ]);
        if (cancelled) return;
        const buckets: DailyData[] = daySnaps.map((snap, i) => {
          const d = snap.data() || {};
          const foodLog: any[] = d.foodLog || [];
          return {
            date: keys[i],
            calories: foodLog.reduce((s, f) => s + (f.calories || 0), 0),
            protein:  foodLog.reduce((s, f) => s + (f.protein  || 0), 0),
            carbs:    foodLog.reduce((s, f) => s + (f.carbs    || 0), 0),
            fat:      foodLog.reduce((s, f) => s + (f.fat      || 0), 0),
            sugar:    foodLog.reduce((s, f) => s + (f.sugar    || 0), 0),
            water:    d.waterTotal || 0,
            sleep:    d.sleepHours || 0,
            workouts: d.workoutsCompleted || 0,
          };
        });
        setDaily(buckets);
        setWeightEntries((wSnap.data()?.entries as WeightEntry[]) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  const point = (key: keyof DailyData): GraphPoint[] =>
    daily.map(d => ({ date: d.date, value: d[key] as number }));

  const weightPoints: GraphPoint[] = weightEntries.map(w => ({ date: w.date, value: w.weightLbs }));

  return (
    <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
      <AppBar title={t('history') || 'History'} onBack={() => navigation.goBack()} />

      {/* Tab switcher */}
      <View style={[styles.tabs, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
        {([
          { key: 'nutrition', label: 'Nutrition' },
          { key: 'body',      label: 'Body'      },
          { key: 'activity',  label: 'Activity'  },
        ] as { key: Tab; label: string }[]).map(t2 => (
          <Pressable
            key={t2.key}
            onPress={() => setTab(t2.key)}
            style={[styles.tab, tab === t2.key && { backgroundColor: palette.accent }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t2.key }}>
            <Text style={[styles.tabText, { color: tab === t2.key ? palette.textOnAccent : palette.textSecondary }]}>
              {t2.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ gap: spacing.md }}>
          <Shimmer style={{ height: 220, borderRadius: radius.lg }} />
          <Shimmer style={{ height: 220, borderRadius: radius.lg }} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {tab === 'nutrition' && (
            <>
              <Enter index={0}><HistoryGraph title="Calories" unit="kcal" data={point('calories')} goal={CALORIE_GOAL} variant="line" /></Enter>
              <Enter index={1}><HistoryGraph title="Protein"  unit="g"    data={point('protein')}  variant="line" /></Enter>
              <Enter index={2}><HistoryGraph title="Carbs"    unit="g"    data={point('carbs')}    variant="line" /></Enter>
              <Enter index={3}><HistoryGraph title="Fat"      unit="g"    data={point('fat')}      variant="line" /></Enter>
              <Enter index={4}><HistoryGraph title="Sugar"    unit="g"    data={point('sugar')}    variant="line" /></Enter>
            </>
          )}
          {tab === 'body' && (
            <>
              <Enter index={0}>
                <HistoryGraph title="Weight" unit="lbs" data={weightPoints} variant="line" />
              </Enter>
              {weightPoints.length === 0 && (
                <Text style={[styles.hint, { color: palette.textMuted }]}>
                  Log today's weight from the Dashboard prompt to start your body graph.
                </Text>
              )}
            </>
          )}
          {tab === 'activity' && (
            <>
              <Enter index={0}><HistoryGraph title="Water"    unit="ml"        data={point('water')}    goal={WATER_GOAL} variant="line" /></Enter>
              <Enter index={1}><HistoryGraph title="Sleep"    unit="h"         data={point('sleep')}    goal={7} variant="line" /></Enter>
              <Enter index={2}><HistoryGraph title="Workouts" unit=""          data={point('workouts')} variant="bar" /></Enter>
            </>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row', gap: 4,
    borderRadius: radius.pill, borderWidth: layout.hairline,
    padding: 3,
    marginTop: spacing.sm,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  tabText: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 0.4 },
  hint: { fontFamily: fontFamily.sans, fontSize: 13, textAlign: 'center', padding: spacing.lg },
});
