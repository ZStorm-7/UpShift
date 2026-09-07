// MotivationScreen — placeholder destination for the "Motivation" entry
// point on the Dashboard. No real content yet; this exists so the
// navigation target is real and the entry point can be wired up ahead of
// the actual feature (daily quotes / motivational content) landing here.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, AppBar } from '../components/ui';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { safeGoBack } from '../utils/nav';

export default function MotivationScreen({ navigation }: any) {
  const palette = usePalette();

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <AppBar title="Motivation" onBack={() => safeGoBack(navigation)} />
      <View style={styles.body}>
        <Ionicons name="sparkles" size={40} color={palette.accent} style={styles.icon} />
        <Text style={[styles.title, { color: palette.textPrimary }]}>Coming soon</Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          A daily boost to keep you going — this space is reserved for it.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  icon: { marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.serif, fontSize: 22 },
  subtitle: { fontFamily: fontFamily.sans, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
