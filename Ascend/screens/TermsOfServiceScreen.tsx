import { ScrollView } from 'react-native';
import { Screen, AppBar } from '../components/ui';
import { spacing, layout } from '../theme/tokens';
import { usePalette } from '../theme/themedColors';
import TermsOfServiceContent from '../components/TermsOfServiceContent';
import { safeGoBack } from '../utils/nav';

export default function TermsOfServiceScreen({ navigation }: any) {
  const palette = usePalette();

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: layout.bottomInset, gap: spacing.lg }}>
        <AppBar title="Terms of Service" onBack={() => safeGoBack(navigation)} />
        <TermsOfServiceContent palette={palette} />
      </ScrollView>
    </Screen>
  );
}
