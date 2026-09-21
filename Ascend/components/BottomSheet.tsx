// BottomSheet — the scrim + slide-up card shape that was living inline in
// DashboardScreen's weight-entry modal, formalized so the next one-off
// prompt this app needs doesn't reinvent it slightly differently. Uses the
// platform's own `animationType="slide"` rather than a hand-rolled
// Reanimated drag sheet — nothing here needs swipe-to-dismiss, and the
// native slide is already the right motion for free.

import { ReactNode } from 'react';
import { View, Modal, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { radius, spacing, layout } from '../theme/tokens';
import { Palette } from '../theme/themedColors';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  palette: Palette;
  contentStyle?: StyleProp<ViewStyle>;
};

export default function BottomSheet({ visible, onClose, children, palette, contentStyle }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        {/* Tapping the scrim dismisses, same as tapping outside any other
            sheet on either platform — callers still get to keep their own
            explicit Cancel button too, this is additive. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.content,
            { backgroundColor: palette.surface, borderColor: palette.border },
            contentStyle,
          ]}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    // Only the top corners round — the sheet still meets the screen edge
    // instead of floating like a centered card.
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: layout.hairline,
    padding: spacing.xl,
    gap: spacing.md,
  },
});
