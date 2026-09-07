// AnimatedToggle — replaces React Native's plain <Switch> everywhere in this
// app, modeled on Jitter's "On / Off Toggle" reference: a pill track with a
// large circular knob, and an ON/OFF label that lives INSIDE the track,
// revealed in whichever side the knob isn't currently covering, rather than
// a separate label sitting outside the control.
//
// Same value/onValueChange contract as RN's Switch, so every existing call
// site swaps in as a drop-in replacement without touching its own state
// logic — only the control itself changes.

import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Palette } from '../theme/themedColors';
import { easing } from '../animation/motion';
import haptics from '../services/haptics';

const TRACK_WIDTH = 60;
const TRACK_HEIGHT = 32;
const KNOB_SIZE = 26;
const KNOB_INSET = (TRACK_HEIGHT - KNOB_SIZE) / 2;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2;

type AnimatedToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  palette: Palette;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export default function AnimatedToggle({
  value,
  onValueChange,
  palette,
  disabled,
  accessibilityLabel,
}: AnimatedToggleProps) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 220, easing: easing.standard });
  }, [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      // Off reads as a soft, unmistakably-inactive tint rather than a mid-
      // gray — the reference's own off-state is a pale tint of the on-color,
      // not a neutral gray, which is what makes the on/off states read as
      // two ends of ONE control instead of "colored" vs "broken looking".
      [palette.accentSoft, palette.accent]
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, KNOB_TRAVEL], Extrapolation.CLAMP) }],
  }));

  // The label doesn't slide with the knob — it's pinned to the side the
  // knob ISN'T covering, and crossfades between "ON"/"OFF" as the knob
  // passes the track's midpoint, so it's never legible half-hidden under
  // the knob mid-drag.
  const offLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));
  const onLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.selection();
        onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={disabled && styles.disabled}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.Text style={[styles.label, styles.labelOff, { color: palette.textOnAccent }, offLabelStyle]}>
          OFF
        </Animated.Text>
        <Animated.Text style={[styles.label, styles.labelOn, { color: palette.textOnAccent }, onLabelStyle]}>
          ON
        </Animated.Text>
        <Animated.View
          style={[styles.knob, { backgroundColor: palette.bg }, knobStyle]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    left: KNOB_INSET,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  // OFF sits on the right, clear of the knob's resting position on the left.
  labelOff: {
    right: 7,
  },
  // ON sits on the left, clear of the knob's resting position on the right.
  labelOn: {
    left: 7,
  },
});
