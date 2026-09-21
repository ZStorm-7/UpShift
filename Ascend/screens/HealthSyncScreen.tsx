// HealthSyncScreen — offered once, right after the "Let's get started"
// preview and before Onboarding's questions begin. Requesting the OS
// permission here (rather than only ever from Settings, where it lived
// before) means whatever height/weight Apple Health / Health Connect
// already has on file can pre-fill those onboarding questions instead of
// asking for numbers the phone already knows.
//
// Always skippable and never blocks progress — see services/health.ts for
// why every call here fails soft (false/null) rather than throwing, and
// note the file's own caveat that the underlying native modules have not
// been exercised on a real device/build yet.
//
// Whatever this successfully reads is handed forward as `Onboarding`'s
// route params (`healthPrefill`) rather than written anywhere itself — this
// screen runs before a profile document exists, so there's nothing to
// merge partial data into yet.

import { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, layout, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import haptics from '../services/haptics';
import { isHealthAvailable, requestHealthPermission, fetchRecentWeight, fetchHeight } from '../services/health';

export type HealthPrefill = {
  weightLbs?: number;
  heightFeet?: number;
  heightInches?: number;
};

const PLATFORM_NAME = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

export default function HealthSyncScreen({ navigation }: any) {
  const palette = usePalette();
  const [connecting, setConnecting] = useState(false);

  const goToOnboarding = (healthPrefill?: HealthPrefill, healthSyncEnabled?: boolean) => {
    navigation.replace('Onboarding', { healthPrefill, healthSyncEnabled });
  };

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const available = await isHealthAvailable();
      if (!available) {
        haptics.error();
        goToOnboarding(undefined, false);
        return;
      }
      const granted = await requestHealthPermission();
      if (!granted) {
        haptics.error();
        goToOnboarding(undefined, false);
        return;
      }
      const [weight, heightInches] = await Promise.all([fetchRecentWeight(), fetchHeight()]);
      const prefill: HealthPrefill = {};
      if (weight) prefill.weightLbs = Math.round(weight.value);
      if (heightInches != null) {
        prefill.heightFeet = Math.floor(heightInches / 12);
        prefill.heightInches = heightInches % 12;
      }
      haptics.setComplete();
      goToOnboarding(prefill, true);
    } finally {
      setConnecting(false);
    }
  };

  const skip = () => {
    haptics.selection();
    goToOnboarding(undefined, false);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Enter index={0}>
          <View style={[styles.iconCircle, { backgroundColor: palette.accentSoft }]}>
            <Ionicons name="heart" size={30} color={palette.accent} />
          </View>
        </Enter>
        <Enter index={1}>
          <Text style={[styles.title, { color: palette.textPrimary }]}>Connect {PLATFORM_NAME}</Text>
        </Enter>
        <Enter index={2}>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            If you already track your height and weight in {PLATFORM_NAME}, we can fill those in for
            you automatically — skipping straight past those questions. Anything it doesn't have,
            we'll still ask you directly.
          </Text>
        </Enter>
        <View style={styles.footer}>
          <Button
            label={connecting ? 'Connecting…' : `Connect ${PLATFORM_NAME}`}
            onPress={connect}
            disabled={connecting}
            fullWidth
          />
          <Button label="Skip for now" onPress={skip} variant="ghost" disabled={connecting} fullWidth />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    ...type.title,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    textAlign: 'center',
  },
  footer: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
