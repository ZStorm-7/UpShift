// A simple line/bar graph for the History screen. Renders any daily-metric
// series with a switchable time range (1W, 1M, 3M, All). Drawn in SVG so
// it renders identically on iOS, Android, and Web.
//
// Design: MacroFactor-style — no gridlines, one soft baseline, a filled
// area beneath the line for texture, and the current value called out at
// top. Bars are used for categorical or discrete daily counts (like
// completed workouts); lines are used for continuous metrics (weight,
// calories, protein).

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';

export type GraphPoint = {
  date: string;      // YYYY-MM-DD
  value: number;
};

type Range = '1W' | '1M' | '3M' | 'ALL';

const RANGES: Range[] = ['1W', '1M', '3M', 'ALL'];
const RANGE_DAYS: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, 'ALL': Infinity };

type Props = {
  title: string;                   // e.g. "Weight", "Calories"
  unit?: string;                   // e.g. "lbs", "kcal"
  data: GraphPoint[];              // oldest first
  goal?: number;                   // optional dashed goal line
  variant?: 'line' | 'bar';
  height?: number;                 // default 200
};

export default function HistoryGraph({ title, unit, data, goal, variant = 'line', height = 200 }: Props) {
  const palette = usePalette();
  const [range, setRange] = useState<Range>('1M');
  const [width, setWidth] = useState(0);

  const filtered = useMemo(() => {
    if (range === 'ALL') return data;
    return data.slice(Math.max(0, data.length - RANGE_DAYS[range]));
  }, [data, range]);

  const current = filtered.length > 0 ? filtered[filtered.length - 1].value : 0;
  const first = filtered.length > 0 ? filtered[0].value : 0;
  const delta = current - first;
  const showDelta = filtered.length > 1;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: palette.textSecondary }]}>{title.toUpperCase()}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: palette.textPrimary }]}>
              {formatNumber(current)}
            </Text>
            {unit && <Text style={[styles.unit, { color: palette.textMuted }]}>{unit}</Text>}
          </View>
          {showDelta && (
            <Text
              style={[
                styles.delta,
                { color: delta >= 0 ? palette.accent : palette.loss },
              ]}>
              {delta >= 0 ? '↑' : '↓'} {formatNumber(Math.abs(delta))}{unit ? ` ${unit}` : ''} · {range}
            </Text>
          )}
        </View>
        <RangeSwitcher palette={palette} value={range} onChange={setRange} />
      </View>

      {/* Plot area */}
      <View onLayout={onLayout} style={{ height, marginTop: spacing.md }}>
        {width > 0 && filtered.length > 0 && (
          <SvgPlot
            width={width}
            height={height}
            data={filtered}
            variant={variant}
            goal={goal}
            palette={palette}
          />
        )}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: palette.textMuted }]}>
              No data yet — start logging to see your graph.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SvgPlot({ width, height, data, variant, goal, palette }: any) {
  const padX = 8;
  const padTop = 12;
  const padBottom = 20;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const values = data.map((d: GraphPoint) => d.value);
  const minV = Math.min(...values, goal ?? Infinity);
  const maxV = Math.max(...values, goal ?? -Infinity);
  const range = maxV - minV || 1;
  // pad the range so nothing sits right on the top/bottom edge
  const yMin = minV - range * 0.1;
  const yMax = maxV + range * 0.1;

  const xFor = (i: number) => padX + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const yFor = (v: number) => padTop + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  if (variant === 'bar') {
    const barW = Math.max(4, (plotW / data.length) * 0.65);
    return (
      <Svg width={width} height={height}>
        {data.map((d: GraphPoint, i: number) => {
          const y = yFor(d.value);
          const zeroY = yFor(Math.max(0, yMin));
          const barH = Math.max(2, zeroY - y);
          return (
            <Rect
              key={d.date}
              x={xFor(i) - barW / 2}
              y={y}
              width={barW}
              height={barH}
              rx={2}
              fill={palette.accent}
            />
          );
        })}
      </Svg>
    );
  }

  // Line variant. Filled area under the line, then the line, then
  // small dots for each point (only when the range is short enough
  // that dots don't crowd).
  const linePath = data
    .map((d: GraphPoint, i: number) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(d.value)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xFor(data.length - 1)} ${padTop + plotH} L ${xFor(0)} ${padTop + plotH} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.accent} stopOpacity={0.25} />
          <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {goal !== undefined && (
        <Line
          x1={padX}
          x2={padX + plotW}
          y1={yFor(goal)}
          y2={yFor(goal)}
          stroke={palette.textMuted}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}
      <Path d={areaPath} fill="url(#areaFill)" />
      <Path d={linePath} stroke={palette.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {data.length <= 14 &&
        data.map((d: GraphPoint, i: number) => (
          <Circle
            key={d.date}
            cx={xFor(i)}
            cy={yFor(d.value)}
            r={3}
            fill={palette.bg}
            stroke={palette.accent}
            strokeWidth={2}
          />
        ))}
    </Svg>
  );
}

function RangeSwitcher({ palette, value, onChange }: { palette: any; value: Range; onChange: (r: Range) => void }) {
  return (
    <View style={[styles.rangeGroup, { backgroundColor: palette.surfaceSunken, borderColor: palette.border }]}>
      {RANGES.map(r => {
        const active = value === r;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            style={[
              styles.rangeBtn,
              active && { backgroundColor: palette.accent },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Show ${r === 'ALL' ? 'all time' : r}`}>
            <Text
              style={[
                styles.rangeText,
                { color: active ? palette.textOnAccent : palette.textSecondary },
              ]}>
              {r}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: {
    fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.8,
    marginBottom: 4,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontFamily: fontFamily.sansBlack, fontSize: 34, lineHeight: 38 },
  unit:  { fontFamily: fontFamily.sans, fontSize: 15 },
  delta: { fontFamily: fontFamily.sansBold, fontSize: 12, marginTop: 2 },
  rangeGroup: {
    flexDirection: 'row',
    borderRadius: radius.pill, borderWidth: layout.hairline,
    padding: 2,
  },
  rangeBtn: {
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill,
  },
  rangeText: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fontFamily.sans, fontSize: 13 },
});
