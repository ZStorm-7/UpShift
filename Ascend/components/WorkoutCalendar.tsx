// WorkoutCalendar — shown on the Workout screen from the SECOND visit of
// the day onward (see WorkoutScreen.tsx), laying out the rest of the
// current month so the user can see which days are workout days and which
// are rest days ahead of time.
//
// Rest days are computed the same way WorkoutScreen picks today's workout:
// deterministically, from days-since-account-creation, via
// data/workoutPlans.ts's isRestDay/pickTodaysWorkout. Nothing is stored per
// day — the whole month is just recomputed from the same two inputs
// (account creation date + current progression state) every render.

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, Palette } from '../theme/themedColors';
import { pickTodaysWorkout, isRestDay, ProgressionState } from '../data/workoutPlans';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayOfYearFor(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBetween(a: Date, b: Date): number {
  const ad = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bd = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bd.getTime() - ad.getTime()) / (1000 * 60 * 60 * 24));
}

type DayInfo = {
  date: Date;
  isToday: boolean;
  isRest: boolean;
  isPast: boolean;
  focus: string; // short label, e.g. "Push Day" or "Rest"
};

export default function WorkoutCalendar({
  accountCreatedAt,
  progression,
}: {
  accountCreatedAt: Date;
  progression: ProgressionState;
}) {
  const palette = usePalette();
  const today = new Date();

  const { days, monthLabel, leadingBlanks } = useMemo(() => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstOfMonth = new Date(year, month, 1);
    const list: DayInfo[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const daysSinceStart = daysBetween(accountCreatedAt, date);
      const rest = isRestDay(daysSinceStart);
      const template = rest ? null : pickTodaysWorkout(progression, dayOfYearFor(date));
      list.push({
        date,
        isToday: daysBetween(today, date) === 0,
        isRest: rest,
        isPast: daysBetween(date, today) > 0,
        focus: rest ? 'Rest' : (template?.title.split('—')[0].trim() ?? 'Workout'),
      });
    }
    return {
      days: list,
      monthLabel: firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      leadingBlanks: firstOfMonth.getDay(),
    };
  }, [accountCreatedAt, progression]);

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.title, { color: palette.textPrimary }]}>{monthLabel}</Text>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((w, i) => (
          <Text key={i} style={[styles.weekdayLabel, { color: palette.textMuted }]}>{w}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={styles.cell} />
        ))}
        {days.map(day => (
          <DayCell key={day.date.toISOString()} day={day} palette={palette} />
        ))}
      </View>
      <View style={styles.legendRow}>
        <LegendItem color={palette.accent} label="Workout" palette={palette} />
        <LegendItem color={palette.textMuted} label="Rest" palette={palette} dashed />
      </View>
    </View>
  );
}

function DayCell({ day, palette }: { day: DayInfo; palette: Palette }) {
  return (
    <View style={styles.cell}>
      <View
        style={[
          styles.dayCircle,
          day.isToday && { borderWidth: 2, borderColor: palette.accent },
        ]}>
        <Text
          style={[
            styles.dayNumber,
            { color: day.isPast ? palette.textMuted : palette.textPrimary },
          ]}>
          {day.date.getDate()}
        </Text>
      </View>
      <View
        style={[
          styles.marker,
          day.isRest
            ? { borderWidth: 1, borderColor: palette.textMuted, borderStyle: 'dashed' }
            : { backgroundColor: palette.accent, opacity: day.isPast ? 0.35 : 1 },
        ]}
      />
    </View>
  );
}

function LegendItem({ color, label, palette, dashed }: { color: string; label: string; palette: Palette; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendMarker,
          dashed
            ? { borderWidth: 1, borderColor: color, borderStyle: 'dashed' }
            : { backgroundColor: color },
        ]}
      />
      <Text style={[styles.legendLabel, { color: palette.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontFamily: fontFamily.serif, fontSize: 18 },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: {
    flex: 1, textAlign: 'center',
    fontFamily: fontFamily.sansBold, fontSize: 11,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
    gap: 3,
  },
  dayCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  dayNumber: { fontFamily: fontFamily.sans, fontSize: 13 },
  marker: { width: 6, height: 6, borderRadius: 3 },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendMarker: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontFamily: fontFamily.sans, fontSize: 12 },
});
