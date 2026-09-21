// Shown when the app's initial boot (auth state + profile/liability checks —
// see App.tsx's RootNavigator) hasn't resolved within BOOT_TIMEOUT_MS. Most
// often this means the device is offline or on a network that can't reach
// Firebase (a captive portal, a dead Wi-Fi with no upstream) — NetInfo's own
// reachability flag isn't trustworthy enough on its own to gate this (it can
// report "connected" on a network that goes nowhere), so a plain wall-clock
// timeout on the boot sequence itself is the more honest signal: if loading
// genuinely hasn't finished in 20 seconds, something is wrong regardless of
// what NetInfo claims.
//
// Distinct from components/OfflineBanner.tsx, which handles losing
// connectivity DURING normal use (a thin persistent strip, not a blocking
// screen) — this one is specifically the "never even got in" cold-boot case.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, type } from '../theme/tokens';
import { usePalette } from '../theme/themedColors';
import { Button } from './ui';
import haptics from '../services/haptics';

type Props = {
  onRetry: () => void;
  retrying?: boolean;
};

export default function ConnectionFailedScreen({ onRetry, retrying }: Props) {
  const palette = usePalette();

  return (
    <View
      style={[styles.root, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel="Couldn't connect. We weren't able to load your data.">
      <View style={[styles.iconCircle, { backgroundColor: palette.dangerSoft }]}>
        <Ionicons name="cloud-offline" size={36} color={palette.danger} />
      </View>
      <Text style={[styles.title, { color: palette.textPrimary }]}>Can't connect right now</Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        We weren't able to load your data. Check your Wi-Fi or mobile data connection and try again.
      </Text>
      <Button
        label={retrying ? 'Trying again…' : 'Try again'}
        onPress={() => { haptics.selection(); onRetry(); }}
        disabled={retrying}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...type.title,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: {
    minWidth: 180,
  },
});
