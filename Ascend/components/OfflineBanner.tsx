// OfflineBanner — a persistent strip shown whenever the device has no
// usable internet connection.
//
// Mounted once, app-wide (see App.tsx's ThemedNavigator) rather than
// per-screen, because losing connection isn't a property of any one screen:
// every screen in this app reads or writes Firestore, so any of them can be
// the one where a user notices something is wrong.
//
// Uses `isInternetReachable` in preference to `isConnected`. They are not
// the same thing and the difference matters here: `isConnected` only says a
// network interface is up, which is true of a phone attached to a captive
// portal Wi-Fi that hasn't been logged into, or a router with no upstream —
// exactly the cases where Firestore silently fails and the user has no idea
// why. `isInternetReachable` is null while still being determined, which is
// treated as online so the banner never flashes during a normal cold start.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { spacing, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';

export default function OfflineBanner() {
  const palette = usePalette();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // `null` means "not determined yet" — treat as online so this can't
      // flash on launch before the first probe completes.
      const reachable = state.isInternetReachable ?? true;
      setOffline(!state.isConnected || !reachable);
    });
    return unsubscribe;
  }, []);

  if (!offline) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: palette.danger }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Text style={styles.text}>
        You're offline — connect to Wi-Fi or turn on mobile data to keep syncing.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: layout.hairline,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  text: {
    color: '#fff',
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
    textAlign: 'center',
  },
});
