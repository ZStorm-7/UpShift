// ConfirmDialogHost — renders whatever confirmAsync (utils/confirm.ts) is
// currently waiting on, as a centered app-styled dialog instead of the
// browser's own window.confirm chrome. Mounted ONCE, near the app root (see
// App.tsx) — every confirmAsync call anywhere in the app (Settings' log-out
// and delete-account rows, and anywhere else that asks "are you sure?" on
// web) is answered by this same instance, since there's exactly one pending
// request at a time by construction (a second confirmAsync call before the
// first resolves would just replace it, same as a second window.confirm
// would have blocked behind the first).
//
// Native (iOS/Android) never reaches this component at all — confirmAsync
// only publishes a request on Platform.OS === 'web', so this renders null
// forever there. No harm in mounting it anyway; it costs one always-null
// subscription.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { Button } from './ui';
import { subscribeToConfirmRequest, respondToConfirmRequest, type ConfirmRequest } from '../utils/confirm';

export default function ConfirmDialogHost() {
  const palette = usePalette();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => subscribeToConfirmRequest(setRequest), []);

  const visible = request !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => respondToConfirmRequest(false)}>
      <View style={[styles.overlay, { backgroundColor: palette.scrim }]}>
        {/* Tapping the scrim cancels, same as dismissing window.confirm or
            tapping outside a native Alert. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => respondToConfirmRequest(false)}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        />
        {request && (
          <View
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
            accessibilityRole="alert">
            <Text style={[styles.title, { color: palette.textPrimary }]}>{request.title}</Text>
            <Text style={[styles.message, { color: palette.textSecondary }]}>{request.message}</Text>
            <View style={styles.actions}>
              <Button
                label={request.cancelLabel ?? 'Cancel'}
                variant="secondary"
                onPress={() => respondToConfirmRequest(false)}
                style={styles.flexOne}
              />
              <Button
                label={request.confirmLabel}
                variant={request.destructive ? 'danger' : 'primary'}
                onPress={() => respondToConfirmRequest(true)}
                style={styles.flexOne}
              />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: layout.hairline,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...type.title,
  },
  message: {
    ...type.body,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  flexOne: {
    flex: 1,
  },
});
