// A dark-to-transparent fade pinned to the bottom of a scroll container,
// shown only while there's more content below the fold — the "there's more
// to scroll" cue asked for on Onboarding and the other long-form onboarding
// screens (legal gate, health sync). Hides itself once the user has
// scrolled to the bottom, so it never sits over content that's already
// fully visible.
//
// Built on react-native-svg's LinearGradient (already a dependency — see
// components/AuthBackground.tsx's RadialGradient) rather than
// expo-linear-gradient, which isn't installed in this project.

import { useState } from 'react';
import { View, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { usePalette } from '../theme/themedColors';

const FADE_HEIGHT = 56;
// How close to the bottom counts as "there" — a few px of rounding slack so
// momentum scrolling that stops 1-2px short doesn't leave the fade stuck on.
const BOTTOM_SLOP = 12;

/** Tracks whether a ScrollView's content overflows its viewport and, if so,
 *  whether the user has scrolled all the way to the bottom yet. Feed its
 *  `onScroll`/`onContentSizeChange`/`onLayout` into the ScrollView itself. */
export function useScrollOverflow() {
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [atBottom, setAtBottom] = useState(false);

  const overflowing = contentHeight > layoutHeight + BOTTOM_SLOP;
  const showFade = overflowing && !atBottom;

  return {
    showFade,
    onContentSizeChange: (_w: number, h: number) => setContentHeight(h),
    onLayout: (e: any) => setLayoutHeight(e.nativeEvent.layout.height),
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
      setAtBottom(distanceFromBottom <= BOTTOM_SLOP);
    },
  };
}

/** The fade itself. Absolutely positioned — place as the last child of a
 *  `position: relative` container wrapping the ScrollView. */
export default function ScrollFadeOverlay({ visible }: { visible: boolean }) {
  const palette = usePalette();
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg width="100%" height={FADE_HEIGHT}>
        <Defs>
          <LinearGradient id="scrollFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={palette.bg} stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height={FADE_HEIGHT} fill="url(#scrollFade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FADE_HEIGHT,
  },
});
