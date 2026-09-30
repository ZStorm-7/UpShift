// MuscleRecovery — the lightweight version of Fitbod's recovery body-map,
// scoped down to what this app can support without a whole new
// illustration system: one row per muscle group instead of a body diagram,
// same underlying idea (how long since this was trained → how fresh is it).
// Lives on the Workout hub screen, above "Start workout", so "you haven't
// trained legs in 5 days" is visible before picking today's session rather
// than only inferable after the fact from history.
import { ReactElement } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Palette } from '../theme/themedColors';
import { MUSCLE_GROUPS, MuscleGroup } from '../data/muscleGroups';
import { MuscleLogEntry, daysSinceTrained } from '../firebase/muscleLog';

// Ionicons has no actual muscle-group pictograms — 'body' is the closest
// thing, which is why Chest/Back/Shoulders used to all render the SAME
// generic person-outline icon (and Core got a plain circle that means
// nothing at all). Small hand-drawn glyphs here instead, one distinct shape
// per group, so the row is scannable by icon rather than by reading every
// label. Arms/Legs keep their Ionicons since 'barbell'/'walk' already read
// clearly and don't need replacing.
function ChestIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Two pec "shells" meeting at the sternum line */}
      <Path d="M12 6c-2.2-2-6-1.6-7 1-1.1 2.6.2 7.5 4.6 10.4.9.6 1.8.6 2.4-.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 6c2.2-2 6-1.6 7 1 1.1 2.6-.2 7.5-4.6 10.4-.9.6-1.8.6-2.4-.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 6v11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function BackIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Trapezius/lat "V" taper — wide shoulders narrowing to the waist,
          with the spine line down the middle: the standard "back day" shape. */}
      <Path d="M6 5c1.8 1 3 1.4 6 1.4S16.2 6 18 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 5c-1.4 5-.6 10 2.6 14M18 5c1.4 5 .6 10-2.6 14" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 6.4v12.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function ShoulderIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Two deltoid caps over a collarbone line — reads as shoulders from
          the front without needing a whole figure. */}
      <Circle cx={6.5} cy={10} r={3} stroke={color} strokeWidth={1.8} />
      <Circle cx={17.5} cy={10} r={3} stroke={color} strokeWidth={1.8} />
      <Path d="M9.2 8.4c1-1 1.8-1.4 2.8-1.4s1.8.4 2.8 1.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function CoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* The universal "six-pack" grid — instantly reads as abs/core in a
          way no single generic shape would. */}
      <Rect x={7} y={4} width={10} height={16} rx={3} stroke={color} strokeWidth={1.8} />
      <Path d="M7 9.3h10M7 14.7h10M12 4v16" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

const CUSTOM_ICONS: Partial<Record<MuscleGroup, (props: { color: string; size: number }) => ReactElement>> = {
  Chest: ChestIcon,
  Back: BackIcon,
  Shoulders: ShoulderIcon,
  Core: CoreIcon,
};

const GROUP_ICONS: Partial<Record<MuscleGroup, keyof typeof Ionicons.glyphMap>> = {
  Arms: 'barbell',
  Legs: 'walk',
};

function statusFor(days: number | null, palette: Palette): { label: string; color: string } {
  if (days === null || days >= 3) return { label: 'Fresh', color: palette.success };
  if (days === 2) return { label: 'Almost fresh', color: '#EAB308' };
  if (days === 1) return { label: 'Recovering', color: '#F59E0B' };
  return { label: 'Trained today', color: palette.danger };
}

export default function MuscleRecovery({ entries, palette }: { entries: MuscleLogEntry[]; palette: Palette }) {
  // Nothing logged yet (brand-new account) — nothing meaningful to show,
  // and "everything is Fresh" for a reason that isn't really "recovery" is
  // more confusing than just not showing the card at all.
  if (entries.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Muscle Recovery</Text>
      {MUSCLE_GROUPS.map(group => {
        const days = daysSinceTrained(entries, group);
        const status = statusFor(days, palette);
        const CustomIcon = CUSTOM_ICONS[group];
        return (
          <View key={group} style={styles.row}>
            <View style={styles.rowIcon}>
              {CustomIcon ? (
                <CustomIcon color={palette.textMuted} size={17} />
              ) : (
                <Ionicons name={GROUP_ICONS[group]!} size={16} color={palette.textMuted} />
              )}
            </View>
            <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>{group}</Text>
            <View style={styles.rowStatus}>
              <View style={[styles.dot, { backgroundColor: status.color }]} />
              <Text style={[styles.rowStatusText, { color: status.color }]}>
                {status.label}
                {days !== null && days > 0 ? ` · ${days}d ago` : ''}
              </Text>
            </View>
          </View>
        );
      })}
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
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    flex: 1,
  },
  rowStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowStatusText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
  },
});
