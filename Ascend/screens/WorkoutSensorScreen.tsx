// WorkoutSensorScreen — placeholder for the sensor-based run/walk check.
//
// Deliberately narrow, per the product call: this does NOT try to count
// steps or read heart rate — it only answers one question, "is the phone's
// motion consistent with running/walking right now?" via a simple
// accelerometer cadence check (counting how often the acceleration
// magnitude crosses back over its own rolling average — a basic step-cadence
// heuristic, not a trained model). Good enough to flag "yes, this looks
// like walking/running" for a placeholder; a production version would want
// a proper pedometer-grade algorithm.

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import { spacing, radius } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar } from '../components/ui';
import { safeGoBack } from '../utils/nav';

const SAMPLE_INTERVAL_MS = 100;
// A cadence between these bounds (crossings per second) reads as
// walking/running; a stationary or erratic phone won't land in this band.
const MIN_CADENCE_HZ = 1.2;
const MAX_CADENCE_HZ = 4.0;
const WINDOW_MS = 4000;

export default function WorkoutSensorScreen({ navigation, route }: any) {
  const palette = usePalette();
  const exerciseName: string = route?.params?.exerciseName ?? 'Run / Walk';
  const [status, setStatus] = useState<'waiting' | 'detected' | 'not-detected'>('waiting');
  const [available, setAvailable] = useState<boolean | null>(null);
  const crossingsRef = useRef<number[]>([]); // timestamps of crossings within the window
  const lastAboveRef = useRef(false);
  const runningAvgRef = useRef(1); // ~1g at rest

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    (async () => {
      const isAvail = await Accelerometer.isAvailableAsync();
      setAvailable(isAvail);
      if (!isAvail) return;

      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        // Slow-moving average tracks the phone's baseline (gravity plus
        // whatever steady orientation it's held at); crossings above/below
        // that average — not a fixed threshold — is what makes this work
        // regardless of how the phone is held.
        runningAvgRef.current = runningAvgRef.current * 0.9 + magnitude * 0.1;
        const isAbove = magnitude > runningAvgRef.current;
        const now = Date.now();
        if (isAbove && !lastAboveRef.current) {
          crossingsRef.current.push(now);
        }
        lastAboveRef.current = isAbove;
        crossingsRef.current = crossingsRef.current.filter(t => now - t <= WINDOW_MS);

        const cadenceHz = crossingsRef.current.length / (WINDOW_MS / 1000);
        setStatus(cadenceHz >= MIN_CADENCE_HZ && cadenceHz <= MAX_CADENCE_HZ ? 'detected' : 'not-detected');
      });
    })();
    return () => subscription?.remove();
  }, []);

  const statusText =
    available === false ? "This device doesn't report motion data."
    : status === 'detected' ? "Looks like you're moving — keep going!"
    : status === 'not-detected' ? 'Not detecting running or walking yet.'
    : 'Hold your phone and start moving…';

  const statusColor =
    status === 'detected' ? palette.accent
    : status === 'not-detected' ? palette.textMuted
    : palette.textSecondary;

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <AppBar title="Run / Walk" onBack={() => safeGoBack(navigation)} />
      <View style={styles.body}>
        <Text style={[styles.betaTag, { color: palette.textMuted, borderColor: palette.border }]}>BETA</Text>
        <View style={[styles.pulseCircle, { borderColor: statusColor }]}>
          <Ionicons name="walk" size={40} color={statusColor} />
        </View>
        <Text style={[styles.exerciseLabel, { color: palette.textPrimary }]}>{exerciseName}</Text>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        <Text style={[styles.hint, { color: palette.textMuted }]}>
          This only checks that your motion looks like running or walking — it
          doesn't count steps or track heart rate.
        </Text>
        <Pressable onPress={() => safeGoBack(navigation)} style={[styles.doneButton, { borderColor: palette.border }]}>
          <Text style={[styles.doneButtonText, { color: palette.textPrimary }]}>Done</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, paddingHorizontal: spacing.xl,
  },
  betaTag: {
    fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 1.2,
    borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  pulseCircle: {
    width: 96, height: 96, borderRadius: 48, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  exerciseLabel: { fontFamily: fontFamily.serif, fontSize: 20, marginTop: spacing.sm },
  statusText: { fontFamily: fontFamily.sansBold, fontSize: 15, textAlign: 'center' },
  hint: { fontFamily: fontFamily.sans, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  doneButton: {
    marginTop: spacing.lg, borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  doneButtonText: { fontFamily: fontFamily.sansBold, fontSize: 14 },
});
