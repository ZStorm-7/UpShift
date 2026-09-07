// Cross-platform "are you sure?" confirm. React Native's Alert.alert takes a
// button array on iOS/Android, but Expo's web target renders Alert.alert as
// a no-op for anything beyond a single OK button in some RN-web versions —
// so a two-button "Cancel / Log out" alert silently does nothing on web:
// no dialog appears, no callback fires, the tap looks completely dead.
//
// This routes to window.confirm on web (a real native browser dialog) and
// to Alert.alert everywhere else, so the same call site works on all three
// targets instead of only working on device.
import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/** Resolves true if the user confirmed, false if they cancelled/dismissed. */
export function confirmAsync(options: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmLabel, cancelLabel = 'Cancel', destructive } = options;

  if (Platform.OS === 'web') {
    // window.confirm blocks synchronously and returns a boolean directly —
    // wrapped in a resolved promise so call sites don't need a platform
    // branch of their own.
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(ok);
  }

  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
