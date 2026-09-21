// SidePanel — the slide-out menu that replaced Dashboard's old text nav row
// for Friends / Leaderboard / History / Settings.
//
// Those four moved OUT of the always-visible nav row so that row could be
// repurposed for the things a user actually opens every day (Nutrition,
// Workout) — Friends/Leaderboard/History/Weight/Settings are still one tap
// away, just behind the hamburger button instead of competing for space in
// the daily row.
//
// Styled after Jitter's "Liquid Glass Menu" reference: a frosted vertical
// rail of icon-only buttons (not a horizontal bar — this app's version runs
// top-to-bottom along the left edge) that fills the full height of the panel
// rather than clustering at the top, with a dedicated "back to Dashboard"
// glyph so the panel is fully self-contained without relying on the
// backdrop tap.
//
// Built from scratch: there was no existing drawer component or library in
// this codebase to extend (checked). A transparent Modal is the same idiom
// this app already uses for slide-in overlays (see the weight-log bottom
// sheet in DashboardScreen), so this follows that rather than introducing a
// new pattern — just sliding from the left edge instead of up from the
// bottom.

import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Extrapolation,
  interpolate,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, type } from '../theme/tokens';
import { Palette } from '../theme/themedColors';
import { easing } from '../animation/motion';
import haptics from '../services/haptics';

const ICON_SIZE = 22;

type SidePanelItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type SidePanelProps = {
  visible: boolean;
  onClose: () => void;
  items: SidePanelItem[];
  palette: Palette;
  isDark?: boolean;
};

export default function SidePanel({ visible, onClose, items, palette, isDark }: SidePanelProps) {
  const insets = useSafeAreaInsets();
  // Narrow — this is an icon rail, not a text drawer, so it only needs to be
  // wide enough for a comfortable tap target plus its label underneath.
  // Read reactively (not Dimensions.get at module scope) because on Expo web
  // the window isn't sized yet at module-eval time, which made this collapse
  // to a 0-width panel that was rendering fully off to the side, invisibly.
  const { width: windowWidth } = useWindowDimensions();
  const PANEL_WIDTH = Math.min(120, windowWidth * 0.32);
  // Drives both the panel's slide-in and the backdrop's fade — one value,
  // so the two motions can never drift out of sync the way two independently
  // timed animations could.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 260, easing: easing.standard });
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-PANEL_WIDTH, 0], Extrapolation.CLAMP) },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Backdrop — covers the whole screen; tapping it is the same as
            tapping the close button, which is what makes a slide-out panel
            read as dismissible rather than a trap. */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>

        <Animated.View
          style={[styles.panel, { width: PANEL_WIDTH }, panelStyle]}>
          <BlurView
            intensity={isDark ? 40 : 60}
            tint={isDark ? 'dark' : 'light'}
            style={[
              styles.glass,
              {
                paddingTop: insets.top + spacing.md,
                paddingBottom: insets.bottom + spacing.md,
                borderColor: palette.border,
              },
            ]}>
            {/* Back-to-dashboard glyph — the panel's own dismiss action,
                distinct from Friends/Leaderboard/etc so the rail reads as
                "here's where you are, and here's everything else" rather
                than one undifferentiated list. */}
            <Pressable
              onPress={() => {
                haptics.selection();
                onClose();
              }}
              style={styles.item}
              accessibilityRole="button"
              accessibilityLabel="Back to dashboard">
              <View style={[styles.iconBubble, { backgroundColor: palette.accent }]}>
                <Ionicons name="home" size={ICON_SIZE} color={palette.textOnAccent} />
              </View>
              <Text style={[styles.itemLabel, { color: palette.textPrimary }]} numberOfLines={1}>
                Home
              </Text>
            </Pressable>

            {/* Icon rail fills the remaining height and spaces its items
                evenly across it, so the rail reads as one continuous vertical
                bar rather than a cluster pinned to the top. */}
            <View style={styles.rail}>
              {items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    haptics.selection();
                    onClose();
                    item.onPress();
                  }}
                  style={styles.item}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}>
                  <View style={[styles.iconBubble, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
                    <Ionicons name={item.icon} size={ICON_SIZE} color={palette.textPrimary} />
                  </View>
                  <Text style={[styles.itemLabel, { color: palette.textMuted }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    // A hairline-and-shadow edge is what tells the eye this panel is ABOVE
    // the dashboard rather than just a same-plane column — a flat edge with
    // no depth cue reads as part of the page underneath it.
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  glass: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // The rail itself is what "covers the entire vertical bar" — it stretches
  // to fill whatever height is left under the Home glyph and distributes
  // items evenly across that full span instead of stacking them tight at
  // the top with dead space below.
  rail: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemLabel: {
    ...type.label,
    textTransform: 'none',
    fontSize: 11,
  },
});
