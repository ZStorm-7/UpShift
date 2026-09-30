// The one-time preview shown right after a brand-new account is created,
// before any onboarding question is asked. Its whole job is to set
// expectations: three CHAPTERS, not the dozen individual questions inside
// them, so a new user knows the shape of what's coming before diving in.
//
// Reached only via an explicit navigation.replace('OnboardingIntro') from the
// post-signup flow (see App.tsx's RootNavigator comment) — never from
// cold-boot routing, so an existing user who hasn't finished onboarding goes
// straight back into the questions instead of seeing this every reopen.
//
// The three chapters map onto OnboardingScreen's 15 steps exactly as that
// screen's own CHAPTERS constant defines them:
//   1. Basics     -> steps 1-4  (name, date of birth, height, weight)
//   2. About You  -> steps 5-12 (body fat, gender, activity, lifting/cardio
//                                experience, physical considerations, expenditure)
//   3. Your Goals -> steps 13-15 (goals, referral source, summary)
// Kept in sync by hand, not by import - this screen doesn't render
// OnboardingScreen's progress bar, just previews the same three names before
// it. If the step count or chapter boundaries change there, update both.

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, Button } from '../components/ui';
import { Enter } from '../components/dashboard';

// Diameter of the numbered circle. 36 sits in the middle of the 32-40px
// range the design reference calls for — big enough to read the numeral at
// a glance, small enough that three of them plus the connecting line don't
// dominate the screen.
const CIRCLE_SIZE = 36;

type Chapter = {
  title: string;
  /** Shown only under the active (chapter 1) circle — 2 and 3 are just a
   *  title, since they read as "not yet" rather than "here's the detail." */
  description?: string;
};

const chapters: Chapter[] = [
  {
    title: 'Basics',
    description:
      "We'll start with a few basics — your name, birthday, and body stats. These give your plan its foundation.",
  },
  { title: 'About You' },
  { title: 'Your Goals' },
];

export default function OnboardingIntroScreen({ navigation }: any) {
  const palette = usePalette();

  const goToFirstChapter = () => {
    // HealthSync runs first — whatever it reads from Apple Health/Health
    // Connect is handed to Onboarding as route params so height/weight
    // questions the phone already has an answer for can be skipped. See
    // HealthSyncScreen's own navigation.replace('Onboarding', ...) for
    // where the flow continues from there.
    navigation.replace('HealthSync');
  };

  return (
    <Screen>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Enter index={0}>
          <Text style={[styles.header, { color: palette.textPrimary }]}>Let's build your plan</Text>
        </Enter>
        <Enter index={1}>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            Your personalized plan awaits.
          </Text>
        </Enter>

        <View style={styles.timeline}>
          {chapters.map((chapter, index) => {
            const isActive = index === 0;
            const isLast = index === chapters.length - 1;
            return (
              <Enter index={index + 2} key={chapter.title}>
                <View style={styles.chapterRow}>
                  <View style={styles.rail}>
                    <View
                      style={[
                        styles.circle,
                        isActive
                          ? { backgroundColor: palette.accent, borderColor: palette.accent }
                          : { backgroundColor: 'transparent', borderColor: palette.border },
                      ]}>
                      <Text
                        style={[
                          styles.circleNumber,
                          { color: isActive ? palette.textOnAccent : palette.textMuted },
                        ]}>
                        {index + 1}
                      </Text>
                    </View>
                    {/* Only the segment leading OUT of chapter 1 is accented —
                        a subtle "progress so far" signal, not a big animated
                        fill. Every other segment is neutral. Stretches to
                        fill the rail's height (set by the taller sibling,
                        the content column) so it visually reaches the next
                        circle regardless of how tall this chapter's content is. */}
                    {!isLast && (
                      <View
                        style={[
                          styles.connector,
                          { backgroundColor: index === 0 ? palette.accent : palette.border },
                        ]}
                      />
                    )}
                  </View>
                  <View style={[styles.chapterContent, !isLast && styles.chapterContentGap]}>
                    <Text
                      style={[
                        styles.chapterTitle,
                        { color: isActive ? palette.textPrimary : palette.textMuted },
                      ]}>
                      {chapter.title}
                    </Text>
                    {isActive && !!chapter.description && (
                      <Text style={[styles.chapterDescription, { color: palette.textSecondary }]}>
                        {chapter.description}
                      </Text>
                    )}
                  </View>
                </View>
              </Enter>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label={`Go to ${chapters[0].title}`} onPress={goToFirstChapter} fullWidth />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    ...type.display,
    fontFamily: fontFamily.sansBlack,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    ...type.body,
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl,
  },

  timeline: {
    // No gap here — the connecting line relies on each row's rail column
    // stretching to match the content column's height (including its own
    // bottom padding), so a gap between rows would leave a visible break in
    // the line. Spacing between chapters comes from chapterContentGap
    // instead.
  },
  chapterRow: {
    flexDirection: 'row',
  },
  rail: {
    width: CIRCLE_SIZE + spacing.md,
    alignItems: 'center',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: layout.hairline * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleNumber: {
    ...type.heading,
    fontSize: 15,
  },
  connector: {
    width: 2,
    flex: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderRadius: 1,
  },
  chapterContent: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  chapterContentGap: {
    paddingBottom: spacing.xxl,
  },
  chapterTitle: {
    ...type.heading,
    fontSize: 17,
  },
  chapterDescription: {
    ...type.body,
    marginTop: spacing.xs,
  },

  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
