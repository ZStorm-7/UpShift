// The screen the splash dissolves into.
//
// That relationship is the reason this file looks the way it does. The splash
// ends on a chevron, the wordmark and a hairline, centred; this screen opens on
// exactly those three things, at the same size, drawn from the same path and
// the same text style (see `MARK` / `lockup` in components/Splash). The
// handover is a cross-fade of one image rather than a cut between two logos
// that merely resemble each other — which is what the old ▲ glyph made it.

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { spacing, type } from '../theme/tokens';
import { Screen, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE, lockup } from '../components/Splash';
import { useLanguage } from '../i18n/LanguageContext';

// The splash's own mark dimensions. Rendered at 1:1 here so the chevron doesn't
// resize across the handover.
const MARK_WIDTH = 64;
const MARK_HEIGHT = 56;

export default function WelcomeScreen({ navigation }: any) {
  const { t } = useLanguage();

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        {/* Mark, wordmark and hairline arrive as ONE block rather than three
            staggered ones. They are a single lockup, and staggering the parts
            of a logo would have it assembling itself immediately after the
            splash just finished assembling it. */}
        <Enter index={0}>
          <View
            style={styles.lockup}
            accessible
            accessibilityRole="image"
            accessibilityLabel="UpShift">
            <Svg width={MARK_WIDTH} height={MARK_HEIGHT} viewBox={MARK_VIEWBOX}>
              <Path
                d={MARK}
                stroke={colors.accent}
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={lockup.wordmark}>UPSHIFT</Text>
            <View style={lockup.hairline} />
          </View>
        </Enter>

        <Enter index={1}>
          <Text style={styles.subtitle}>{t('welcomeTagline')}</Text>
        </Enter>
      </View>

      <Enter index={2} style={styles.footer}>
        <Button
          label={t('getStarted')}
          fullWidth
          accessibilityLabel={t('getStarted')}
          onPress={() => navigation.navigate('Auth')}
        />
      </Enter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    paddingVertical: spacing.xxxl * 2,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  // Same gap the splash uses between its three elements, for the same reason:
  // it's what makes the chevron, the word and the rule read as one mark.
  lockup: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    width: '100%',
  },
});
