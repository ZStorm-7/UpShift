// BottomSheet — the scrim + slide-up card shape that was living inline in
// DashboardScreen's weight-entry modal, formalized so the next one-off
// prompt this app needs doesn't reinvent it slightly differently. Uses the
// platform's own `animationType="slide"` rather than a hand-rolled
// Reanimated drag sheet — nothing here needs swipe-to-dismiss, and the
// native slide is already the right motion for free.

import { ReactNode } from 'react';
import { View, Modal, Pressable, ScrollView, StyleSheet, StyleProp, ViewStyle, KeyboardAvoidingView, Platform } from 'react-native';
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
      {/* Any caller that puts a text field in here (the delete-account
          confirmation code, say) needs the sheet to rise with the keyboard —
          without this, the sheet stays pinned to the bottom of the screen
          and the keyboard simply covers whatever's in its bottom half,
          which on a short sheet can be the input itself. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        {/* Tapping the scrim dismisses, same as tapping outside any other
            sheet on either platform — callers still get to keep their own
            explicit Cancel button too, this is additive. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {/* `padding` behavior shifts this whole sheet up by exactly the
            keyboard's height (never more, never less), so the sheet ends up
            sitting flush on top of the keyboard rather than the app
            guessing at an offset. That shift can still push a tall sheet's
            TOP past the top of the screen with nothing able to reveal it —
            capping the height and scrolling the content internally is what
            keeps every line reachable (title included) instead of some of
            it just being gone. */}
        <View
          style={[
            styles.content,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.contentInner, contentStyle]}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    // instead of floating like a centered card. Capped rather than
    // unbounded so a keyboard-shifted sheet scrolls internally instead of
    // its top edge sliding off the top of the screen.
    maxHeight: '85%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: layout.hairline,
  },
  contentInner: {
    padding: spacing.xl,
    gap: spacing.md,
  },
});
