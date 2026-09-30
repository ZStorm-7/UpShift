// Cross-platform "are you sure?" confirm.
//
// Native (iOS/Android) uses Alert.alert, same as always. Web used to fall
// back to window.confirm — a real, working dialog, but the browser's own
// unstyled one, not the app's: the one moment the UI hands control to the
// OS chrome instead of drawing itself. ConfirmDialogHost (rendered once
// near the app root — see App.tsx) now renders that same request as a
// properly styled in-app dialog instead. confirmAsync's own signature and
// every call site are unchanged — this file just stopped reaching for
// window.confirm itself and started handing the request to that host
// through a tiny module-level store, since confirmAsync is called from
// plain functions all over the app, not from inside a component that could
// hold the pending request as state.
import { Alert, Platform } from 'react-native';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ConfirmRequest = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

let currentRequest: ConfirmRequest | null = null;
let listeners: Array<(request: ConfirmRequest | null) => void> = [];

function publish(request: ConfirmRequest | null) {
  currentRequest = request;
  listeners.forEach(listener => listener(request));
}

/** ConfirmDialogHost-only: subscribe to the current pending request (null
 * when none is open). Returns an unsubscribe function. */
export function subscribeToConfirmRequest(listener: (request: ConfirmRequest | null) => void) {
  listeners.push(listener);
  listener(currentRequest);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/** ConfirmDialogHost-only: resolve the current request and close it. */
export function respondToConfirmRequest(ok: boolean) {
  currentRequest?.resolve(ok);
  publish(null);
}

/** Resolves true if the user confirmed, false if they cancelled/dismissed. */
export function confirmAsync(options: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    // No host mounted (shouldn't happen — App.tsx renders one at the root —
    // but a call from a context that somehow predates it should still ask
    // rather than silently returning false) falls back to window.confirm.
    if (listeners.length === 0) {
      const ok = typeof window !== 'undefined' && window.confirm(`${options.title}\n\n${options.message}`);
      return Promise.resolve(ok);
    }
    return new Promise(resolve => {
      publish({ ...options, resolve });
    });
  }

  const { title, message, confirmLabel, cancelLabel = 'Cancel', destructive } = options;
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
