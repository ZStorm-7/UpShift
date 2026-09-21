// Native-feeling scroll-wheel pickers for Onboarding's date-of-birth,
// height, and weight questions — replacing the old plain numeric `Field`s
// (see OnboardingScreen's former dobMonth/heightFeet/etc. text inputs).
//
// No date-picker/wheel-picker dependency exists in this project (confirmed
// against package.json), so this is hand-rolled on top of what's already
// installed: a plain FlatList per column with `snapToInterval` doing the
// native-feeling snap-to-row, and Reanimated driving each row's
// opacity/scale off the list's own scroll position so items fade and
// shrink as they move away from the center band — the same "wheel" read as
// a UIPickerView without a new native module. Matches the precedent already
// set by components/CountryCodePicker.tsx (a custom-built picker, just a
// flat list rather than a wheel).

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { usePalette, type Palette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import haptics from '../services/haptics';

const ITEM_HEIGHT = 40;
// Odd, so there's a true center row — 2 rows of context above and below it.
const VISIBLE_COUNT = 5;
const PAD = Math.floor(VISIBLE_COUNT / 2) * ITEM_HEIGHT;

/* ------------------------------------------------------------------ *
 * WheelColumn — one scrolling, snapping column of values
 * ------------------------------------------------------------------ */

type WheelColumnProps = {
  data: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width?: number;
  /** Right-aligns text in the column (used for a unit suffix like "lb"). */
  align?: 'center' | 'left';
};

function WheelRow({
  label,
  index,
  scrollY,
  palette,
  align,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  palette: Palette;
  align: 'center' | 'left';
}) {
  const style = useAnimatedStyle(() => {
    const distance = scrollY.value - index * ITEM_HEIGHT;
    const abs = Math.abs(distance);
    return {
      opacity: interpolate(abs, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.45, 0.2], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(abs, [0, ITEM_HEIGHT, ITEM_HEIGHT * 2], [1, 0.92, 0.85], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.row, { height: ITEM_HEIGHT }, style]}>
      <Text
        style={[
          styles.rowLabel,
          { color: palette.textPrimary, textAlign: align },
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

/** One vertical scroll-wheel column. Snaps to the nearest row on release and
 *  reports its committed index via `onChange` — never a value mid-flight. */
function WheelColumn({ data, selectedIndex, onChange, width, align = 'center' }: WheelColumnProps) {
  const palette = usePalette();
  const listRef = useRef<Animated.FlatList<string>>(null);
  const scrollY = useSharedValue(selectedIndex * ITEM_HEIGHT);
  // Distinguishes a genuine user-driven scroll from the effect below
  // re-centering the list after `selectedIndex` changes out from under it
  // (e.g. clamping the day when the month/year changes) — without this a
  // programmatic scrollToOffset would itself fire onMomentumScrollEnd and
  // call onChange again with a value that hasn't actually changed.
  const lastCommitted = useRef(selectedIndex);

  useEffect(() => {
    if (lastCommitted.current === selectedIndex) return;
    lastCommitted.current = selectedIndex;
    scrollY.value = selectedIndex * ITEM_HEIGHT;
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
  }, [selectedIndex]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const commit = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.max(0, Math.min(data.length - 1, Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
      if (index !== lastCommitted.current) {
        lastCommitted.current = index;
        haptics.selection();
        onChange(index);
      }
    },
    [data.length, onChange]
  );

  return (
    <View style={[styles.column, width ? { width } : null]}>
      <Animated.FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, i) => `${item}-${i}`}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        initialScrollIndex={selectedIndex}
        getItemLayout={(_, i) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * i, index: i })}
        contentContainerStyle={{ paddingVertical: PAD }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={commit}
        // A slow drag that stops without ever triggering momentum still has
        // to snap and commit — otherwise a careful, deliberate scroll (as
        // opposed to a flick) leaves the wheel parked between two rows.
        onScrollEndDrag={(e) => {
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) commit(e);
        }}
        renderItem={({ item, index }) => (
          <WheelRow label={item} index={index} scrollY={scrollY} palette={palette} align={align} />
        )}
      />
      {/* The center band — a fixed pair of hairlines showing which row is
          "selected", the same read as a native UIPickerView's highlight. */}
      <View pointerEvents="none" style={[styles.centerBand, { borderColor: palette.border }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * SegmentedToggle — the Pounds/Kilograms, Feet+Inches/Centimeters switch
 * ------------------------------------------------------------------ */

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={[styles.segmented, { backgroundColor: palette.surface, borderColor: palette.border }]}
      accessibilityRole="radiogroup">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (opt.value === value) return;
              haptics.selection();
              onChange(opt.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={opt.label}
            style={[
              styles.segmentedOption,
              selected && { backgroundColor: palette.textPrimary },
            ]}>
            <Text
              style={[
                styles.segmentedLabel,
                { color: selected ? palette.bg : palette.textSecondary },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * WheelDatePicker — month (abbreviated) / day / year
 * ------------------------------------------------------------------ */

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function daysInMonth(month1to12: number, year: number): number {
  return new Date(year, month1to12, 0).getDate();
}

type WheelDateValue = { month: number; day: number; year: number }; // month 1-12

export function WheelDatePicker({
  value,
  onChange,
  maxYear = new Date().getFullYear(),
  minYear = new Date().getFullYear() - 100,
}: {
  value: WheelDateValue;
  onChange: (v: WheelDateValue) => void;
  maxYear?: number;
  minYear?: number;
}) {
  const years = useMemo(() => {
    const arr: string[] = [];
    for (let y = maxYear; y >= minYear; y--) arr.push(String(y));
    return arr;
  }, [maxYear, minYear]);

  const dayCount = daysInMonth(value.month, value.year);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => String(i + 1)), [dayCount]);

  return (
    <View style={styles.dateRow}>
      <WheelColumn
        data={MONTH_ABBR}
        selectedIndex={value.month - 1}
        onChange={(i) => {
          const month = i + 1;
          const clampedDay = Math.min(value.day, daysInMonth(month, value.year));
          onChange({ ...value, month, day: clampedDay });
        }}
      />
      <WheelColumn
        data={days}
        selectedIndex={Math.min(value.day, dayCount) - 1}
        onChange={(i) => onChange({ ...value, day: i + 1 })}
      />
      <WheelColumn
        data={years}
        selectedIndex={years.indexOf(String(value.year))}
        onChange={(i) => {
          const year = Number(years[i]);
          const clampedDay = Math.min(value.day, daysInMonth(value.month, year));
          onChange({ ...value, year, day: clampedDay });
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * HeightWheelPicker — Feet+Inches (two columns) or Centimeters (one)
 * ------------------------------------------------------------------ */

const FEET = Array.from({ length: 6 }, (_, i) => String(i + 3)); // 3-8 ft
const INCHES = Array.from({ length: 12 }, (_, i) => String(i)); // 0-11 in
const CENTIMETERS = Array.from({ length: 151 }, (_, i) => String(i + 100)); // 100-250 cm

export type HeightUnit = 'ftin' | 'cm';
type HeightValue = { feet: number; inches: number; cm: number };

export function HeightWheelPicker({
  unit,
  onUnitChange,
  value,
  onChange,
}: {
  unit: HeightUnit;
  onUnitChange: (u: HeightUnit) => void;
  value: HeightValue;
  onChange: (v: HeightValue) => void;
}) {
  return (
    <View style={styles.unitPickerBlock}>
      <SegmentedToggle
        options={[
          { value: 'ftin', label: 'Feet and Inches' },
          { value: 'cm', label: 'Centimeters' },
        ]}
        value={unit}
        onChange={onUnitChange}
      />
      {unit === 'ftin' ? (
        <View style={styles.dateRow}>
          <WheelColumn
            data={FEET.map((f) => `${f} ft`)}
            selectedIndex={Math.max(0, value.feet - 3)}
            onChange={(i) => onChange({ ...value, feet: Number(FEET[i]) })}
          />
          <WheelColumn
            data={INCHES.map((i) => `${i} in`)}
            selectedIndex={value.inches}
            onChange={(i) => onChange({ ...value, inches: Number(INCHES[i]) })}
          />
        </View>
      ) : (
        <View style={styles.dateRow}>
          <WheelColumn
            data={CENTIMETERS.map((c) => `${c} cm`)}
            selectedIndex={Math.max(0, Math.min(CENTIMETERS.length - 1, value.cm - 100))}
            onChange={(i) => onChange({ ...value, cm: Number(CENTIMETERS[i]) })}
          />
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * WeightWheelPicker — Pounds or Kilograms, one column
 * ------------------------------------------------------------------ */

const POUNDS = Array.from({ length: 351 }, (_, i) => String(i + 50)); // 50-400 lb
const KILOGRAMS = Array.from({ length: 161 }, (_, i) => String(i + 20)); // 20-180 kg

export type WeightUnit = 'lb' | 'kg';

export function WeightWheelPicker({
  unit,
  onUnitChange,
  value,
  onChange,
}: {
  unit: WeightUnit;
  onUnitChange: (u: WeightUnit) => void;
  value: number;
  onChange: (v: number) => void;
}) {
  const palette = usePalette();
  const data = unit === 'lb' ? POUNDS : KILOGRAMS;
  const min = unit === 'lb' ? 50 : 20;
  const clamped = Math.max(min, Math.min(min + data.length - 1, Math.round(value)));

  return (
    <View style={styles.unitPickerBlock}>
      <SegmentedToggle
        options={[
          { value: 'lb', label: 'Pounds' },
          { value: 'kg', label: 'Kilograms' },
        ]}
        value={unit}
        onChange={onUnitChange}
      />
      <Text style={[styles.weightReadout, { color: palette.textPrimary }]}>
        {clamped} {unit}
      </Text>
      <View style={styles.dateRow}>
        <WheelColumn data={data} selectedIndex={clamped - min} onChange={(i) => onChange(Number(data[i]))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: ITEM_HEIGHT * VISIBLE_COUNT,
  },
  column: {
    flex: 1,
    maxWidth: 120,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...type.heading,
    fontFamily: fontFamily.sans,
    fontSize: 20,
  },
  centerBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_HEIGHT,
    borderTopWidth: layout.hairline,
    borderBottomWidth: layout.hairline,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    padding: 3,
    alignSelf: 'center',
  },
  segmentedOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  segmentedLabel: {
    ...type.bodySm,
    fontFamily: fontFamily.sansBold,
  },
  unitPickerBlock: {
    gap: spacing.lg,
    alignItems: 'center',
  },
  weightReadout: {
    ...type.display,
    fontFamily: fontFamily.sansBlack,
    fontSize: 28,
  },
});
