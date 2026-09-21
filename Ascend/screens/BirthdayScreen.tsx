// BirthdayScreen — placeholder. Navigated to automatically once per day
// from the Dashboard when today matches the user's stored birthday (see
// DashboardScreen's birthday effect). Dismissible: tapping through just
// goes back to the Dashboard underneath, nothing here blocks the rest of
// the app.

import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Button } from '../components/ui';
import { spacing } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { useUser } from '../context/UserContext';
import { safeGoBack } from '../utils/nav';

export default function BirthdayScreen({ navigation }: any) {
  const palette = usePalette();
  const { profile } = useUser();

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <View style={styles.body}>
        <Ionicons name="gift" size={56} color={palette.accent} style={styles.icon} />
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          Happy Birthday{(profile?.nickname || profile?.firstName) ? `, ${profile?.nickname || profile?.firstName}` : ''}!
        </Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          Here's to another year of leveling up.
        </Text>
        <Button label="Thanks!" onPress={() => safeGoBack(navigation)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, paddingHorizontal: spacing.xl,
  },
  icon: { marginBottom: spacing.sm },
  title: { fontFamily: fontFamily.serif, fontSize: 26, textAlign: 'center' },
  subtitle: { fontFamily: fontFamily.sans, fontSize: 15, textAlign: 'center', marginBottom: spacing.lg },
});
