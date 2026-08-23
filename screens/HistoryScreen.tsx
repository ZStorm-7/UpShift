import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getDoc } from 'firebase/firestore';
import { colors } from '../theme/colors';
import { spacing, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, SectionTitle, Pill, EmptyState } from '../components/ui';
import { Shimmer, AnimatedMeter } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { dayDocRefForKey, getRecentDayKeys, dayKeyToWeekdayLabel } from '../firebase/progress';
import { weightLogDocRef, WeightEntry } from '../firebase/weight';

const DAYS_SHOWN = 7;

// How many weigh-ins the card shows. The log itself keeps everything; this is
// only how far back the card scrolls without becoming the whole screen.
const WEIGHTS_SHOWN = 10;

// Component dimensions, not spacing: the skeleton's rows have to be the same
// height as the real ones or the layout jumps when Firestore lands.
const BAR_ROW_HEIGHT = 18;

// The bar rows print the short weekday, which is right for a 44pt column and
// wrong in a screen reader — "Mon" is read as a word, not a day. The
// accessibility sentence uses the full name instead.
const FULL_WEEKDAY: Record<string, string> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Weigh-in dates are stored as "YYYY-MM-DD" day keys. Printing the key raw
// makes a list of weights read as a list of database rows; "12 Aug" reads as a
// date. Parsed field-by-field rather than through `new Date(string)`, which
// treats a bare ISO date as UTC and can shift the day backwards west of
// Greenwich — the same reason dayKeyToWeekdayLabel splits it by hand.
function formatWeightDate(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  return `${d} ${MONTHS[m - 1]}`;
}

type DaySummary = {
  key: string;
  weekday: string;
  calories: number;
  water: number;
  sleep: number;
  workouts: number;
  isToday: boolean;
};

// Each metric is charted on its own, as a small multiple — rather than
// cramming four different units (kcal, ml, hours, count) onto one shared
// axis, which would make the numbers meaningless relative to each other.
//
// Within a metric the bars are all ONE color, because the thing being encoded
// is magnitude, not identity: a taller bar means more, and giving each day its
// own hue would imply the days are different *kinds* of thing. The hues come
// from the app's existing palette so this screen matches the rest of the UI
// instead of introducing a competing color language.
type MetricConfig = {
  key: keyof Pick<DaySummary, 'calories' | 'water' | 'sleep' | 'workouts'>;
  emoji: string;
  labelKey: string;
  color: string;
  goal: number | null;
  format: (value: number) => string;
};

export default function HistoryScreen({ navigation }: any) {
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DaySummary[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const keys = getRecentDayKeys(DAYS_SHOWN);
      const todayKey = keys[keys.length - 1];
      try {
        // All the day documents plus the weight log are fetched in parallel —
        // 8 independent reads, so waiting for them one at a time would make
        // the screen 8x slower for no reason.
        const [daySnaps, weightSnap] = await Promise.all([
          Promise.all(keys.map(key => getDoc(dayDocRefForKey(authUser.uid, key)))),
          getDoc(weightLogDocRef(authUser.uid)),
        ]);
        if (cancelled) return;

        setDays(
          daySnaps.map((snap, i) => {
            const data = snap.exists() ? snap.data() : {};
            const foodLog = data.foodLog || [];
            return {
              key: keys[i],
              weekday: dayKeyToWeekdayLabel(keys[i]),
              calories: foodLog.reduce((sum: number, item: any) => sum + (item.calories || 0), 0),
              water: data.waterTotal || 0,
              sleep: data.sleepHours || 0,
              workouts: data.workoutsCompleted || 0,
              isToday: keys[i] === todayKey,
            };
          })
        );
        setWeightEntries(weightSnap.exists() ? weightSnap.data().entries || [] : []);
      } catch {
        // Leaving days empty falls through to the "no history yet" message,
        // which is the right outcome either way — nothing to show.
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const METRICS: MetricConfig[] = [
    {
      key: 'calories',
      emoji: '🍎',
      labelKey: 'calories',
      color: colors.accent,
      goal: profile?.calorieGoal || null,
      format: v => `${v}`,
    },
    {
      key: 'water',
      emoji: '💧',
      labelKey: 'water',
      color: colors.protein,
      goal: profile?.waterGoalMl || null,
      format: v => `${(v / 1000).toFixed(1)}L`,
    },
    {
      key: 'sleep',
      emoji: '😴',
      labelKey: 'sleep',
      color: colors.fat,
      goal: 8,
      format: v => (v > 0 ? `${v}h` : '—'),
    },
    {
      key: 'workouts',
      emoji: '💪',
      labelKey: 'workouts',
      color: colors.carbs,
      goal: 1,
      format: v => `${v}`,
    },
  ];

  // Averages only count days that actually have data — including untouched
  // days as zeros would drag every average down and make a good week look bad
  // just because the app wasn't opened on a Sunday.
  const averageOf = (metric: MetricConfig): string => {
    const logged = days.filter(d => d[metric.key] > 0);
    if (logged.length === 0) return '—';
    const total = logged.reduce((sum, d) => sum + d[metric.key], 0);
    return metric.format(Math.round((total / logged.length) * 10) / 10);
  };

  const hasAnyData = days.some(d => d.calories > 0 || d.water > 0 || d.sleep > 0 || d.workouts > 0);

  // The change against the PREVIOUS weigh-in is the number people are actually
  // looking for — an absolute weight only means something next to the one
  // before it. Deltas are computed across the whole log and the window is
  // taken afterwards, so the oldest visible row still shows its change instead
  // of a blank that looks like a bug. Newest first: the last thing you logged
  // is the thing you want to see without scrolling.
  const weightRows = weightEntries
    .map((entry, i) => ({
      entry,
      delta:
        i > 0
          ? Math.round((entry.weightLbs - weightEntries[i - 1].weightLbs) * 10) / 10
          : null,
    }))
    .slice(-WEIGHTS_SHOWN)
    .reverse();

  // Skeletons in the shape of the real thing rather than a spinner on an empty
  // screen: nothing shifts when the seven day documents land, and the AppBar
  // renders in this branch too so there is always a way back out.
  if (loading) {
    return (
      <Screen scroll>
        <AppBar title={t('history')} subtitle={t('last7Days')} onBack={() => navigation.goBack()} />
        {/* Two metrics' worth. A full four would fill the viewport with
            shimmer, which reads as the screen being broken rather than busy. */}
        {[0, 1].map(section => (
          <View key={section}>
            <View style={styles.skeletonHeader}>
              <Shimmer width={110} height={14} />
              <Shimmer width={56} height={14} />
            </View>
            <Card style={styles.chartCard}>
              {Array.from({ length: DAYS_SHOWN }).map((_, row) => (
                <View key={row} style={styles.barRow}>
                  <Shimmer width={44} height={BAR_ROW_HEIGHT} />
                  <View style={styles.barTrack}>
                    <Shimmer width="100%" height={BAR_ROW_HEIGHT} />
                  </View>
                  <Shimmer width={54} height={BAR_ROW_HEIGHT} />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppBar title={t('history')} subtitle={t('last7Days')} onBack={() => navigation.goBack()} />

      {/* Weigh-ins are their own record, so a user who only ever logs weight
          still has history — the empty state is only honest when there's
          neither. */}
      {!hasAnyData && weightEntries.length === 0 && (
        <EmptyState icon="📈" title={t('history')} message={t('noHistoryYet')} />
      )}

      {hasAnyData &&
        METRICS.map((metric, metricIndex) => (
          <Enter key={metric.key} index={metricIndex}>
            <SectionTitle right={<Text style={styles.average}>avg {averageOf(metric)}</Text>}>
              {metric.emoji}  {t(metric.labelKey)}
            </SectionTitle>

            <Card style={styles.chartCard}>
              {days.map(day => {
                const value = day[metric.key];
                // Bar length is share-of-goal, capped at 100% so an enormous
                // day doesn't blow out the layout. The value is always printed
                // as text beside it, so the real number is never hidden by the
                // cap — and the chart is readable without relying on colour.
                const progress =
                  metric.goal && metric.goal > 0 ? Math.min(value / metric.goal, 1) : 0;
                const metGoal = metric.goal !== null && value >= metric.goal;

                // Four columns — a weekday, a bar, a number and a tick — are
                // four disconnected fragments to a screen reader. Grouping the
                // row and giving it one sentence is the only way it reads as a
                // day rather than as four stray labels.
                const dayName = day.isToday
                  ? 'Today'
                  : FULL_WEEKDAY[day.weekday] || day.weekday;
                const goalPhrase =
                  metric.goal === null
                    ? ''
                    : metGoal
                    ? ', goal met'
                    : `, goal ${metric.format(metric.goal)}`;

                return (
                  <View
                    key={day.key}
                    accessible
                    accessibilityLabel={`${dayName}, ${metric.format(value)} ${t(
                      metric.labelKey
                    )}${goalPhrase}`}
                    style={styles.barRow}>
                    <Text style={[styles.dayLabel, day.isToday && styles.dayLabelToday]}>
                      {day.isToday ? 'Today' : day.weekday}
                    </Text>
                    <View style={styles.barTrack}>
                      {/* celebrateAtFull is off here on purpose: a day from
                          last Tuesday crossing its goal is history, not an
                          achievement happening now, and pulsing seven bars on
                          arrival would spend the celebration the live screens
                          rely on. */}
                      <AnimatedMeter
                        progress={progress}
                        color={metric.color}
                        height={8}
                        celebrateAtFull={false}
                      />
                    </View>
                    <Text style={styles.valueLabel}>{metric.format(value)}</Text>
                    <Text style={styles.goalCheck}>{metGoal ? '✓' : ' '}</Text>
                  </View>
                );
              })}
            </Card>
          </Enter>
        ))}

      {weightEntries.length > 0 && (
        <Enter index={METRICS.length}>
          <SectionTitle
            right={<Pill label={`${weightEntries.length} entries`} color={colors.textMuted} />}>
            ⚖️  {t('weight')}
          </SectionTitle>

          {/* One card of hairline-separated rows, like every other list in the
              app. Each row owns its vertical padding so the dividers run the
              full height of the row. */}
          <Card style={styles.weightCard}>
            {weightRows.map(({ entry, delta }, i) => {
              // Direction is carried by the sign, not by the colour — the
              // colour is reinforcement for the people who can see it and the
              // "+"/"−" is the answer for everyone else.
              const deltaStyle =
                delta === null || delta === 0
                  ? styles.weightDeltaFlat
                  : delta < 0
                  ? styles.weightDeltaDown
                  : styles.weightDeltaUp;
              const deltaText =
                delta === null ? '—' : delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`;

              return (
                <View key={entry.date}>
                  {i > 0 && <View style={styles.rowDivider} />}
                  <View
                    accessible
                    accessibilityLabel={`${formatWeightDate(entry.date)}, ${
                      entry.weightLbs
                    } pounds${
                      delta === null || delta === 0
                        ? ''
                        : delta < 0
                        ? `, down ${Math.abs(delta)} since the previous weigh-in`
                        : `, up ${delta} since the previous weigh-in`
                    }`}
                    style={styles.weightRow}>
                    <Text style={styles.weightDate}>{formatWeightDate(entry.date)}</Text>
                    <View style={styles.weightRight}>
                      <Text style={[styles.weightDelta, deltaStyle]}>{deltaText}</Text>
                      <Text style={styles.weightValue}>{entry.weightLbs} lbs</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        </Enter>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Mirrors SectionTitle's own margins so the skeleton sits where the real
  // header will.
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  average: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  chartCard: {
    gap: spacing.sm + 2,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayLabel: {
    ...type.bodySm,
    color: colors.textMuted,
    width: 44,
  },
  dayLabelToday: {
    color: colors.accent,
    fontFamily: fontFamily.sansBlack,
  },
  barTrack: {
    flex: 1,
  },
  valueLabel: {
    ...type.bodySm,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
    width: 54,
    textAlign: 'right',
  },
  goalCheck: {
    ...type.bodySm,
    color: colors.success,
    fontFamily: fontFamily.sansBlack,
    width: 12,
  },
  // Horizontal padding only — the rows supply the vertical, so the hairlines
  // span the row rather than floating inside a padded box.
  weightCard: {
    paddingVertical: 0,
  },
  rowDivider: {
    height: layout.hairline,
    backgroundColor: colors.divider,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  weightDate: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  weightRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.md,
  },
  weightDelta: {
    ...type.bodySm,
    fontFamily: fontFamily.sansBold,
    // Fixed width and right-aligned so the weights below stay in one column
    // instead of jittering as the deltas change length.
    width: 44,
    textAlign: 'right',
  },
  weightDeltaDown: {
    color: colors.success,
  },
  weightDeltaUp: {
    color: colors.danger,
  },
  weightDeltaFlat: {
    color: colors.textMuted,
  },
  weightValue: {
    ...type.body,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
  },
});
