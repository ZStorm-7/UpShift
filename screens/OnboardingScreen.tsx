import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, SectionTitle, Button, Field, Pill } from '../components/ui';
import { PressableScale, AnimatedMeter, Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import haptics from '../services/haptics';
import { useUser, calculateWaterGoal, calculateCalorieGoal } from '../context/UserContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES, LanguageCode } from '../i18n/translations';
import { uploadProfilePhoto, photoUploadAvailable } from '../services/avatar';
import AvatarView from '../components/Avatar';
import { logOnboardingEvent } from '../firebase/analytics';

// Named for the same reason EditProfileScreen's preview one is — the
// skeleton/preview have to agree on a size or the row jumps.
const AVATAR_SIZE = 56;

// How many steps the flow has. Named so the progress bar and the "Step N of M"
// line can never disagree with each other.
const TOTAL_STEPS = 5;

// Every selected option carries this as well as the colour change, because a
// cyan border is the whole of the selection signal otherwise — invisible to a
// screen reader and to anyone who can't separate it from the grey one.
const SELECTED_MARK = '✓';

const activityOptions = [
  { label: 'Sedentary', description: 'Little to no exercise, desk job' },
  { label: 'Lightly active', description: 'Light exercise 1–3 days/week' },
  { label: 'Moderately active', description: 'Moderate exercise 3–5 days/week' },
  { label: 'Very active', description: 'Hard exercise 6–7 days/week' },
];

const goalOptions = [
  'Lose weight',
  'Build muscle',
  'Stay healthy',
  'Improve endurance',
  'Build better habits',
];

// Fallbacks used only if a goal calculation somehow produces a non-finite
// number. They match the defaults the rest of the app already falls back to,
// so a rescued profile behaves like a normal one rather than like a broken one.
const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_WATER_GOAL_ML = 2500;

export default function OnboardingScreen({ navigation }: any) {
  const { authUser, setProfile } = useUser();
  const { t, language, setLanguage } = useLanguage();
  const [avatar, setAvatar] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [age, setAge] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [weight, setWeight] = useState('');
  const [gender, setGender] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [goal, setGoal] = useState('');

  // Mirrors EditProfileScreen so the two profile forms fail the same way.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const validateAge = (val: string) => {
    const num = parseInt(val);
    if (isNaN(num)) return val;
    if (num > 120) return '120';
    return val;
  };

  const validateHeightFeet = (val: string) => {
    const num = parseInt(val);
    if (isNaN(num)) return val;
    if (num > 8) return '8';
    return val;
  };

  const validateHeightInches = (val: string) => {
    const num = parseInt(val);
    if (isNaN(num)) return val;
    if (num > 11) return '11';
    return val;
  };

  const validateWeight = (val: string) => {
    const num = parseInt(val);
    if (isNaN(num)) return val;
    if (num > 1000) return '1000';
    return val;
  };

  const heightInCm = () => {
    const ft = parseInt(heightFeet) || 0;
    const inches = parseInt(heightInches) || 0;
    return Math.round((ft * 30.48) + (inches * 2.54));
  };

  /* ---------------------------------------------------------------- *
   * Step gates
   *
   * The conditions themselves are unchanged — these just name them once so
   * the button's disabled state, the "still needed" hint and the spoken
   * rejection can't drift apart, which is exactly how a form ends up with a
   * dead button and no explanation for it.
   * ---------------------------------------------------------------- */

  const missingForStep = (s: number): string[] => {
    switch (s) {
      case 1:
        return [!firstName && t('firstName'), !lastInitial && t('lastInitial')].filter(
          Boolean
        ) as string[];
      case 2:
        return [!age && t('age'), !heightFeet && t('heightFt'), !weight && t('weightLbs')].filter(
          Boolean
        ) as string[];
      case 3:
        return [!gender && t('gender'), !activityLevel && t('activityLevel')].filter(
          Boolean
        ) as string[];
      case 4:
        return [!goal && t('goal')].filter(Boolean) as string[];
      default:
        return [];
    }
  };

  const missing = missingForStep(step);

  // Advancing is a completed unit of work, so it gets the same medium tap a
  // finished set does. A blocked advance gets the error buzz AND a spoken
  // reason: the visual half of the rejection is a greyed-out button, which
  // says nothing about which box is still empty.
  const advanceTo = (next: number) => {
    const blockers = missingForStep(step);
    if (blockers.length > 0) {
      haptics.error();
      AccessibilityInfo.announceForAccessibility(`Still needed: ${blockers.join(', ')}`);
      return;
    }
    haptics.setComplete();
    setStep(next);
  };

  // Selecting an option is the lightest thing that happens on this screen —
  // one buzz per tap, matching a picker rather than a completion.
  const selectOption = (apply: () => void) => {
    haptics.selection();
    apply();
  };

  // Driven off the state rather than from inside handleFinish, so the save
  // path stays exactly as it is: a red banner is the only thing that changes
  // when a write is rejected, and a banner is silent.
  useEffect(() => {
    if (!saveError) return;
    haptics.error();
    AccessibilityInfo.announceForAccessibility(saveError);
  }, [saveError]);

  // Onboarding drop-off tracking. Logs which step is currently on screen
  // every time it changes (including the very first render), so a later
  // query can answer "what fraction of people who saw step 2 ever reached
  // step 3?" — the actual question a funnel needs, not just "how many people
  // finished."
  //
  // `finishedRef` distinguishes a real abandonment (closing the app or
  // navigating away mid-flow) from the normal unmount that happens on a
  // successful finish — without it, every completed onboarding would ALSO
  // log as abandoned the instant the screen unmounts, making the whole
  // funnel meaningless.
  const finishedRef = useRef(false);
  // Mirrors `step`/`authUser` into a ref so the unmount cleanup below — whose
  // closure is fixed at mount time because its effect has empty deps — can
  // still read the CURRENT step and user rather than the step the user was
  // on when the screen first opened.
  const latestRef = useRef({ step, uid: authUser?.uid });
  useEffect(() => {
    latestRef.current = { step, uid: authUser?.uid };
    if (!authUser) return;
    logOnboardingEvent(authUser.uid, step, 'step_view');
  }, [authUser, step]);

  useEffect(() => {
    return () => {
      const { step: lastStep, uid } = latestRef.current;
      if (!finishedRef.current && uid) {
        logOnboardingEvent(uid, lastStep, 'onboarding_abandoned');
      }
    };
    // Deliberately empty deps — this should only run its cleanup once, on
    // real unmount, not re-arm on every step change (which would fire a
    // spurious "abandoned at step N" for every step the user completes on
    // their way through).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same flow as the Settings screen: pick from the library, upload to
  // Cloudinary, and hold only the resulting URL in state — so the profile
  // write at the end of onboarding stores a short string, not an image.
  const pickPhoto = async () => {
    if (!authUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('permissionNeeded'), t('permissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadProfilePhoto(authUser.uid, result.assets[0].uri);
      setAvatar(url);
    } catch {
      Alert.alert(t('uploadFailed'), t('uploadFailedBody'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleFinish = async () => {
    if (!authUser || saving) return;

    setSaving(true);
    setSaveError('');

    const ageNum = parseInt(age);
    const waterGoal = calculateWaterGoal(ageNum);
    // `|| 0` on inches, matching EditProfileScreen. The step-2 gate only
    // requires age, feet and weight, so inches can legitimately be blank —
    // "5 feet" is a complete answer. But parseInt('') is NaN, and NaN
    // propagates through the whole BMR calculation, so the preview rendered
    // "Calorie Goal: NaN kcal" and NaN went into Firestore. From there it's
    // permanent and invisible: Nutrition silently falls back to a generic
    // 2000 (NaN || 2000), the Dashboard falls back to 0, and every
    // calorie-goal quest becomes impossible to complete for that account.
    const calorieGoal = calculateCalorieGoal(
      ageNum,
      parseInt(weight),
      parseInt(heightFeet),
      parseInt(heightInches) || 0,
      gender,
      activityLevel,
      goal
    );

    // Belt and braces. The `|| 0` above fixes the known path, but a goal of
    // NaN is the kind of bad value that leaves no trace at the point it's
    // written and only surfaces weeks later as "quests don't work" — so
    // refuse to persist a non-finite number under any circumstances.
    const safeCalorieGoal = Number.isFinite(calorieGoal) ? calorieGoal : DEFAULT_CALORIE_GOAL;
    const safeWaterGoal = Number.isFinite(waterGoal) ? waterGoal : DEFAULT_WATER_GOAL_ML;

    const newProfile = {
      firstName,
      lastInitial,
      age: ageNum,
      heightFeet: parseInt(heightFeet),
      heightInches: parseInt(heightInches) || 0,
      weightLbs: parseInt(weight),
      gender,
      activityLevel,
      goal,
      waterGoalMl: safeWaterGoal,
      calorieGoal: safeCalorieGoal,
      // Both chosen during onboarding now, rather than being
      // absent until the user happened to visit Settings.
      avatar,
      language,
    };

    // Previously unguarded. A rejected write skipped setProfile and the
    // navigation, so the user tapped Finish and quite literally nothing
    // happened — five steps of input gone with no error and no clue that it
    // hadn't saved. The `saving` flag also stops a double-tap firing two
    // writes.
    try {
      await setDoc(doc(db, 'users', authUser.uid), newProfile);
      finishedRef.current = true;
      logOnboardingEvent(authUser.uid, step, 'onboarding_complete');
      setProfile(newProfile);
      navigation.navigate('Dashboard');
    } catch {
      setSaveError(t('errorSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // The title shown in the AppBar for the current step. Same t() keys the
  // old inline step heading used.
  const stepTitle = () => {
    switch (step) {
      case 1:
        return t('onboardingNameTitle');
      case 2:
        return t('bodyStatsSection');
      case 3:
        return t('onboardingAboutTitle');
      case 4:
        return t('onboardingGoalTitle');
      default:
        return `${t('onboardingReadyTitle')}, ${firstName}!`;
    }
  };

  const stepSubtitle = () => {
    switch (step) {
      case 1:
        return t('onboardingNameSubtitle');
      case 2:
        return t('onboardingBodySubtitle');
      case 3:
        return t('onboardingAboutSubtitle');
      case 4:
        return t('onboardingGoalSubtitle');
      default:
        return t('onboardingReadySubtitle');
    }
  };

  /* ---------------------------------------------------------------- *
   * Option surfaces
   *
   * One renderer per shape rather than a styled Pressable per call site, so
   * every option on the flow compresses by the same amount, marks itself the
   * same way and announces itself as a radio with a checked state.
   * ---------------------------------------------------------------- */

  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    onSelect: () => void,
    grow?: boolean
  ) => (
    <PressableScale
      key={key}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      onPress={() => selectOption(onSelect)}
      style={grow ? styles.chipGrowWrap : undefined}>
      <View style={[styles.chip, styles.chipRow, grow && styles.chipGrow, selected && styles.chipSelected]}>
        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
        {selected && <Text style={styles.chipMark}>{SELECTED_MARK}</Text>}
      </View>
    </PressableScale>
  );

  const renderOptionCard = (
    key: string,
    label: string,
    description: string | undefined,
    selected: boolean,
    onSelect: () => void
  ) => (
    <PressableScale
      key={key}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ selected, checked: selected }}
      onPress={() => selectOption(onSelect)}>
      <View style={[styles.chip, styles.optionCard, selected && styles.chipSelected]}>
        <View style={styles.optionText}>
          <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
          {!!description && <Text style={styles.chipDescription}>{description}</Text>}
        </View>
        {/* A word, not just a tick: "Selected" survives being read aloud,
            being magnified, and being looked at by someone who reads the
            glyph as decoration. */}
        {selected ? (
          <Pill label={`${SELECTED_MARK} Selected`} filled />
        ) : (
          // Reserves the badge's slot so selecting an option doesn't reflow
          // the row it sits in.
          <View style={styles.selectedBadgeSpacer} />
        )}
      </View>
    </PressableScale>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            {/* Language first, so the rest of signup can be read in it.
                Calling setLanguage() applies it immediately even though there's
                no profile to save it to yet — it's persisted at step 5. */}
            <Enter index={1}>
              <SectionTitle>🌐 {t('language')}</SectionTitle>
              <Card>
                <View style={styles.chipWrap}>
                  {LANGUAGES.map(lang =>
                    renderChip(
                      lang.code,
                      lang.nativeLabel,
                      language === lang.code,
                      () => setLanguage(lang.code as LanguageCode)
                    )
                  )}
                </View>
              </Card>
            </Enter>

            <Enter index={2}>
              <SectionTitle>{t('profileSection')}</SectionTitle>
              <Card style={styles.formCard}>
                <Field
                  label={t('firstName')}
                  placeholder={t('firstName')}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  onSubmitEditing={() => advanceTo(2)}
                  returnKeyType="next"
                />
                <Field
                  label={t('lastInitial')}
                  placeholder={t('lastInitial')}
                  value={lastInitial}
                  onChangeText={(val) => setLastInitial(val.slice(0, 1).toUpperCase())}
                  onSubmitEditing={() => advanceTo(2)}
                  returnKeyType="done"
                  maxLength={1}
                />
              </Card>
            </Enter>
          </>
        );

      case 2:
        return (
          <Enter index={1}>
            <SectionTitle>{t('bodyStatsSection')}</SectionTitle>
            <Card style={styles.formCard}>
              <Field
                label={t('age')}
                placeholder={t('age')}
                value={age}
                onChangeText={(val) => setAge(validateAge(val))}
                keyboardType="numeric"
                maxLength={3}
              />
              <View style={styles.heightGroup}>
                <Text style={styles.groupLabel}>{t('height')}</Text>
                <View style={styles.rowInputs}>
                  <Field
                    label={t('heightFt')}
                    placeholder={t('heightFt')}
                    value={heightFeet}
                    onChangeText={(val) => setHeightFeet(validateHeightFeet(val))}
                    keyboardType="numeric"
                    maxLength={1}
                    style={styles.rowInputItem}
                    // The visible label is an abbreviation; the announced one
                    // has to be the whole measurement or "ft" is read as a word.
                    accessibilityLabel={`${t('height')} — ${t('heightFt')}`}
                  />
                  <Field
                    label={t('heightIn')}
                    placeholder={t('heightIn')}
                    value={heightInches}
                    onChangeText={(val) => setHeightInches(validateHeightInches(val))}
                    keyboardType="numeric"
                    maxLength={2}
                    style={styles.rowInputItem}
                    accessibilityLabel={`${t('height')} — ${t('heightIn')}`}
                  />
                </View>
                {heightFeet ? (
                  <Text style={styles.conversionText}>= {heightInCm()} cm</Text>
                ) : null}
              </View>
              <Field
                label={t('weightLbs')}
                placeholder={t('weightLbs')}
                value={weight}
                onChangeText={(val) => setWeight(validateWeight(val))}
                keyboardType="numeric"
                maxLength={4}
              />
            </Card>
          </Enter>
        );

      case 3:
        return (
          <>
            <Enter index={1}>
              <SectionTitle>{t('gender')}</SectionTitle>
              <Card>
                <View style={styles.chipWrap} accessibilityRole="radiogroup">
                  {[{ v: 'Male', k: 'male' }, { v: 'Female', k: 'female' }, { v: 'Other', k: 'other' }].map(
                    ({ v: g, k: gKey }) =>
                      renderChip(g, t(gKey), gender === g, () => setGender(g), true)
                  )}
                </View>
              </Card>
            </Enter>

            <Enter index={2}>
              <SectionTitle>{t('activityLevel')}</SectionTitle>
              <Card>
                <View style={styles.chipColumn} accessibilityRole="radiogroup">
                  {activityOptions.map(a =>
                    renderOptionCard(a.label, a.label, a.description, activityLevel === a.label, () =>
                      setActivityLevel(a.label)
                    )
                  )}
                </View>
              </Card>
            </Enter>
          </>
        );

      case 4:
        return (
          <Enter index={1}>
            <SectionTitle>{t('goal')}</SectionTitle>
            <Card>
              <View style={styles.chipColumn} accessibilityRole="radiogroup">
                {goalOptions.map(g =>
                  renderOptionCard(g, g, undefined, goal === g, () => setGoal(g))
                )}
              </View>
            </Card>
          </Enter>
        );

      case 5:
        return (
          <>
            {/* One card of rows, not five floating lines: this is a summary of
                one thing — the day the user is about to start. */}
            <Enter index={1}>
              <SectionTitle>{t('goalsSection')}</SectionTitle>
              <Card style={styles.previewCard}>
                {[
                  { icon: '⚡', label: 'Daily XP Goal', value: '100 XP' },
                  { icon: '🎯', label: 'Daily Quests', value: '3' },
                  { icon: '💧', label: 'Water Goal', value: `${calculateWaterGoal(parseInt(age))}ml` },
                  {
                    icon: '🔥',
                    label: 'Calorie Goal',
                    // parseInt(heightInches) || 0 here too: the preview and the
                    // saved value have to agree, or the user is shown a number
                    // the app never stored.
                    value: `${calculateCalorieGoal(
                      parseInt(age),
                      parseInt(weight),
                      parseInt(heightFeet),
                      parseInt(heightInches) || 0,
                      gender,
                      activityLevel,
                      goal
                    )} kcal`,
                  },
                  { icon: '😴', label: 'Sleep Goal', value: '8 hours' },
                ].map((row, index) => (
                  <View key={row.label}>
                    {index > 0 && <View style={styles.rowDivider} />}
                    <View style={styles.previewRow}>
                      <Text style={styles.previewIcon}>{row.icon}</Text>
                      <Text style={styles.previewLabel}>{row.label}</Text>
                      <Text style={styles.previewValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            </Enter>

            <Enter index={2}>
              <SectionTitle>{t('chooseProfilePicture')}</SectionTitle>
              <Card style={styles.formCard}>
                {/* No emoji grid, and no color picker here either — this step
                    is meant to be the fast path through onboarding. The
                    initials avatar with its deterministic default color is
                    already a real, professional-looking result with zero
                    taps; choosing a different color is one of Edit Profile's
                    settings for later, not a decision to make on the way in. */}
                <View style={styles.avatarPreviewRow}>
                  {uploadingPhoto ? (
                    <Shimmer width={AVATAR_SIZE} height={AVATAR_SIZE} style={styles.avatarSkeleton} />
                  ) : (
                    <AvatarView
                      photoUrl={avatar}
                      uid={authUser?.uid ?? ''}
                      firstName={firstName}
                      lastInitial={lastInitial}
                      size={AVATAR_SIZE}
                    />
                  )}
                  {photoUploadAvailable() && (
                    <Button
                      label={uploadingPhoto ? t('saving') : t('uploadPhoto')}
                      onPress={pickPhoto}
                      variant="secondary"
                      size="sm"
                      disabled={uploadingPhoto}
                    />
                  )}
                </View>
              </Card>
            </Enter>
          </>
        );
    }
  };

  // The bottom action is rendered outside the scroller so it stays in the same
  // place on every step — the one control that never moves as the flow advances.
  const renderPrimaryAction = () => {
    if (step === TOTAL_STEPS) {
      return (
        <>
          {!!saveError && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}
          {/* The visible label becomes "please wait" mid-save; the announced
              name doesn't, so the control stays the same control while it's
              busy rather than reading as a new button appearing. */}
          <Button
            label={saving ? t('pleaseWait') : t('finish')}
            accessibilityLabel={t('finish')}
            accessibilityState={{ busy: saving }}
            onPress={handleFinish}
            disabled={saving}
            fullWidth
          />
        </>
      );
    }

    return (
      <>
        {/* A disabled button says "not yet" and nothing else. This says what's
            still blank, which is the only reason the button is dead. */}
        {missing.length > 0 && (
          <Text style={styles.missingHint}>Still needed: {missing.join(', ')}</Text>
        )}
        <Button
          label={t('next')}
          onPress={() => advanceTo(step + 1)}
          disabled={missing.length > 0}
          fullWidth
        />
      </>
    );
  };

  return (
    <Screen>
      <AppBar title={stepTitle()} />

      {/* Without this the number pads on step 2 sit on top of the weight field
          — the one input furthest down the card. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Progress is shown two ways on purpose: the bar gives the shape of
              the flow at a glance, the sentence below states it in words so
              progress is never conveyed by colour or position alone.

              A meter rather than five segments because a meter TRANSITIONS —
              advancing slides the fill to the next fifth instead of a segment
              blinking on, which is what makes the flow read as one journey
              rather than five unrelated screens. */}
          <View
            style={styles.progressBlock}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${t('stepOf')} ${step} / ${TOTAL_STEPS}`}
            accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}>
            <AnimatedMeter
              progress={step / TOTAL_STEPS}
              height={spacing.xs + 2}
              // Reaching the last step isn't the payoff — saving is. A bar that
              // celebrates here would spend the moment early.
              celebrateAtFull={false}
            />
            <Text style={styles.stepText}>
              {t('stepOf')} {step} / {TOTAL_STEPS}
            </Text>
          </View>

          {/* Re-keyed on `step` so each step's blocks animate in as the user
              advances, instead of only the first one arriving on mount. */}
          <View key={step}>
            <Enter index={0}>
              <Text style={styles.subtitle}>{stepSubtitle()}</Text>
            </Enter>
            {renderStep()}
          </View>
        </ScrollView>

        <View style={styles.footer}>{renderPrimaryAction()}</View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // Same shape as AuthScreen's error banner, so a failed save looks the same
  // wherever the user hits one.
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderWidth: layout.hairline,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  errorText: {
    ...type.bodySm,
    color: colors.danger,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  progressBlock: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  stepText: {
    ...type.label,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  formCard: {
    gap: spacing.lg,
  },
  // Feet, inches and the cm readout are one answer, so they sit closer to each
  // other than to the fields above and below them.
  heightGroup: {
    gap: spacing.sm,
  },
  groupLabel: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowInputItem: {
    flex: 1,
  },
  conversionText: {
    ...type.bodySm,
    color: colors.textSecondary,
  },

  // Option chips.
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipColumn: {
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // PressableScale wraps its child in an Animated.View, so growth has to be
  // applied to the wrapper — flexing the inner card would leave the tap target
  // narrower than the thing it looks like.
  chipGrowWrap: {
    flexGrow: 1,
  },
  chipGrow: {
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  chipLabel: {
    ...type.body,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.accent,
  },
  chipMark: {
    ...type.body,
    color: colors.accent,
    fontFamily: fontFamily.sansBlack,
  },
  chipDescription: {
    ...type.bodySm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  selectedBadgeSpacer: {
    width: spacing.sm,
  },

  avatarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarSkeleton: {
    borderRadius: radius.pill,
  },

  // One card of rows separated by hairlines: the five goals are one summary,
  // and the values line up on the right so they can be read as a column.
  previewCard: {
    paddingVertical: 0,
  },
  rowDivider: {
    height: layout.hairline,
    backgroundColor: colors.divider,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  previewIcon: {
    fontSize: 18,
  },
  previewLabel: {
    ...type.body,
    color: colors.textSecondary,
    flex: 1,
  },
  previewValue: {
    ...type.body,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
  },

  missingHint: {
    ...type.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
