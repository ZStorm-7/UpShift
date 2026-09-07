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
import { spacing, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, Button } from '../components/ui';
import { Enter } from '../components/dashboard';
import { MARK, MARK_VIEWBOX, MARK_STROKE, lockup } from '../components/Splash';
import { useLanguage } from '../i18n/LanguageContext';

// Bigger than the splash's own 64x56 mark — this is the one place the brand
// has to read clearly on an actual phone screen before the user has any
// other context, so it gets sized for that rather than for matching the
// splash animation exactly.
const MARK_WIDTH = 84;
const MARK_HEIGHT = 74;

export default function WelcomeScreen({ navigation }: any) {
  const { t } = useLanguage();
  const palette = usePalette();

  return (
    <Screen style={[styles.container, { backgroundColor: palette.bg }]}>
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
                stroke={palette.accent}
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            {/* Bigger than the splash's wordmark, and explicitly themed —
                `lockup.wordmark` is styled for the splash's always-dark
                background (a static `colors.textPrimary`), which reads as
                a barely-visible near-white ghost against this screen's
                light-mode background during daytime auto-theme hours. */}
            <Text style={[lockup.wordmark, styles.wordmark, { color: palette.textPrimary }]}>
              UPSHIFT
            </Text>
            <View style={[lockup.hairline, { backgroundColor: palette.accent }]} />
          </View>
        </Enter>

        <Enter index={1}>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{t('welcomeTagline')}</Text>
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
    paddingTop: spacing.xxxl * 2,
    // Less than paddingTop on purpose — pulls the CTA up off the very
    // bottom edge (which read as stranded down by the home indicator)
    // without touching the top-half layout of the logo lockup.
    paddingBottom: spacing.xxl,
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
  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    ...type.body,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    width: '100%',
  },
});
