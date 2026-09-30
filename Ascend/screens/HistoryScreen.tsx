import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { getDoc } from 'firebase/firestore';
import { spacing, radius, layout, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette, Palette } from '../theme/themedColors';
import { Screen, AppBar, Card } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { dayDocRefForKey, getRecentDayKeys, getTodayKey } from '../firebase/progress';
import { weightLogDocRef, WeightEntry } from '../firebase/weight';
import { safeGoBack } from '../utils/nav';

const DAYS_LOADED = 365;

type Tab = 'nutrition' | 'body' | 'activity';

type TimeRange = '1D' | '3D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'ALL';
const TIME_RANGES: TimeRange[] = ['1D', '3D', '1W', '1M', '3M', '1Y', '5Y', 'ALL'];
const RANGE_DAYS: Record<TimeRange, number> = {
  '1D': 1, '3D': 3, '1W': 7, '1M': 30, '3M': 90, '1Y': 365, '5Y': 1825, 'ALL': Infinity,
};

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

const NUTRITION_KEYS = ['calories', 'protein', 'carbs', 'fat', 'sugar'] as const;
type NutritionKey = typeof NUTRITION_KEYS[number];

const NUTRITION_COLORS: Record<NutritionKey, string> = {
  calories: '#00C805',
  protein: '#2E7D32',
  carbs: '#66BB6A',
  fat: '#388E3C',
  sugar: '#81C784',
};

const NUTRITION_UNITS: Record<NutritionKey, string> = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  sugar: 'g',
};

const ACTIVITY_KEYS = ['water', 'sleep', 'workouts'] as const;
type ActivityKey = typeof ACTIVITY_KEYS[number];

// All three lines share the Activity tab's one accent color (palette.activityAccent
// — see theme/themedColors.ts) rather than three unrelated hues; opacity is what
// tells them apart, the same "one family, several tints" idea the old green ramp
// used, just no longer the same green every other tab also uses.
const ACTIVITY_OPACITY: Record<ActivityKey, number> = {
  workouts: 1,
  sleep: 0.7,
  water: 0.45,
};

const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  water: 'Water (ml)',
  sleep: 'Sleep (h)',
  workouts: 'Workouts',
};

const ACTIVITY_GOALS: Record<ActivityKey, number> = {
  water: 2500,
  sleep: 8,
  workouts: 1,
};

// Ranges wider than this get bucketed into weekly averages (see bucketByWeek)
// instead of plotting a raw point per day — past ~90 daily points the line
// reads as noise rather than a trend.
const BUCKET_THRESHOLD_DAYS = 90;

export default function HistoryScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('nutrition');
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([]);
  const [selectedSlice, setSelectedSlice] = useState<NutritionKey | null>(null);
  const [selectedDot, setSelectedDot] = useState<WeightEntry | null>(null);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const keys = getRecentDayKeys(DAYS_LOADED);
      try {
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
            protein: foodLog.reduce((s, f) => s + (f.protein || 0), 0),
            carbs: foodLog.reduce((s, f) => s + (f.carbs || 0), 0),
            fat: foodLog.reduce((s, f) => s + (f.fat || 0), 0),
            sugar: foodLog.reduce((s, f) => s + (f.sugar || 0), 0),
            water: d.waterTotal || 0,
            sleep: d.sleepHours || 0,
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

  const filteredDaily = useMemo(() => {
    if (timeRange === 'ALL') return daily.filter(d => hasActivity(d));
    const days = RANGE_DAYS[timeRange];
    return daily.slice(Math.max(0, daily.length - days)).filter(d => hasActivity(d));
  }, [daily, timeRange]);

  const filteredWeight = useMemo(() => {
    if (timeRange === 'ALL') return weightEntries;
    const days = RANGE_DAYS[timeRange];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const yy = cutoff.getFullYear();
    const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
    const dd = String(cutoff.getDate()).padStart(2, '0');
    const cutoffStr = `${yy}-${mm}-${dd}`;
    return weightEntries.filter(w => w.date >= cutoffStr);
  }, [weightEntries, timeRange]);

  const nutritionTotals = useMemo(() => {
    const d = filteredDaily;
    return {
      calories: d.reduce((s, r) => s + r.calories, 0),
      protein: d.reduce((s, r) => s + r.protein, 0),
      carbs: d.reduce((s, r) => s + r.carbs, 0),
      fat: d.reduce((s, r) => s + r.fat, 0),
      sugar: d.reduce((s, r) => s + r.sugar, 0),
    };
  }, [filteredDaily]);

  // Past ~90 days, a raw daily point per day is too dense to read as a trend —
  // fold it into weekly averages instead. Shorter ranges stay at full daily
  // granularity, where it's already fine.
  const shouldBucket = timeRange === 'ALL' || RANGE_DAYS[timeRange] > BUCKET_THRESHOLD_DAYS;

  const chartWeight = useMemo(() => {
    if (!shouldBucket) return filteredWeight;
    return bucketByWeek(filteredWeight.map(w => ({ date: w.date, value: w.weightLbs })))
      .map(p => ({ date: p.date, weightLbs: p.value }));
  }, [filteredWeight, shouldBucket]);

  const chartActivity = useMemo(() => {
    if (!shouldBucket) return filteredDaily;
    return bucketDailyByWeek(filteredDaily);
  }, [filteredDaily, shouldBucket]);

  // Highlights are deliberately independent of the selected time range — they
  // describe "how's it going lately", drawn from the full loaded history
  // (`daily`/`weightEntries`), not whatever window the chart happens to be
  // zoomed to.
  const nutritionHighlight = useMemo(() => computeNutritionHighlight(daily), [daily]);
  const weightHighlight = useMemo(() => computeWeightHighlight(weightEntries), [weightEntries]);
  const activityHighlight = useMemo(() => computeActivityHighlight(daily), [daily]);

  return (
    <Screen scroll contentStyle={{ backgroundColor: palette.bg, padding: spacing.lg, gap: spacing.md, paddingBottom: 120 }}>
      <AppBar title={t('history') || 'History'} onBack={() => safeGoBack(navigation)} />

      {/* Tab switcher */}
      <View style={[styles.tabs, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
        {([
          { key: 'nutrition', label: 'Nutrition' },
          { key: 'body', label: 'Body' },
          { key: 'activity', label: 'Activity' },
        ] as { key: Tab; label: string }[]).map(t2 => (
          <Pressable
            key={t2.key}
            onPress={() => { setTab(t2.key); setSelectedSlice(null); setSelectedDot(null); }}
            style={[styles.tab, tab === t2.key && { backgroundColor: palette.accent }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t2.key }}>
            <Text style={[styles.tabText, { color: tab === t2.key ? palette.textOnAccent : palette.textSecondary }]}>
              {t2.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Shared time-range tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rangeScroll}>
        <View style={[styles.rangeRow, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
          {TIME_RANGES.map(r => (
            <Pressable
              key={r}
              onPress={() => { setTimeRange(r); setSelectedDot(null); }}
              style={[styles.rangeBtn, timeRange === r && { backgroundColor: palette.accent }]}
              accessibilityRole="button">
              <Text style={[styles.rangeText, { color: timeRange === r ? palette.textOnAccent : palette.textSecondary }]}>
                {r === 'ALL' ? 'All' : r}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View style={{ gap: spacing.md }}>
          <Shimmer width="100%" height={320} radius={radius.lg} />
          <Shimmer width="100%" height={100} radius={radius.lg} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {tab === 'nutrition' && (
            <Enter index={0}>
              <HighlightCard highlight={nutritionHighlight} accentColor={palette.accent} palette={palette} />
            </Enter>
          )}
          {tab === 'body' && (
            <Enter index={0}>
              <HighlightCard highlight={weightHighlight} accentColor={palette.bodyAccent} palette={palette} />
            </Enter>
          )}
          {tab === 'activity' && (
            <Enter index={0}>
              <HighlightCard highlight={activityHighlight} accentColor={palette.activityAccent} palette={palette} />
            </Enter>
          )}

          {tab === 'nutrition' && (
            <Enter index={1}>
              <NutritionPieChart
                totals={nutritionTotals}
                selected={selectedSlice}
                onSelect={setSelectedSlice}
                palette={palette}
              />
            </Enter>
          )}
          {tab === 'body' && (
            <Enter index={1}>
              <WeightScatterplot
                data={chartWeight}
                selected={selectedDot}
                onSelect={setSelectedDot}
                referenceWeight={profile?.weightLbs}
                palette={palette}
              />
            </Enter>
          )}
          {tab === 'activity' && (
            <Enter index={1}>
              <ActivityCombinedChart
                data={chartActivity}
                waterGoal={profile?.waterGoalMl || 2500}
                palette={palette}
              />
            </Enter>
          )}
        </View>
      )}
    </Screen>
  );
}

// ── Highlights ──────────────────────────────────────────────────────────

type Highlight = { title: string; value: string };

/** One or two honest sentences about how the metric is trending, computed
 *  from real data already loaded for this screen — never shown until there's
 *  enough history to say something true (see the compute* functions below). */
function HighlightCard({
  highlight,
  accentColor,
  palette,
}: {
  highlight: Highlight | null;
  accentColor: string;
  palette: Palette;
}) {
  if (!highlight) return null;
  return (
    <Card style={{ gap: spacing.xs }}>
      <Text style={[type.label, { color: palette.textMuted, textTransform: 'uppercase' }]}>Highlights</Text>
      <Text style={[type.body, { color: palette.textPrimary }]}>{highlight.title}</Text>
      <Text style={[type.metric, { color: accentColor }]}>{highlight.value}</Text>
    </Card>
  );
}

function computeNutritionHighlight(daily: DailyData[]): Highlight | null {
  const active = daily.filter(hasActivity);
  // Fewer than four logged days isn't enough to say anything true about a
  // trend — show nothing rather than a stat built on almost no data.
  if (active.length < 4) return null;

  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);
  const sumCal = (arr: DailyData[]) => arr.reduce((s, r) => s + r.calories, 0);
  const last7Cal = sumCal(last7);
  const prev7Cal = sumCal(prev7);

  if (prev7.length === 7 && prev7Cal > 0) {
    const pctChange = Math.round(((last7Cal - prev7Cal) / prev7Cal) * 100);
    if (pctChange !== 0) {
      const dir = pctChange < 0 ? 'down' : 'up';
      return {
        title: `Calories ${dir} ${Math.abs(pctChange)}% vs the week before`,
        value: `${Math.round(last7Cal / 7)} kcal/day avg`,
      };
    }
  }

  // Not enough history for a week-over-week comparison (or it came out flat)
  // — fall back to a plain average over whatever's logged, capped at a week.
  const recentActive = active.slice(-7);
  const avgProtein = recentActive.reduce((s, r) => s + r.protein, 0) / recentActive.length;
  return { title: 'Protein averaged', value: `${Math.round(avgProtein)}g/day` };
}

function computeWeightHighlight(entries: WeightEntry[]): Highlight | null {
  if (entries.length < 2) return null; // nothing to compare against yet

  const last7 = entries.slice(-7);
  const earlier = entries.slice(0, -7);
  const minLast7 = Math.min(...last7.map(e => e.weightLbs));
  const priorMin = earlier.length > 0 ? Math.min(...earlier.map(e => e.weightLbs)) : Infinity;
  if (earlier.length > 0 && minLast7 < priorMin) {
    return { title: 'New 7-day weight low', value: `${minLast7} lbs` };
  }

  // Simple trend: change per week across the most recent stretch of entries,
  // normalized by however many calendar days that stretch actually spans
  // (weigh-ins aren't guaranteed to be daily).
  const window = entries.slice(-14);
  if (window.length >= 2) {
    const deltaLbs = window[window.length - 1].weightLbs - window[0].weightLbs;
    const days = daysBetween(window[0].date, window[window.length - 1].date) || 1;
    const perWeek = Math.round(((deltaLbs / days) * 7) * 10) / 10;
    if (Math.abs(perWeek) >= 0.1) {
      const dir = perWeek < 0 ? 'down' : 'up';
      return { title: `Trending ${dir} ${Math.abs(perWeek)} lb/week`, value: `${entries[entries.length - 1].weightLbs} lbs now` };
    }
  }

  return { title: 'Weight holding steady', value: `${entries[entries.length - 1].weightLbs} lbs` };
}

function computeActivityHighlight(daily: DailyData[]): Highlight | null {
  const active = daily.filter(hasActivity);
  // Need a full week's spread of days before "most active day" means
  // anything more than "the only day logged".
  if (active.length < 7) return null;

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  active.forEach(d => {
    const [y, m, dd] = d.date.split('-').map(Number);
    const weekday = new Date(y, m - 1, dd).getDay();
    // A simple, honest activity score — workouts weighted heaviest since
    // they're the most deliberate signal, water/sleep goal-hits worth less.
    const score = d.workouts * 3 + (d.water > 0 ? 1 : 0) + (d.sleep >= 7 ? 1 : 0);
    totals[weekday] += score;
    counts[weekday] += 1;
  });

  let bestDay = -1;
  let bestAvg = 0;
  for (let i = 0; i < 7; i++) {
    if (counts[i] === 0) continue;
    const avg = totals[i] / counts[i];
    if (avg > bestAvg) { bestAvg = avg; bestDay = i; }
  }
  if (bestDay === -1) return null;
  return { title: 'Most active day', value: weekdayNames[bestDay] };
}

function daysBetween(aDate: string, bDate: string): number {
  const [ay, am, ad] = aDate.split('-').map(Number);
  const [by, bm, bd] = bDate.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

// ── Bucketing & trend math ────────────────────────────────────────────────

// The Monday (in local time) of the calendar week containing `dateStr`,
// itself formatted the same "YYYY-MM-DD" way — so it sorts and groups
// exactly like the raw dates do.
function getWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayOfWeek = date.getDay(); // 0 = Sun .. 6 = Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Groups daily points into calendar weeks and averages the value within
 *  each — turns 365+ noisy daily points into a smooth weekly trend. Pure and
 *  reusable across any single-value time series in this screen. */
function bucketByWeek(points: { date: string; value: number }[]): { date: string; value: number }[] {
  if (points.length === 0) return [];
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    const key = getWeekKey(p.date);
    const b = buckets.get(key) ?? { sum: 0, count: 0 };
    b.sum += p.value;
    b.count += 1;
    buckets.set(key, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, b]) => ({ date, value: b.sum / b.count }));
}

/** bucketByWeek applied independently to each of DailyData's numeric fields,
 *  then re-zipped by index. Every field is grouped from the same source
 *  dates, so each field's bucketed array lines up with the others one-to-one
 *  — no separate alignment step needed. */
function bucketDailyByWeek(data: DailyData[]): DailyData[] {
  if (data.length === 0) return [];
  const keys = ['calories', 'protein', 'carbs', 'fat', 'sugar', 'water', 'sleep', 'workouts'] as const;
  const perKey = keys.map(k => bucketByWeek(data.map(d => ({ date: d.date, value: d[k] }))));
  return perKey[0].map((_, i) => {
    const row = { date: perKey[0][i].date } as DailyData;
    keys.forEach((k, ki) => { (row as any)[k] = perKey[ki][i].value; });
    return row;
  });
}

/** Simple moving average, anchored to the real first point rather than
 *  padded with zeros — window widens from 1 point up to `windowSize` over the
 *  first few entries, then stays a rolling `windowSize`-point average. */
function movingAverage(points: { date: string; value: number }[], windowSize = 7): { date: string; value: number }[] {
  return points.map((p, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = points.slice(start, i + 1);
    const avg = slice.reduce((s, q) => s + q.value, 0) / slice.length;
    return { date: p.date, value: avg };
  });
}

function hasActivity(d: DailyData): boolean {
  return d.calories > 0 || d.protein > 0 || d.carbs > 0 || d.fat > 0 ||
    d.sugar > 0 || d.water > 0 || d.sleep > 0 || d.workouts > 0;
}

// ── Nutrition Pie Chart ─────────────────────────────────────────────────

function NutritionPieChart({
  totals,
  selected,
  onSelect,
  palette,
}: {
  totals: Record<NutritionKey, number>;
  selected: NutritionKey | null;
  onSelect: (k: NutritionKey | null) => void;
  palette: Palette;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
    containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      originRef.current = { x: pageX, y: pageY };
    });
  };

  const total = NUTRITION_KEYS.reduce((s, k) => s + totals[k], 0);
  const slices = NUTRITION_KEYS.map(k => ({
    key: k,
    value: totals[k],
    pct: total > 0 ? totals[k] / total : 0,
    color: NUTRITION_COLORS[k],
    label: k.charAt(0).toUpperCase() + k.slice(1),
  })).filter(s => s.value > 0);

  const size = Math.min(chartWidth || 300, 300);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const innerR = outerR * 0.45;

  let angle = 0;
  const arcs = slices.map(s => {
    const start = angle;
    const sweep = s.pct * 360;
    angle += sweep;
    const isSelected = selected === s.key;
    const r = isSelected ? outerR + 8 : outerR;
    return { ...s, startAngle: start, endAngle: start + sweep, radius: r };
  });

  // Hit-testing is done in JS off a Pressable overlay rather than SVG
  // shapes' own onPress — react-native-svg's per-shape press handling has
  // proven unreliable on the web target (a crash was reproduced tapping a
  // Circle there), so every interactive chart in this file routes taps
  // through a plain RN Pressable and does the geometry itself instead.
  //
  // The tap position is computed from `pageX`/`pageY` rather than
  // `nativeEvent.locationX`/`locationY`. `locationX`/`locationY` are a React
  // Native-only, non-standard extension: on the web target, Pressable's
  // onPress is frequently driven by a plain browser click event, whose
  // nativeEvent is a real DOM MouseEvent with no `locationX` field at all.
  // Reading it there came back `undefined`, which turned every distance/angle
  // below into NaN — and a NaN never satisfies `dist < innerR` or matches an
  // arc's angle range, so the tap silently did nothing: no selection, no
  // highlight, no detail card. `pageX`/`pageY` are real fields on both a
  // native touch event and a web MouseEvent, so subtracting the container's
  // own measured page position (captured in onLayout) works identically on
  // every platform.
  const handlePieTap = (evt: any) => {
    if (total === 0) return;
    const locationX = evt.nativeEvent.pageX - originRef.current.x;
    const locationY = evt.nativeEvent.pageY - originRef.current.y;
    const svgW = size + 16;
    const offsetX = chartWidth > svgW ? (chartWidth - svgW) / 2 : 0;
    const dx = locationX - offsetX - 8 - cx;
    const dy = locationY - 8 - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < innerR || dist > outerR + 8) return;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const hit = arcs.find(a => deg >= a.startAngle && deg <= a.endAngle);
    if (hit) onSelect(selected === hit.key ? null : hit.key);
  };

  return (
    <View style={[styles.chartCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Pressable ref={containerRef} onLayout={onLayout} onPress={handlePieTap} style={{ alignItems: 'center' }}>
        {chartWidth > 0 && total > 0 && (
          <Svg width={size + 16} height={size + 16} viewBox={`${-8} ${-8} ${size + 16} ${size + 16}`}>
            {arcs.map(arc => (
              <Path
                key={arc.key}
                d={pieSlicePath(cx, cy, innerR, arc.radius, arc.startAngle, arc.endAngle)}
                fill={arc.color}
                opacity={selected && selected !== arc.key ? 0.3 : 1}
              />
            ))}
            <SvgText
              x={cx} y={cy - 8}
              textAnchor="middle"
              fill={palette.textPrimary}
              fontSize={28}
              fontWeight="900"
              fontFamily={fontFamily.sansBlack}>
              {formatNum(totals.calories)}
            </SvgText>
            <SvgText
              x={cx} y={cy + 14}
              textAnchor="middle"
              fill={palette.textMuted}
              fontSize={12}
              fontFamily={fontFamily.sans}>
              kcal
            </SvgText>
          </Svg>
        )}
        {total === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              No nutrition data yet for this period.
            </Text>
          </View>
        )}
      </Pressable>

      {/* Legend */}
      <View style={styles.legendRow}>
        {NUTRITION_KEYS.map(k => (
          <Pressable
            key={k}
            onPress={() => onSelect(selected === k ? null : k)}
            style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: NUTRITION_COLORS[k] }]} />
            <Text style={[styles.legendLabel, { color: palette.textSecondary }]}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Detail card for selected slice */}
      {selected && (
        <View style={[styles.detailCard, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
          <View style={[styles.detailDot, { backgroundColor: NUTRITION_COLORS[selected] }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: palette.textPrimary }]}>
              {selected.charAt(0).toUpperCase() + selected.slice(1)}
            </Text>
            <Text style={[styles.detailValue, { color: palette.textSecondary }]}>
              {formatNum(totals[selected])} {NUTRITION_UNITS[selected]}
            </Text>
            {total > 0 && (
              <Text style={[styles.detailPct, { color: palette.textMuted }]}>
                {Math.round((totals[selected] / total) * 100)}% of total intake
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function polarToCart(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function pieSlicePath(cx: number, cy: number, ir: number, or: number, startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 359.99) {
    return [
      `M ${cx + or} ${cy}`,
      `A ${or} ${or} 0 1 1 ${cx - or} ${cy}`,
      `A ${or} ${or} 0 1 1 ${cx + or} ${cy}`,
      `M ${cx + ir} ${cy}`,
      `A ${ir} ${ir} 0 1 0 ${cx - ir} ${cy}`,
      `A ${ir} ${ir} 0 1 0 ${cx + ir} ${cy}`,
      'Z',
    ].join(' ');
  }
  const os = polarToCart(cx, cy, or, startDeg);
  const oe = polarToCart(cx, cy, or, endDeg);
  const is_ = polarToCart(cx, cy, ir, endDeg);
  const ie = polarToCart(cx, cy, ir, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${os.x} ${os.y}`,
    `A ${or} ${or} 0 ${large} 1 ${oe.x} ${oe.y}`,
    `L ${is_.x} ${is_.y}`,
    `A ${ir} ${ir} 0 ${large} 0 ${ie.x} ${ie.y}`,
    'Z',
  ].join(' ');
}

// ── Weight Scatterplot ──────────────────────────────────────────────────

function WeightScatterplot({
  data,
  selected,
  onSelect,
  referenceWeight,
  palette,
}: {
  data: WeightEntry[];
  selected: WeightEntry | null;
  onSelect: (w: WeightEntry | null) => void;
  /** Onboarding's one-time starting weight (UserProfile.weightLbs) — there's
   *  no separate numeric goal-weight field in the profile, so this is the
   *  only real number worth drawing a reference line against. Labelled
   *  "Starting weight" rather than "Goal" so the line never claims to be
   *  something the data doesn't actually say. */
  referenceWeight?: number;
  palette: Palette;
}) {
  const [width, setWidth] = useState(0);
  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      originRef.current = { x: pageX, y: pageY };
    });
  };
  const height = 320;
  const padL = 50;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const todayKey = getTodayKey();

  const weights = data.map(d => d.weightLbs);
  const minW = weights.length > 0 ? Math.min(...weights) : 100;
  const maxW = weights.length > 0 ? Math.max(...weights) : 200;
  const range = maxW - minW || 10;
  const yMin = minW - range * 0.1;
  const yMax = maxW + range * 0.1;

  const xFor = (i: number) => padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = niceStep(yMax - yMin, 5);
    let v = Math.ceil(yMin / step) * step;
    while (v <= yMax) { ticks.push(v); v += step; }
    return ticks;
  }, [yMin, yMax]);

  const xLabels = useMemo(() => {
    if (data.length <= 7) return data.map((d, i) => ({ i, label: shortDate(d.date) }));
    const step = Math.max(1, Math.floor(data.length / 6));
    const labels: { i: number; label: string }[] = [];
    for (let i = 0; i < data.length; i += step) labels.push({ i, label: shortDate(data[i].date) });
    return labels;
  }, [data]);

  // 7-point trend, drawn bold over the lightened raw dots (see the Circle
  // fill opacity below) — MacroFactor's "smoothed line over raw scatter"
  // pattern. Pure movingAverage() lives with the other chart math up top.
  const trendPoints = useMemo(
    () => movingAverage(data.map(d => ({ date: d.date, value: d.weightLbs }))),
    [data]
  );
  const trendPath = useMemo(
    () => trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.value)}`).join(' '),
    [trendPoints, padL, plotW, padT, plotH, yMin, yMax]
  );

  // Continuous scrub: dragging anywhere across the chart tracks the nearest
  // point to the finger's x position and keeps updating as it moves, rather
  // than only registering a discrete tap. Reuses the same pageX-vs-locationX
  // reasoning as the rest of this file's chart handlers (see the comment on
  // handlePieTap) — `absoluteX` is the gesture-handler equivalent of pageX,
  // a real screen coordinate on every platform including web.
  const selectNearest = (absoluteX: number) => {
    if (data.length === 0) return;
    const locationX = absoluteX - originRef.current.x;
    let closestIdx = 0;
    let closestDist = Infinity;
    data.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - locationX);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    onSelect(data[closestIdx]);
  };

  // activeOffsetX (the same guard SwipeToDelete uses) means a mostly-vertical
  // drag is released back to the screen's own ScrollView instead of being
  // captured here — only a deliberately horizontal drag starts the scrub.
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate(e => { runOnJS(selectNearest)(e.absoluteX); })
    .onEnd(e => { runOnJS(selectNearest)(e.absoluteX); });

  const guideX = selected ? xFor(data.findIndex(d => d.date === selected.date)) : null;

  return (
    <View style={[styles.chartCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.chartTitle, { color: palette.textPrimary }]}>Weight</Text>
      <GestureDetector gesture={pan}>
        <View ref={containerRef} onLayout={onLayout} style={{ height }}>
          {width > 0 && data.length > 0 && (
            <Svg width={width} height={height}>
              {/* Y axis ticks */}
              {yTicks.map(v => (
                <G key={v}>
                  <Line x1={padL} x2={padL + plotW} y1={yFor(v)} y2={yFor(v)}
                    stroke={palette.divider} strokeWidth={0.5} />
                  <SvgText x={padL - 6} y={yFor(v) + 4} textAnchor="end"
                    fill={palette.textMuted} fontSize={10} fontFamily={fontFamily.sans}>
                    {/* Math.round() alone collapsed a fractional step (e.g.
                        174, 174.5, 175, 175.5, 176 — the actual ticks for a
                        single-entry chart, whose 2lb auto-range needs a 0.5
                        step to hit 5 ticks) into repeated whole numbers:
                        174, 175, 175, 176, 176. Only round when the step
                        itself is already a whole number — rounded to 2dp
                        first since `v` accumulates via repeated float
                        addition in the loop above and 175.5 can arrive as
                        175.49999999999997. */}
                    {(() => {
                      const rounded = Math.round(v * 100) / 100;
                      return Number.isInteger(rounded) ? rounded : rounded.toFixed(1);
                    })()}
                  </SvgText>
                </G>
              ))}

              {/* Starting-weight reference — a single thin dashed line
                  instead of the old 4-band gradient, same convention the
                  Activity chart's goal line already uses. */}
              {typeof referenceWeight === 'number' && referenceWeight >= yMin && referenceWeight <= yMax && (
                <Line
                  x1={padL} x2={padL + plotW}
                  y1={yFor(referenceWeight)} y2={yFor(referenceWeight)}
                  stroke={palette.textMuted} strokeWidth={1.5} strokeDasharray="4 4"
                />
              )}

              {/* X axis labels */}
              {xLabels.map(({ i, label }) => (
                <SvgText key={i} x={xFor(i)} y={height - 6} textAnchor="middle"
                  fill={palette.textMuted} fontSize={9} fontFamily={fontFamily.sans}>
                  {label}
                </SvgText>
              ))}

              {/* Raw daily dots — lightened so the trend line below reads as
                  the hero, per MacroFactor's raw-scatter-under-smoothed-line
                  treatment. */}
              {data.map((d, i) => {
                const isToday = d.date === todayKey;
                const isSelected = selected?.date === d.date;
                return (
                  <Circle
                    key={d.date}
                    cx={xFor(i)}
                    cy={yFor(d.weightLbs)}
                    r={isSelected ? 8 : isToday ? 6 : 5}
                    fill={palette.bodyAccent}
                    opacity={isSelected ? 1 : isToday ? 0.85 : 0.35}
                    stroke={isSelected ? palette.textPrimary : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })}

              {/* Trend line — bold, full opacity, drawn last so it sits on
                  top of the raw dots. */}
              {trendPoints.length > 1 && (
                <Path d={trendPath} stroke={palette.bodyAccent} strokeWidth={3}
                  fill="none" strokeLinejoin="round" strokeLinecap="round" />
              )}

              {/* Scrub guideline + floating callout, tracking the nearest
                  point to wherever the pan gesture currently is. */}
              {guideX !== null && selected && (
                <G>
                  <Line x1={guideX} x2={guideX} y1={padT} y2={padT + plotH}
                    stroke={palette.textSecondary} strokeWidth={1} strokeDasharray="2 3" />
                  <ScrubCallout
                    x={guideX}
                    plotLeft={padL}
                    plotRight={padL + plotW}
                    y={padT + 4}
                    text={`${selected.weightLbs} lbs`}
                    palette={palette}
                    accentColor={palette.bodyAccent}
                  />
                </G>
              )}
            </Svg>
          )}
          {data.length === 0 && (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                Log today's weight from the Dashboard to start your body graph.
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Selected dot detail */}
      {selected && (
        <View style={[styles.detailCard, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
          <View style={[styles.detailDot, { backgroundColor: palette.bodyAccent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: palette.textPrimary }]}>
              {selected.date === todayKey ? 'Today' : formatDateLabel(selected.date)}
            </Text>
            <Text style={[styles.detailValue, { color: palette.textSecondary }]}>
              {selected.weightLbs} lbs
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

/** Small pill-shaped label that floats above the scrub guideline, clamped so
 *  it never runs past the plot's own left/right edges near the ends of the
 *  chart. Shared by the Weight and Activity charts' scrub interaction. */
function ScrubCallout({
  x,
  plotLeft,
  plotRight,
  y,
  text,
  palette,
  accentColor,
}: {
  x: number;
  plotLeft: number;
  plotRight: number;
  y: number;
  text: string;
  palette: Palette;
  accentColor: string;
}) {
  const boxW = Math.max(44, text.length * 7 + 16);
  const boxH = 22;
  const cx = Math.min(Math.max(x, plotLeft + boxW / 2), plotRight - boxW / 2);
  return (
    <G>
      <Rect
        x={cx - boxW / 2} y={y} width={boxW} height={boxH}
        rx={radius.sm} fill={palette.surfaceRaised} stroke={accentColor} strokeWidth={1}
      />
      <SvgText x={cx} y={y + boxH / 2 + 4} textAnchor="middle"
        fill={palette.textPrimary} fontSize={11} fontFamily={fontFamily.sansBold}>
        {text}
      </SvgText>
    </G>
  );
}

// ── Activity Combined Chart ─────────────────────────────────────────────

function ActivityCombinedChart({
  data,
  waterGoal,
  palette,
}: {
  data: DailyData[];
  waterGoal: number;
  palette: Palette;
}) {
  const [width, setWidth] = useState(0);
  const containerRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    containerRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      originRef.current = { x: pageX, y: pageY };
    });
  };
  const height = 320;
  const padL = 42;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // Scrub selection — a day index into `data`/`normalized`, driven by the
  // pan gesture below rather than a discrete tap.
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const goals: Record<ActivityKey, number> = {
    water: waterGoal,
    sleep: ACTIVITY_GOALS.sleep,
    workouts: ACTIVITY_GOALS.workouts,
  };

  const normalized = useMemo(() => {
    return data.map(d => ({
      date: d.date,
      water: goals.water > 0 ? Math.min((d.water / goals.water) * 100, 150) : 0,
      sleep: goals.sleep > 0 ? Math.min((d.sleep / goals.sleep) * 100, 150) : 0,
      workouts: goals.workouts > 0 ? Math.min((d.workouts / goals.workouts) * 100, 150) : 0,
    }));
  }, [data, waterGoal]);

  const maxPct = 150;
  const xFor = (i: number) => padL + (normalized.length === 1 ? plotW / 2 : (i / (normalized.length - 1)) * plotW);
  const yFor = (pct: number) => padT + (1 - pct / maxPct) * plotH;

  const linePath = (key: ActivityKey) => {
    return normalized
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d[key])}`)
      .join(' ');
  };

  const yTicks = [0, 50, 100, 150];

  const xLabels = useMemo(() => {
    if (normalized.length <= 7) return normalized.map((d, i) => ({ i, label: shortDate(d.date) }));
    const step = Math.max(1, Math.floor(normalized.length / 6));
    const labels: { i: number; label: string }[] = [];
    for (let i = 0; i < normalized.length; i += step) labels.push({ i, label: shortDate(normalized[i].date) });
    return labels;
  }, [normalized]);

  // Same continuous-scrub approach as the Weight chart — see the comment on
  // WeightScatterplot's selectNearest for why absoluteX (not locationX) is
  // what makes this work on web too.
  const selectNearest = (absoluteX: number) => {
    if (normalized.length === 0) return;
    const locationX = absoluteX - originRef.current.x;
    let closestIdx = 0;
    let closestDist = Infinity;
    normalized.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - locationX);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    setScrubIdx(closestIdx);
  };

  // Same activeOffsetX guard as the Weight chart's pan — see its comment.
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate(e => { runOnJS(selectNearest)(e.absoluteX); })
    .onEnd(e => { runOnJS(selectNearest)(e.absoluteX); });

  const scrubDay = scrubIdx !== null ? data[scrubIdx] : null;
  const guideX = scrubIdx !== null ? xFor(scrubIdx) : null;

  return (
    <View style={[styles.chartCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.chartTitle, { color: palette.textPrimary }]}>Activity</Text>
      <Text style={[styles.chartSubtitle, { color: palette.textMuted }]}>% of daily goal, per metric</Text>

      {/* Legend — colored line swatches at the TOP, above the plot, same
          layout as a standard multi-series line chart: each series' color
          and label read left to right before the eye ever hits the lines
          themselves. All three share the Activity tab's one accent color;
          opacity (ACTIVITY_OPACITY) is what tells them apart. */}
      <View style={styles.lineLegendRow}>
        {ACTIVITY_KEYS.map(k => (
          <View key={k} style={styles.lineLegendItem}>
            <View style={[styles.lineLegendSwatch, { backgroundColor: palette.activityAccent, opacity: ACTIVITY_OPACITY[k] }]} />
            <Text style={[styles.legendLabel, { color: palette.textSecondary }]}>
              {ACTIVITY_LABELS[k]}
            </Text>
          </View>
        ))}
      </View>

      <GestureDetector gesture={pan}>
        <View ref={containerRef} onLayout={onLayout} style={{ height }}>
          {width > 0 && normalized.length > 0 && (
            <Svg width={width} height={height}>
              {/* Horizontal gridlines at every tick, spanning the full plot
                  width — the reference chart's grid, not just a single goal
                  dash. */}
              {yTicks.map(v => (
                <Line key={`grid-${v}`}
                  x1={padL} x2={padL + plotW}
                  y1={yFor(v)} y2={yFor(v)}
                  stroke={palette.divider} strokeWidth={1}
                />
              ))}

              {/* Goal line at 100%, called out on top of the plain grid. */}
              <Line
                x1={padL} x2={padL + plotW}
                y1={yFor(100)} y2={yFor(100)}
                stroke={palette.textMuted} strokeWidth={1.5} strokeDasharray="4 4"
              />

              {/* Y axis labels */}
              {yTicks.map(v => (
                <SvgText key={v} x={padL - 6} y={yFor(v) + 4} textAnchor="end"
                  fill={palette.textMuted} fontSize={10} fontFamily={fontFamily.sans}>
                  {v}%
                </SvgText>
              ))}

              {/* X axis labels */}
              {xLabels.map(({ i, label }) => (
                <SvgText key={i} x={xFor(i)} y={height - 6} textAnchor="middle"
                  fill={palette.textMuted} fontSize={9} fontFamily={fontFamily.sans}>
                  {label}
                </SvgText>
              ))}

              {/* Lines for each activity */}
              {ACTIVITY_KEYS.map(k => (
                <Path
                  key={k}
                  d={linePath(k)}
                  stroke={palette.activityAccent}
                  strokeOpacity={ACTIVITY_OPACITY[k]}
                  strokeWidth={3}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* Dots when few data points */}
              {normalized.length <= 14 && ACTIVITY_KEYS.map(k =>
                normalized.map((d, i) => (
                  <Circle
                    key={`${k}-${i}`}
                    cx={xFor(i)}
                    cy={yFor(d[k])}
                    r={3}
                    fill={palette.bg}
                    stroke={palette.activityAccent}
                    strokeOpacity={ACTIVITY_OPACITY[k]}
                    strokeWidth={2}
                  />
                ))
              )}

              {/* Scrub guideline + floating callout — tracks the nearest day
                  to wherever the pan gesture currently is. */}
              {guideX !== null && scrubDay && (
                <G>
                  <Line x1={guideX} x2={guideX} y1={padT} y2={padT + plotH}
                    stroke={palette.textSecondary} strokeWidth={1} strokeDasharray="2 3" />
                  <ScrubCallout
                    x={guideX}
                    plotLeft={padL}
                    plotRight={padL + plotW}
                    y={padT + 4}
                    text={shortDate(scrubDay.date)}
                    palette={palette}
                    accentColor={palette.activityAccent}
                  />
                </G>
              )}
            </Svg>
          )}
          {normalized.length === 0 && (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: palette.textMuted }]}>
                No activity data yet for this period.
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Scrubbed day detail — same card treatment as the Weight chart's. */}
      {scrubDay && (
        <View style={[styles.detailCard, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
          <View style={[styles.detailDot, { backgroundColor: palette.activityAccent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: palette.textPrimary }]}>
              {formatDateLabel(scrubDay.date)}
            </Text>
            <Text style={[styles.detailValue, { color: palette.textSecondary }]}>
              {Math.round(scrubDay.water)} ml · {scrubDay.sleep.toFixed(1)}h sleep · {scrubDay.workouts} workout{scrubDay.workouts === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
  return `${weekday}, ${shortDate(dateStr)}`;
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice: number;
  if (norm <= 1.5) nice = 1;
  else if (norm <= 3) nice = 2;
  else if (norm <= 7) nice = 5;
  else nice = 10;
  return nice * mag;
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row', gap: 4,
    borderRadius: radius.pill, borderWidth: layout.hairline,
    padding: 3, marginTop: spacing.sm,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  tabText: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 0.4 },

  rangeScroll: { marginTop: spacing.xs },
  rangeRow: {
    flexDirection: 'row', gap: 3,
    borderRadius: radius.pill, borderWidth: layout.hairline,
    padding: 3,
  },
  rangeBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill,
  },
  rangeText: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.4 },

  chartCard: {
    borderRadius: radius.lg, borderWidth: layout.hairline,
    padding: spacing.lg, gap: spacing.md,
  },
  chartTitle: { fontFamily: fontFamily.serif, fontSize: 20 },
  chartSubtitle: { fontFamily: fontFamily.sans, fontSize: 12 },
  lineLegendRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.md, paddingTop: spacing.xs,
  },
  lineLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineLegendSwatch: { width: 16, height: 3, borderRadius: 2 },

  legendRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.md, justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontFamily: fontFamily.sans, fontSize: 12 },

  detailCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.md, borderWidth: layout.hairline,
    padding: spacing.md,
  },
  detailDot: { width: 14, height: 14, borderRadius: 7 },
  detailTitle: { fontFamily: fontFamily.sansBold, fontSize: 15 },
  detailValue: { fontFamily: fontFamily.sans, fontSize: 14, marginTop: 2 },
  detailPct: { fontFamily: fontFamily.sans, fontSize: 12, marginTop: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  emptyText: { fontFamily: fontFamily.sans, fontSize: 13, textAlign: 'center', padding: spacing.lg },
});
