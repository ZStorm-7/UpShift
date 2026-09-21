// SwipeToDelete — wraps a list row so swiping it left reveals a delete
// button underneath, instead of the row carrying its own always-visible
// delete icon (the food log's "✕" button, the pattern this replaces).
//
// Deliberately reveal-then-tap, not swipe-to-instant-delete: a fast swipe
// that immediately deletes is one accidental gesture away from losing data
// with no undo. Requiring a second, deliberate tap on the revealed button
// costs one extra tap and buys back "I can't delete this by accident."
//
// The row's own removal animation (once the delete actually happens) is the
// caller's job via Reanimated's `layout`/`exiting` props on whatever wraps
// the list item — this component only owns the swipe gesture and the
// reveal, not what happens to the list afterward.

import { ReactNode, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Extrapolation,
  interpolate,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../theme/tokens';
import { Palette } from '../theme/themedColors';
import { easing } from '../animation/motion';
import haptics from '../services/haptics';

const ACTION_WIDTH = 72;
// How far past the action's own width the row can be dragged before it
// resists — a small give so the gesture doesn't feel like it hit a wall,
// without letting the row be yanked halfway across the screen.
const OVERDRAG = 24;

type SwipeToDeleteProps = {
  children: ReactNode;
  onDelete: () => void;
  palette: Palette;
  /** Announced on the revealed delete button — e.g. "Delete Chicken breast". */
  deleteLabel?: string;
  /** Opaque background the row needs to fully cover the action underneath
   *  it while closed. Defaults to the card surface color; pass the row's
   *  own background if it differs (e.g. a "you" row tinted a different
   *  color than its neighbors). */
  rowBackgroundColor?: string;
  /** False for a row that's a hairline-divided slice of one shared card
   *  (no rounded corners of its own) rather than an individually-cornered
   *  card floating over the action. */
  rounded?: boolean;
};

export default function SwipeToDelete({
  children,
  onDelete,
  palette,
  deleteLabel = 'Delete',
  rowBackgroundColor,
  rounded = true,
}: SwipeToDeleteProps) {
  const translateX = useSharedValue(0);
  const [open, setOpen] = useState(false);

  function setOpenJS(v: boolean) {
    setOpen(v);
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate(e => {
      // Only ever drags leftward from wherever it currently rests (0 or
      // fully open at -ACTION_WIDTH) — dragging right past 0 or left past
      // the action's width both just get slower, not stuck.
      const base = open ? -ACTION_WIDTH : 0;
      const raw = base + e.translationX;
      translateX.value = Math.max(-ACTION_WIDTH - OVERDRAG, Math.min(0, raw));
    })
    .onEnd(e => {
      const shouldOpen = translateX.value < -ACTION_WIDTH / 2 || e.velocityX < -500;
      translateX.value = withTiming(shouldOpen ? -ACTION_WIDTH : 0, { duration: 220, easing: easing.standard });
      runOnJS(setOpenJS)(shouldOpen);
      if (shouldOpen) runOnJS(haptics.selection)();
    });

  function handleDeletePress() {
    haptics.selection();
    onDelete();
  }

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-ACTION_WIDTH, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.wrap}>
      {/* Sits behind the row, revealed as the row slides left over it. */}
      <Animated.View
        style={[
          styles.action,
          { backgroundColor: palette.danger, borderRadius: rounded ? radius.lg : 0 },
          actionStyle,
        ]}>
        <Pressable
          onPress={handleDeletePress}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}>
          <Ionicons name="trash" size={20} color="#fff" />
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, { backgroundColor: rowBackgroundColor ?? palette.surface }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    // No overflow:'hidden' — same footgun documented on CalorieRing's wrap:
    // clipping this on iOS has broken Reanimated-driven children elsewhere
    // in this app before. The action sits fully behind the row and is only
    // ever revealed by the row's own translateX, so nothing needs clipping.
  },
  row: {
    zIndex: 1,
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: ACTION_WIDTH,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
