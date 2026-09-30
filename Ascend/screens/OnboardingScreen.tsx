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
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, SectionTitle, Button, Field, Pill } from '../components/ui';
import { PressableScale, AnimatedMeter, Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import haptics from '../services/haptics';
import { useUser, calculateWaterGoal, calculateCalorieGoal, calculateAge, ageGroupFor } from '../context/UserContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useLanguage } from '../i18n/LanguageContext';
import { uploadProfilePhoto, photoUploadAvailable } from '../services/avatar';
import AvatarView from '../components/Avatar';
import { logOnboardingEvent } from '../firebase/analytics';
import { clearPushToken } from '../services/notifications';
import { withTimeout } from '../utils/timing';
import { WheelDatePicker, HeightWheelPicker, WeightWheelPicker, type HeightUnit, type WeightUnit } from '../components/WheelPicker';
import BodyFatIcon from '../components/BodyFatIcon';
import ScrollFadeOverlay, { useScrollOverflow } from '../components/ScrollFadeOverlay';
import type { HealthPrefill } from './HealthSyncScreen';
import { tierFromOnboardingAnswer, EMPTY_PROGRESSION } from '../data/workoutPlans';
import { saveWorkoutState } from '../firebase/workoutState';

// Named for the same reason EditProfileScreen's preview one is — the
// skeleton/preview have to agree on a size or the row jumps.
const AVATAR_SIZE = 56;

// How many steps the flow has. Named so the progress bar and the "Step N of M"
// line can never disagree with each other.
//
// 1 name · 2 DOB · 3 height · 4 weight · 5 body fat · 6 gender ·
// 7 exercise frequency · 8 activity level · 9 lifting experience ·
// 10 cardio experience · 11 physical considerations · 12 expenditure teaching
// · 13 goals · 14 how did you hear about us · 15 summary/avatar.
//
// Height and weight (3, 4) are skipped automatically when Apple Health /
// Health Connect already supplied that value — see `isStepSkippable` below.
const TOTAL_STEPS = 15;

// The same 3-chapter framing OnboardingIntroScreen previews before this
// flow even starts ("Basics" / "About You" / "Your Goals") — kept here
// instead of duplicated as a comment, so the intro screen's promise and
// this screen's own progress bar are reading off the same three ranges
// rather than two hand-maintained lists that can drift out of sync with
// each other, or with TOTAL_STEPS above, the way OnboardingIntroScreen's
// old comment had (it described an 8-step flow after this one had already
// grown to 15). A flat single-color bar over 15 steps reads as a long,
// undifferentiated slog; three segments filling in turn give the same
// step count a sense of arriving somewhere partway through.
const CHAPTERS: { label: string; startStep: number; endStep: number }[] = [
  { label: 'Basics', startStep: 1, endStep: 4 },
  { label: 'About You', startStep: 5, endStep: 12 },
  { label: 'Your Goals', startStep: 13, endStep: 15 },
];

const activityOptions = [
  { label: 'Sedentary', description: 'Little to no exercise, desk job' },
  { label: 'Lightly active', description: 'Light exercise 1–3 days/week' },
  { label: 'Moderately active', description: 'Moderate exercise 3–5 days/week' },
  { label: 'Very active', description: 'Hard exercise 6–7 days/week' },
];

const exerciseFrequencyOptions = [
  '0 sessions / week',
  '1-3 sessions / week',
  '4-6 sessions / week',
  '7+ sessions / week',
];

const bodyFatOptions = [
  '3-4%', '5-7%', '8-12%', '13-17%', '18-23%', '24-29%', '30-34%', '35-39%', '40%+',
];

function experienceOptions(kind: 'lifting' | 'cardio') {
  const verb = kind === 'lifting' ? 'Lifting' : 'Doing cardio';
  return [
    { label: 'None', description: `Currently not ${kind === 'lifting' ? 'lifting' : 'doing cardio'}` },
    { label: 'Beginner', description: `${verb} for the past year or less` },
    { label: 'Intermediate', description: `${verb} for more than the past year, but less than 4 years` },
    { label: 'Advanced', description: `${verb} for the past 4 years or more` },
  ];
}

const referralOptions: { key: 'friend' | 'ai' | 'other'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'friend', label: 'A friend', icon: 'people' },
  { key: 'ai', label: 'AI (ChatGPT, Claude, etc.)', icon: 'sparkles' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const goalOptions = [
  'Lose weight',
  'Build muscle',
  'Stay healthy',
  'Improve endurance',
  'Build better habits',
];

// The minimum age UpShift will create an account for. Below this, onboarding
// stops entirely — see `ageBlocked` below.
const MIN_AGE = 13;

// Generalized categories rather than a long medical checklist — broad enough
// to cover the common cases in one tap, with a free-text field right below
// for anyone who needs to get more specific than a category name can.
const physicalConditionOptions = [
  'Heart condition',
  'Joint or knee problems',
  'Back problems',
  'Respiratory issue',
  'Diabetes',
  'Other',
];

// Fallbacks used only if a goal calculation somehow produces a non-finite
// number. They match the defaults the rest of the app already falls back to,
// so a rescued profile behaves like a normal one rather than like a broken one.
const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_WATER_GOAL_ML = 2500;

export default function OnboardingScreen({ navigation, route }: any) {
  const palette = usePalette();
  const dynamicStyles = {
    errorBanner: [styles.errorBanner, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }],
    errorText: [styles.errorText, { color: palette.danger }],
    stepText: [styles.stepText, { color: palette.accent }],
    subtitle: [styles.subtitle, { color: palette.textSecondary }],
    groupLabel: [styles.groupLabel, { color: palette.textMuted }],
    conversionText: [styles.conversionText, { color: palette.textSecondary }],
    conditionsHint: [styles.conditionsHint, { color: palette.textMuted }],
    chip: [styles.chip, { backgroundColor: palette.surface, borderColor: palette.border }],
    chipSelected: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
    chipLabel: [styles.chipLabel, { color: palette.textSecondary }],
    chipLabelSelected: { color: palette.accent },
    chipDescription: [styles.chipDescription, { color: palette.textMuted }],
    rowDivider: [styles.rowDivider, { backgroundColor: palette.divider }],
    previewLabel: [styles.previewLabel, { color: palette.textSecondary }],
    previewValue: [styles.previewValue, { color: palette.textPrimary }],
    missingHint: [styles.missingHint, { color: palette.textMuted }],
  };
  const { authUser, setProfile, logOut } = useUser();
  const { t } = useLanguage();
  const [avatar, setAvatar] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');

  // Whatever HealthSyncScreen managed to read from Apple Health / Health
  // Connect, if anything. Only ever set the moment this screen mounts (a
  // brand-new signup's only path here) — never re-read afterward, so a
  // later re-render can't silently re-apply a stale prefill.
  const healthPrefill: HealthPrefill | undefined = route?.params?.healthPrefill;
  const healthSyncEnabled: boolean = !!route?.params?.healthSyncEnabled;
  const heightPrefilled = healthPrefill?.heightFeet != null;
  const weightPrefilled = healthPrefill?.weightLbs != null;

  // Date of birth — a scroll-wheel (month abbreviated / day / year) rather
  // than plain numeric fields (see components/WheelPicker.tsx's
  // WheelDatePicker). Defaults to a plausible adult birthdate so the wheel
  // never renders empty.
  const [dob, setDob] = useState(() => ({ month: 1, day: 1, year: new Date().getFullYear() - 20 }));
  // Set once the entered birthdate makes the user under MIN_AGE. Blocks the
  // rest of onboarding outright — see the render short-circuit below.
  const [ageBlocked, setAgeBlocked] = useState(false);

  const [heightUnit, setHeightUnit] = useState<HeightUnit>('ftin');
  const [heightFeet, setHeightFeet] = useState(healthPrefill?.heightFeet ?? 5);
  const [heightInches, setHeightInches] = useState(healthPrefill?.heightInches ?? 8);
  const heightCm = Math.round(heightFeet * 30.48 + heightInches * 2.54);
  const handleHeightChange = (v: { feet: number; inches: number; cm: number }) => {
    if (heightUnit === 'ftin') {
      setHeightFeet(v.feet);
      setHeightInches(v.inches);
    } else {
      const totalInches = Math.round(v.cm / 2.54);
      setHeightFeet(Math.floor(totalInches / 12));
      setHeightInches(totalInches % 12);
    }
  };

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('lb');
  const [weightLbs, setWeightLbs] = useState(healthPrefill?.weightLbs ?? 165);
  const weightDisplay = weightUnit === 'lb' ? weightLbs : Math.round(weightLbs * 0.453592);
  const handleWeightChange = (v: number) => {
    setWeightLbs(weightUnit === 'lb' ? v : Math.round(v / 0.453592));
  };

  const [bodyFatLevel, setBodyFatLevel] = useState('');
  const [gender, setGender] = useState('');
  const [exerciseFrequency, setExerciseFrequency] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [liftingExperience, setLiftingExperience] = useState('');
  const [cardioExperience, setCardioExperience] = useState('');
  // Multi-select — a goal step where more than one answer can be true at
  // once ("Lose weight" AND "Build better habits" isn't a contradiction).
  const [goals, setGoals] = useState<string[]>([]);
  const [physicalConditions, setPhysicalConditions] = useState<string[]>([]);
  const [physicalNotes, setPhysicalNotes] = useState('');
  const [referralSource, setReferralSource] = useState<'friend' | 'ai' | 'other' | ''>('');
  const [referralSourceNote, setReferralSourceNote] = useState('');

  const togglePhysicalCondition = (label: string) => {
    setPhysicalConditions(prev =>
      prev.includes(label) ? prev.filter(c => c !== label) : [...prev, label]
    );
  };

  const toggleGoal = (label: string) => {
    setGoals(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  // Parsed once per render and reused by validation, the preview card and
  // the final save, so the displayed age and the saved age can never drift
  // apart from each other.
  const dobIso = `${String(dob.year).padStart(4, '0')}-${String(dob.month).padStart(2, '0')}-${String(dob.day).padStart(2, '0')}`;
  const computedAge = calculateAge(dobIso);

  // Mirrors EditProfileScreen so the two profile forms fail the same way.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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
        return [
          !firstName && t('firstName'),
          !lastName && 'Last name',
          !nickname && 'Nickname',
        ].filter(Boolean) as string[];
      case 5:
        return [!bodyFatLevel && 'Body fat level'].filter(Boolean) as string[];
      case 6:
        return [!gender && t('gender')].filter(Boolean) as string[];
      case 7:
        return [!exerciseFrequency && 'How often you exercise'].filter(Boolean) as string[];
      case 8:
        return [!activityLevel && t('activityLevel')].filter(Boolean) as string[];
      case 9:
        return [!liftingExperience && 'Lifting experience'].filter(Boolean) as string[];
      case 10:
        return [!cardioExperience && 'Cardio experience'].filter(Boolean) as string[];
      case 11:
        // Optional — physical considerations never gate advancing.
        return [];
      case 12:
        // Teaching/expenditure reveal — informational only, never gates.
        return [];
      case 13:
        return [goals.length === 0 && t('goal')].filter(Boolean) as string[];
      case 14:
        return [!referralSource && 'How you heard about us'].filter(Boolean) as string[];
      default:
        // 2 (DOB), 3 (height), 4 (weight) are wheel pickers — always have a
        // value the moment they render, so there is nothing to be "missing".
        return [];
    }
  };

  const missing = missingForStep(step);

  // Height (3) and weight (4) are skipped automatically when Health
  // sync already supplied that value — see HealthSyncScreen. The user can
  // still reach either by navigating back onto it manually is
  // intentionally not offered here (there'd be nothing to edit back to
  // without re-opening health sync); EditProfile remains the place to
  // correct a synced value after onboarding.
  const isStepSkippable = (s: number): boolean => {
    if (s === 3) return heightPrefilled;
    if (s === 4) return weightPrefilled;
    return false;
  };

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
    // The age gate lives here rather than in missingForStep — a young
    // birthdate isn't a "still needed" field, it's a hard stop. Checked the
    // moment step 2 (which collects the birthdate) is left, before the user
    // can reach any further step.
    if (step === 2 && Number.isFinite(computedAge) && computedAge < MIN_AGE) {
      haptics.error();
      setAgeBlocked(true);
      return;
    }
    let target = next;
    while (target < TOTAL_STEPS && isStepSkippable(target)) target += 1;
    haptics.setComplete();
    setStep(target);
  };

  // Selecting an option is the lightest thing that happens on this screen —
  // one buzz per tap, matching a picker rather than a completion.
  const selectOption = (apply: () => void) => {
    haptics.selection();
    apply();
  };

  // Going back never needs the missingForStep gate — everything on an
  // earlier step was already filled in (or the user couldn't have advanced
  // past it), so this just needs to move the index, not re-validate it. Not
  // available on step 1: there's nowhere earlier to go, and the AppBar's
  // back button only renders when onBack is provided. Mirrors advanceTo's
  // skip loop so a health-synced height/weight step is never landed on
  // going backward either.
  const goToPrevStep = () => {
    if (step <= 1) return;
    haptics.selection();
    let target = step - 1;
    while (target > 1 && isStepSkippable(target)) target -= 1;
    setStep(target);
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
  const finishedRef = useRef(false);
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

    const ageNum = computedAge;
    const waterGoal = calculateWaterGoal(ageNum);
    const calorieGoal = calculateCalorieGoal(
      ageNum,
      weightLbs,
      heightFeet,
      heightInches,
      gender,
      activityLevel,
      goals[0] || ''
    );

    const safeCalorieGoal = Number.isFinite(calorieGoal) ? calorieGoal : DEFAULT_CALORIE_GOAL;
    const safeWaterGoal = Number.isFinite(waterGoal) ? waterGoal : DEFAULT_WATER_GOAL_ML;

    const newProfile = {
      firstName,
      ...(middleName.trim() ? { middleName: middleName.trim() } : {}),
      lastName,
      lastInitial: lastName.slice(0, 1).toUpperCase(),
      nickname: nickname.trim(),
      dateOfBirth: dobIso,
      age: ageNum,
      ageGroup: ageGroupFor(ageNum),
      heightFeet,
      heightInches,
      weightLbs,
      bodyFatLevel,
      gender,
      exerciseFrequency,
      activityLevel,
      liftingExperience,
      cardioExperience,
      goal: goals[0] || '',
      goals,
      waterGoalMl: safeWaterGoal,
      calorieGoal: safeCalorieGoal,
      avatar,
      language: 'en',
      physicalConditions,
      physicalNotes: physicalNotes.trim(),
      birthdayMonth: dob.month,
      birthdayDay: dob.day,
      healthSyncEnabled,
      ...(referralSource ? { referralSource } : {}),
      ...(referralSource === 'other' && referralSourceNote.trim()
        ? { referralSourceNote: referralSourceNote.trim() }
        : {}),
    };

    try {
      await setDoc(doc(db, 'users', authUser.uid), newProfile);
      // Seeds the workout tier from the lifting-experience question rather
      // than leaving every new account to start at 'beginner' regardless of
      // what they answered — see tierFromOnboardingAnswer's own comment for
      // why this was previously wired to answer values onboarding never
      // actually produced. Best-effort: a failure here just means the
      // account starts at the default and progresses normally from there,
      // not a broken signup.
      saveWorkoutState(authUser.uid, {
        ...EMPTY_PROGRESSION,
        tier: tierFromOnboardingAnswer(liftingExperience),
      }).catch(() => {});
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

  // The title shown in the AppBar for the current step.
  const stepTitle = () => {
    switch (step) {
      case 1:
        return t('onboardingNameTitle');
      case 2:
        return t('onboardingDobTitle');
      case 3:
        return t('height');
      case 4:
        return 'Weight';
      case 5:
        return 'Body fat level';
      case 6:
        return t('gender');
      case 7:
        return 'Exercise frequency';
      case 8:
        return t('activityLevel');
      case 9:
        return 'Lifting experience';
      case 10:
        return 'Cardio experience';
      case 11:
        return t('onboardingPhysicalTitle');
      case 12:
        return 'Your expenditure';
      case 13:
        return t('onboardingGoalTitle');
      case 14:
        return 'How did you hear about us?';
      default:
        return `${t('onboardingReadyTitle')}, ${firstName}!`;
    }
  };

  const stepSubtitle = () => {
    switch (step) {
      case 1:
        return t('onboardingNameSubtitle');
      case 2:
        return t('onboardingDobSubtitle');
      case 3:
        return 'What is your height?';
      case 4:
        return 'What is your weight?';
      case 5:
        return "Use a visual estimate and don't worry about being too precise.";
      case 6:
        return t('onboardingGenderSubtitle');
      case 7:
        return 'Estimate the number of recreational sports, cardio, or resistance training sessions.';
      case 8:
        return t('onboardingActivitySubtitle');
      case 9:
        return 'How long have you been strength training?';
      case 10:
        return 'How long have you been doing cardio?';
      case 11:
        return t('onboardingPhysicalSubtitle');
      case 12:
        return 'Understanding your expenditure is key to managing your weight.';
      case 13:
        return t('onboardingGoalSubtitle');
      case 14:
        return "So we know what's working — pick the one that fits best.";
      default:
        return t('onboardingReadySubtitle');
    }
  };

  /* ---------------------------------------------------------------- *
   * Option surfaces
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
      <View style={[dynamicStyles.chip, styles.chipRow, grow && styles.chipGrow, selected && dynamicStyles.chipSelected]}>
        <Text style={[dynamicStyles.chipLabel, selected && dynamicStyles.chipLabelSelected]}>{label}</Text>
        {selected && <Ionicons name="checkmark" size={16} color={palette.accent} />}
      </View>
    </PressableScale>
  );

  const renderOptionCard = (
    key: string,
    label: string,
    description: string | undefined,
    selected: boolean,
    onSelect: () => void,
    role: 'radio' | 'checkbox' = 'radio'
  ) => (
    <PressableScale
      key={key}
      accessibilityRole={role}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ selected, checked: selected }}
      onPress={() => selectOption(onSelect)}>
      <View style={[dynamicStyles.chip, styles.optionCard, selected && dynamicStyles.chipSelected]}>
        <View style={styles.optionText}>
          <Text style={[dynamicStyles.chipLabel, selected && dynamicStyles.chipLabelSelected]}>{label}</Text>
          {!!description && <Text style={dynamicStyles.chipDescription}>{description}</Text>}
        </View>
        {selected ? (
          <Pill label="Selected" filled />
        ) : (
          <View style={styles.selectedBadgeSpacer} />
        )}
      </View>
    </PressableScale>
  );

  // Teaching/expenditure reveal — deliberately not a chat-bubble Q&A (that
  // pattern doesn't exist anywhere else in this app and wasn't wanted here);
  // this is a single illustrated stat card instead, the same "one concept,
  // one card" shape as the summary preview at the end. Reuses the plain
  // TDEE branch of calculateCalorieGoal (goal='' takes neither the
  // deficit nor surplus branch) since goals haven't been chosen yet at this
  // point in the flow.
  const expenditure = calculateCalorieGoal(computedAge, weightLbs, heightFeet, heightInches, gender, activityLevel, '');
  const safeExpenditure = Number.isFinite(expenditure) ? expenditure : DEFAULT_CALORIE_GOAL;

  // The step-15 summary's "Calorie Goal" row has to show the number
  // handleFinish is ACTUALLY about to save, not the plain-maintenance
  // `safeExpenditure` above — that one is step 12's teaching aid, computed
  // before goals are even chosen (goal=''), and reusing it here meant the
  // number a user agreed to on the summary card and the number that landed
  // in their saved profile (goal-adjusted by handleFinish, a few hundred
  // calories off for "Lose weight"/"Build muscle") could silently disagree.
  const finalCalorieGoal = calculateCalorieGoal(
    computedAge, weightLbs, heightFeet, heightInches, gender, activityLevel, goals[0] || ''
  );
  const safeFinalCalorieGoal = Number.isFinite(finalCalorieGoal) ? finalCalorieGoal : DEFAULT_CALORIE_GOAL;

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Enter index={2}>
            <SectionTitle>{t('profileSection')}</SectionTitle>
            <Card style={styles.formCard}>
              <Field
                label={t('firstName')}
                placeholder={t('firstName')}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <Field
                label="Middle name (optional)"
                placeholder="Middle name"
                value={middleName}
                onChangeText={setMiddleName}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <Field
                label="Last name"
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <Field
                label="What should we call you?"
                placeholder="Nickname"
                value={nickname}
                onChangeText={setNickname}
                autoCapitalize="words"
                onSubmitEditing={() => advanceTo(2)}
                returnKeyType="done"
                maxLength={30}
              />
            </Card>
          </Enter>
        );

      case 2:
        return (
          <Enter index={1}>
            <WheelDatePicker value={dob} onChange={setDob} />
          </Enter>
        );

      case 3:
        return (
          <Enter index={1}>
            <HeightWheelPicker
              unit={heightUnit}
              onUnitChange={setHeightUnit}
              value={{ feet: heightFeet, inches: heightInches, cm: heightCm }}
              onChange={handleHeightChange}
            />
          </Enter>
        );

      case 4:
        return (
          <Enter index={1}>
            <WeightWheelPicker
              unit={weightUnit}
              onUnitChange={setWeightUnit}
              value={weightDisplay}
              onChange={handleWeightChange}
            />
          </Enter>
        );

      case 5:
        return (
          <Enter index={1}>
            <View style={styles.bodyFatGrid} accessibilityRole="radiogroup">
              {bodyFatOptions.map((label, index) => {
                const selected = bodyFatLevel === label;
                return (
                  <PressableScale
                    key={label}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    accessibilityState={{ selected, checked: selected }}
                    onPress={() => selectOption(() => setBodyFatLevel(label))}
                    style={styles.bodyFatCardWrap}>
                    <View
                      style={[
                        styles.bodyFatCard,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                        selected && { backgroundColor: palette.accentSoft, borderColor: palette.accent },
                      ]}>
                      <BodyFatIcon level={index} size={64} />
                    </View>
                    <View
                      style={[
                        styles.bodyFatLabelPill,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                        selected && { borderColor: palette.accent },
                      ]}>
                      <Text
                        style={[
                          styles.bodyFatLabelText,
                          { color: palette.textSecondary },
                          selected && { color: palette.accent },
                        ]}>
                        {label}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </Enter>
        );

      case 6:
        return (
          <Enter index={1}>
            <Card>
              <View style={styles.chipWrap} accessibilityRole="radiogroup">
                {[{ v: 'Male', k: 'male' }, { v: 'Female', k: 'female' }, { v: 'Other', k: 'other' }].map(
                  ({ v: g, k: gKey }) =>
                    renderChip(g, t(gKey), gender === g, () => setGender(g), true)
                )}
              </View>
            </Card>
          </Enter>
        );

      case 7:
        return (
          <Enter index={1}>
            <View style={styles.chipColumn} accessibilityRole="radiogroup">
              {exerciseFrequencyOptions.map(label =>
                renderOptionCard(label, label, undefined, exerciseFrequency === label, () =>
                  setExerciseFrequency(label)
                )
              )}
            </View>
          </Enter>
        );

      case 8:
        return (
          <Enter index={1}>
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
        );

      case 9:
        return (
          <Enter index={1}>
            <View style={styles.chipColumn} accessibilityRole="radiogroup">
              {experienceOptions('lifting').map(o =>
                renderOptionCard(o.label, o.label, o.description, liftingExperience === o.label, () =>
                  setLiftingExperience(o.label)
                )
              )}
            </View>
          </Enter>
        );

      case 10:
        return (
          <Enter index={1}>
            <View style={styles.chipColumn} accessibilityRole="radiogroup">
              {experienceOptions('cardio').map(o =>
                renderOptionCard(o.label, o.label, o.description, cardioExperience === o.label, () =>
                  setCardioExperience(o.label)
                )
              )}
            </View>
          </Enter>
        );

      case 11:
        return (
          <Enter index={1}>
            <Card style={styles.formCard}>
              <Text style={dynamicStyles.conditionsHint}>
                Optional — helps us tailor your workouts safely. Select any that apply.
              </Text>
              <View style={styles.chipWrap}>
                {physicalConditionOptions.map(label =>
                  renderChip(
                    label,
                    label,
                    physicalConditions.includes(label),
                    () => togglePhysicalCondition(label)
                  )
                )}
              </View>
              {physicalConditions.length > 0 && (
                <Field
                  label="Anything more specific we should know?"
                  placeholder="e.g. surgery last year, chronic knee pain"
                  value={physicalNotes}
                  onChangeText={setPhysicalNotes}
                  autoCapitalize="sentences"
                />
              )}
            </Card>
          </Enter>
        );

      case 12:
        return (
          <Enter index={1}>
            <View style={[styles.expenditureCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Ionicons name="flame" size={28} color={palette.accent} />
              <Text style={[styles.expenditureValue, { color: palette.textPrimary }]}>
                {safeExpenditure} kcal
              </Text>
              <Text style={[styles.expenditureLabel, { color: palette.textSecondary }]}>
                Estimated calories you burn each day — what you'd eat to maintain your current weight.
              </Text>
              <Text style={[styles.expenditureLabel, { color: palette.textMuted }]}>
                This is a starting point. It'll get more accurate as you log food and weight in the app.
              </Text>
            </View>
          </Enter>
        );

      case 13:
        return (
          <Enter index={1}>
            <Text style={dynamicStyles.conditionsHint}>Select as many as apply.</Text>
            <Card>
              <View style={styles.chipColumn}>
                {goalOptions.map(g =>
                  renderOptionCard(g, g, undefined, goals.includes(g), () => toggleGoal(g), 'checkbox')
                )}
              </View>
            </Card>
          </Enter>
        );

      case 14:
        return (
          <Enter index={1}>
            <View style={styles.chipColumn} accessibilityRole="radiogroup">
              {referralOptions.map(o => (
                <PressableScale
                  key={o.key}
                  accessibilityRole="radio"
                  accessibilityLabel={o.label}
                  accessibilityState={{ selected: referralSource === o.key, checked: referralSource === o.key }}
                  onPress={() => selectOption(() => setReferralSource(o.key))}>
                  <View
                    style={[
                      dynamicStyles.chip,
                      styles.optionCard,
                      referralSource === o.key && dynamicStyles.chipSelected,
                    ]}>
                    <Ionicons name={o.icon} size={18} color={palette.textSecondary} style={styles.previewIcon} />
                    <View style={styles.optionText}>
                      <Text style={[dynamicStyles.chipLabel, referralSource === o.key && dynamicStyles.chipLabelSelected]}>
                        {o.label}
                      </Text>
                    </View>
                    {referralSource === o.key ? (
                      <Pill label="Selected" filled />
                    ) : (
                      <View style={styles.selectedBadgeSpacer} />
                    )}
                  </View>
                </PressableScale>
              ))}
            </View>
            {referralSource === 'other' && (
              <Field
                label="Tell us more (optional)"
                placeholder="How did you hear about us?"
                value={referralSourceNote}
                onChangeText={setReferralSourceNote}
                autoCapitalize="sentences"
              />
            )}
          </Enter>
        );

      case 15:
        return (
          <>
            {(physicalConditions.length > 0 || physicalNotes.trim()) && (
              <Enter index={0}>
                <View style={[styles.disclaimerBanner, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <Ionicons name="information-circle" size={18} color={palette.textSecondary} />
                  <Text style={[styles.disclaimerText, { color: palette.textSecondary }]}>
                    UpShift is a guide app to help you work out — it isn't medical advice.
                    Please check with a doctor before starting a new program, especially
                    with the condition(s) you mentioned.
                  </Text>
                </View>
              </Enter>
            )}
            {ageGroupFor(computedAge) === 'teen' && (
              <Enter index={0}>
                <View style={[styles.disclaimerBanner, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  <Ionicons name="information-circle" size={18} color={palette.textSecondary} />
                  <Text style={[styles.disclaimerText, { color: palette.textSecondary }]}>
                    UpShift is for general fitness and wellness and isn't medical advice.
                    Workouts and goals are kept age-appropriate — no extreme diets or
                    intense training plans.
                  </Text>
                </View>
              </Enter>
            )}
            <Enter index={1}>
              <SectionTitle>{t('goalsSection')}</SectionTitle>
              <View style={[
                styles.previewCard,
                { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: layout.hairline, borderRadius: radius.lg, overflow: 'hidden' },
              ]}>
                {[
                  { icon: 'flash' as const, label: 'Daily XP Goal', value: '100 XP' },
                  { icon: 'list' as const, label: 'Daily Quests', value: '3' },
                  { icon: 'water' as const, label: 'Water Goal', value: `${calculateWaterGoal(computedAge)}ml` },
                  { icon: 'flame' as const, label: 'Calorie Goal', value: `${safeFinalCalorieGoal} kcal` },
                  { icon: 'moon' as const, label: 'Sleep Goal', value: '8 hours' },
                ].map((row, index) => (
                  <View key={row.label}>
                    {index > 0 && <View style={[dynamicStyles.rowDivider, { backgroundColor: palette.divider }]} />}
                    <View style={styles.previewRow}>
                      <Ionicons name={row.icon} size={18} color={palette.textSecondary} style={styles.previewIcon} />
                      <Text style={[dynamicStyles.previewLabel, { color: palette.textSecondary }]}>{row.label}</Text>
                      <Text style={[dynamicStyles.previewValue, { color: palette.textPrimary }]}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Enter>

            <Enter index={2}>
              <SectionTitle>{t('chooseProfilePicture')}</SectionTitle>
              <Card style={styles.formCard}>
                <View style={styles.avatarPreviewRow}>
                  {uploadingPhoto ? (
                    <Shimmer width={AVATAR_SIZE} height={AVATAR_SIZE} style={styles.avatarSkeleton} />
                  ) : (
                    <AvatarView
                      photoUrl={avatar}
                      uid={authUser?.uid ?? ''}
                      firstName={firstName}
                      lastInitial={lastName.slice(0, 1).toUpperCase()}
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

  const overflow = useScrollOverflow();

  // Hard stop, not a step in the flow: an under-13 birthdate never reaches
  // the rest of onboarding, there's nothing to advance past and no account
  // gets created. Signing out (rather than just showing a dead-end screen)
  // means they can't reach Dashboard by any other route either.
  if (ageBlocked) {
    return (
      <Screen>
        <View style={styles.ageBlockContainer}>
          <Ionicons name="alert-circle" size={40} color={palette.textSecondary} />
          <Text style={[styles.ageBlockTitle, { color: palette.textPrimary }]}>
            You must be at least {MIN_AGE} years old to use UpShift
          </Text>
          <Text style={[styles.ageBlockBody, { color: palette.textSecondary }]}>
            We weren't able to create an account for the birthdate you entered.
          </Text>
          <Button
            label="Sign out"
            onPress={async () => {
              if (authUser) await withTimeout(clearPushToken(authUser.uid), 4000).catch(() => {});
              await logOut();
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            }}
            fullWidth
          />
        </View>
      </Screen>
    );
  }

  // The bottom action is rendered outside the scroller so it stays in the same
  // place on every step — the one control that never moves as the flow advances.
  const renderPrimaryAction = () => {
    if (step === TOTAL_STEPS) {
      return (
        <>
          {!!saveError && (
            <View style={dynamicStyles.errorBanner} accessibilityRole="alert">
              <Text style={dynamicStyles.errorText}>{saveError}</Text>
            </View>
          )}
          <Button
            label={saving ? t('pleaseWait') : t('finish')}
            accessibilityLabel={t('finish')}
            accessibilityState={{ busy: saving }}
            onPress={handleFinish}
            disabled={saving}
            fullWidth
            glow
          />
        </>
      );
    }

    return (
      <>
        {missing.length > 0 && (
          <Text style={dynamicStyles.missingHint}>Still needed: {missing.join(', ')}</Text>
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

  // Steps 2-4 (date of birth, height, weight) render a WheelPicker column,
  // which is itself a FlatList — a VirtualizedList. React Native's "should
  // never be nested" warning fires purely from the STRUCTURAL nesting (a
  // VirtualizedList descending from a ScrollView's context), not from
  // whether the outer ScrollView can actually scroll — an earlier version of
  // this screen tried `scrollEnabled={!stepHasWheelPicker}` on the same
  // ScrollView, which looked right but left the FlatList nested inside it
  // either way, so the warning kept firing on real devices. The actual fix
  // has to remove the ScrollView from the tree entirely for these steps, not
  // just disable its scrolling — hence the two full render paths below
  // rather than one ScrollView with a prop toggle. None of these three steps
  // has enough content to need outer scrolling anyway (no text inputs, no
  // keyboard, a title, a picker, and a Next button).
  const stepHasWheelPicker = step === 2 || step === 3 || step === 4;

  const stepContent = (
    <>
      <View
        style={styles.progressBlock}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${t('stepOf')} ${step} / ${TOTAL_STEPS}`}
        accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}>
        <View style={styles.chapterBarRow}>
          {CHAPTERS.map(chapter => {
            const span = chapter.endStep - chapter.startStep + 1;
            const doneInChapter = Math.min(Math.max(step - chapter.startStep + 1, 0), span);
            return (
              <AnimatedMeter
                key={chapter.label}
                progress={doneInChapter / span}
                height={spacing.xs + 2}
                celebrateAtFull={false}
                style={styles.chapterBarSegment}
              />
            );
          })}
        </View>
        <Text style={dynamicStyles.stepText}>
          {CHAPTERS.find(c => step >= c.startStep && step <= c.endStep)?.label ?? ''} · {t('stepOf')} {step} / {TOTAL_STEPS}
        </Text>
      </View>

      <View key={step}>
        <Enter index={0}>
          <Text style={dynamicStyles.subtitle}>{stepSubtitle()}</Text>
        </Enter>
        {renderStep()}
      </View>
    </>
  );

  return (
    <Screen>
      <AppBar title={stepTitle()} onBack={step > 1 ? goToPrevStep : undefined} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.scrollWrap}>
          {stepHasWheelPicker ? (
            <View style={[styles.scroll, styles.scrollContent]}>{stepContent}</View>
          ) : (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                onContentSizeChange={overflow.onContentSizeChange}
                onLayout={overflow.onLayout}
                onScroll={overflow.onScroll}
                scrollEventThrottle={16}>
                {stepContent}
              </ScrollView>
              <ScrollFadeOverlay visible={overflow.showFade} />
            </>
          )}
        </View>

        <View style={styles.footer}>{renderPrimaryAction()}</View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  errorBanner: {
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  errorText: {
    ...type.bodySm,
    textAlign: 'center',
  },
  scrollWrap: {
    flex: 1,
    position: 'relative',
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
  chapterBarRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chapterBarSegment: {
    flex: 1,
  },
  stepText: {
    ...type.label,
    textTransform: 'uppercase',
  },
  subtitle: {
    ...type.body,
    marginTop: spacing.md,
  },
  formCard: {
    gap: spacing.lg,
  },
  groupLabel: {
    ...type.label,
    textTransform: 'uppercase',
  },
  conversionText: {
    ...type.bodySm,
  },

  // Body-fat step's 3-per-row grid — separate from chipWrap's cards, which
  // are full-width label rows and don't have room for an image on top.
  bodyFatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  bodyFatCardWrap: {
    // 3 columns with two `md` gaps between them, so each card's width comes
    // out to (100% - 2*gap) / 3 without hardcoding a screen width.
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
  },
  bodyFatCard: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: layout.hairline,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Overlaps the card's bottom edge (negative margin) rather than sitting
  // in the flow beneath it — same floating-badge placement as the reference
  // layout this step was redone to match, so the percentage reads as part
  // of the card rather than a caption trailing after it.
  bodyFatLabelPill: {
    marginTop: -spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  bodyFatLabelText: {
    ...type.bodySm,
    fontFamily: fontFamily.sansBold,
  },

  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipColumn: {
    gap: spacing.sm,
  },
  conditionsHint: {
    ...type.bodySm,
  },
  chip: {
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  disclaimerText: {
    ...type.bodySm,
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chipGrowWrap: {
    flexGrow: 1,
  },
  chipGrow: {
    justifyContent: 'center',
  },
  chipLabel: {
    ...type.body,
  },
  chipDescription: {
    ...type.bodySm,
    marginTop: spacing.xs,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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

  previewCard: {
    paddingVertical: 0,
  },
  rowDivider: {
    height: layout.hairline,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  previewIcon: {
    width: 18,
  },
  previewLabel: {
    ...type.body,
    flex: 1,
  },
  previewValue: {
    ...type.body,
    fontFamily: fontFamily.sansBold,
  },

  expenditureCard: {
    borderWidth: layout.hairline,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  expenditureValue: {
    ...type.display,
    fontFamily: fontFamily.sansBlack,
    fontSize: 34,
  },
  expenditureLabel: {
    ...type.bodySm,
    textAlign: 'center',
  },

  missingHint: {
    ...type.bodySm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  footer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },

  ageBlockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  ageBlockTitle: {
    ...type.title,
    textAlign: 'center',
  },
  ageBlockBody: {
    ...type.body,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
