// AnimatedTabBar — a segmented control whose fill SLIDES to the tapped tab
// instead of snapping. Replaces the instant-recolor tab rows that used to
// live separately in NutritionScreen (Search/Custom) and SettingsScreen
// (General/Account/Privacy/Subscription/Customize) — one component instead
// of two copies of the same idea drifting apart.
//
// Works for both shapes those two screens need: a fixed, equal-width track
// (Nutrition's 2 tabs) and a horizontally-scrolling row of variable-width
// pills (Settings' 5 tabs) — both measure each tab's own on-screen box via
// onLayout and animate one shared indicator to match, so neither needs to
// know the other's tab count or width up front.

import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { spacing, radius, type } from '../theme/tokens';
import { Palette } from '../theme/themedColors';
import { easing } from '../animation/motion';
import haptics from '../services/haptics';

type TabItem = { key: string; label: string };

type AnimatedTabBarProps = {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  palette: Palette;
  /** Settings' row scrolls horizontally with bordered, variable-width pills;
   *  Nutrition's is a fixed equal-width track. Same sliding mechanism either
   *  way — this only changes the outer container and each tab's box style. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function AnimatedTabBar({ tabs, activeKey, onChange, palette, scrollable, style }: AnimatedTabBarProps) {
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const hasMeasured = useRef(false);

  const moveIndicatorTo = useCallback((key: string, animate: boolean) => {
    const box = layouts.current[key];
    if (!box) return;
    if (animate) {
      indicatorX.value = withTiming(box.x, { duration: 260, easing: easing.standard });
      indicatorWidth.value = withTiming(box.width, { duration: 260, easing: easing.standard });
    } else {
      indicatorX.value = box.x;
      indicatorWidth.value = box.width;
    }
  }, []);

  const handleLayout = useCallback((key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layouts.current[key] = { x, width };
    // The active tab's own layout arrives asynchronously — the first time it
    // does, snap the indicator there instead of animating in from (0,0),
    // which would read as a bug ("why did it start off to the side?") rather
    // than a design choice.
    if (key === activeKey && !hasMeasured.current) {
      hasMeasured.current = true;
      moveIndicatorTo(key, false);
    }
  }, [activeKey, moveIndicatorTo]);

  function selectTab(key: string) {
    if (key === activeKey) return;
    haptics.selection();
    onChange(key);
    moveIndicatorTo(key, true);
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const Container = scrollable ? ScrollView : View;
  const containerProps = scrollable
    ? { horizontal: true, showsHorizontalScrollIndicator: false, style, contentContainerStyle: styles.trackScrollable }
    : { style: [styles.trackFixed, { backgroundColor: palette.surfaceSunken }, style] };

  return (
    <Container {...(containerProps as any)}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { backgroundColor: palette.accent, borderRadius: radius.pill },
          indicatorStyle,
        ]}
      />
      {tabs.map(tab => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onLayout={handleLayout(tab.key)}
            onPress={() => selectTab(tab.key)}
            style={[
              scrollable ? styles.tabScrollable : styles.tabFixed,
              scrollable && { borderColor: palette.border, borderWidth: 1 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}>
            <Text style={[styles.tabText, { color: active ? palette.textOnAccent : palette.textSecondary }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </Container>
  );
}

const styles = StyleSheet.create({
  trackFixed: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 3,
    position: 'relative',
  },
  trackScrollable: {
    flexDirection: 'row',
    gap: spacing.sm,
    position: 'relative',
    paddingVertical: 2,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
  },
  tabFixed: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabScrollable: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    ...type.label,
    textTransform: 'none',
    fontSize: 13,
  },
});
