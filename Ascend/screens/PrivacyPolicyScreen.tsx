import { ScrollView } from 'react-native';
import { Screen, AppBar } from '../components/ui';
import { spacing, layout } from '../theme/tokens';
import { usePalette } from '../theme/themedColors';
import PrivacyPolicyContent from '../components/PrivacyPolicyContent';
import { safeGoBack } from '../utils/nav';

export default function PrivacyPolicyScreen({ navigation }: any) {
  const palette = usePalette();

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: layout.bottomInset, gap: spacing.lg }}>
        <AppBar title="Privacy Policy" onBack={() => safeGoBack(navigation)} />
        <PrivacyPolicyContent palette={palette} />
      </ScrollView>
    </Screen>
  );
}
