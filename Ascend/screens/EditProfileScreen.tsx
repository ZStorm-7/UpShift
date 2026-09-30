import { useRef, useState } from 'react';
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
import AnimatedToggle from '../components/AnimatedToggle';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, SectionTitle, Button, Field } from '../components/ui';
import { Shimmer, PressableScale } from '../components/anim';
import { Enter } from '../components/dashboard';
import haptics from '../services/haptics';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUser, calculateWaterGoal, calculateCalorieGoal, ageGroupFor } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { uploadProfilePhoto, photoUploadAvailable, getDefaultAvatarColor } from '../services/avatar';
import { avatarPalette } from '../theme/colors';
import AvatarView from '../components/Avatar';
import { requestNotificationPermission, cancelAllReminders, notificationsAvailable } from '../services/notifications';
import { safeGoBack } from '../utils/nav';

// Diameter of the avatar preview. Named because its skeleton has to match it
// exactly, or the row jumps height when the upload finishes.
const AVATAR_SIZE = 56;

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

// Mirrors OnboardingScreen. Kept as literals in both places rather than
// shared, because the two screens are the only writers and a shared constant
// would suggest these are tunable settings rather than last-resort fallbacks.
const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_WATER_GOAL_ML = 2500;

export default function EditProfileScreen({ navigation }: any) {
  const palette = usePalette();
  // Colour halves of styles.* that used to be hardcoded from the static
  // dark-only `colors` object — this screen never called usePalette() at
  // all, so every row divider, group label, chip, and error banner stayed
  // dark-themed regardless of the user's actual light/dark setting. Built as
  // a plain object (not StyleSheet.create — that's a one-time registration,
  // wrong for values that change when the theme does) merging each static
  // structural style with its palette-correct colour, reusing the exact same
  // key names so every `styles.X` in the JSX below only needed to become
  // `dynamicStyles.X`.
  const dynamicStyles = {
    rowDivider: [styles.rowDivider, { backgroundColor: palette.divider }],
    groupLabel: [styles.groupLabel, { color: palette.textMuted }],
    notificationHint: [styles.notificationHint, { color: palette.textMuted }],
    chip: [styles.chip, { backgroundColor: palette.surface, borderColor: palette.border }],
    chipSelected: { backgroundColor: palette.accentSoft, borderColor: palette.accent },
    chipLabel: [styles.chipLabel, { color: palette.textSecondary }],
    chipLabelSelected: { color: palette.accent },
    chipDescription: [styles.chipDescription, { color: palette.textMuted }],
    resetColorText: [styles.resetColorText, { color: palette.accent }],
    errorBanner: [styles.errorBanner, { backgroundColor: palette.dangerSoft, borderColor: palette.danger }],
    errorText: [styles.errorText, { color: palette.danger }],
  };
  const { authUser, profile, setProfile } = useUser();
  const { t } = useLanguage();

  const [avatar, setAvatar] = useState(profile?.avatar ?? '');
  // Undefined means "use the deterministic default for this uid" — see
  // services/avatar.ts's getDefaultAvatarColor. Only set once the user
  // actually taps a swatch.
  const [avatarColor, setAvatarColor] = useState<string | undefined>(profile?.avatarColor);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Unset/undefined reads as "on" everywhere this flag is checked — see the
  // comment on UserProfile.notificationsEnabled — so the toggle itself has
  // to default to true for the same reason, not just false-by-omission.
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile?.notificationsEnabled !== false);

  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastInitial, setLastInitial] = useState(profile?.lastInitial ?? '');
  const [age, setAge] = useState(profile ? String(profile.age) : '');
  const [heightFeet, setHeightFeet] = useState(profile ? String(profile.heightFeet) : '');
  const [heightInches, setHeightInches] = useState(profile ? String(profile.heightInches) : '');
  const [weight, setWeight] = useState(profile ? String(profile.weightLbs) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [activityLevel, setActivityLevel] = useState(profile?.activityLevel ?? '');
  const [goal, setGoal] = useState(profile?.goal ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The real double-submit guard. `saving` state is what the button READS to
  // disable itself, but state updates land a render later — two taps inside
  // one frame both see saving === false and both reach setDoc, writing the
  // profile twice. A ref flips synchronously inside the handler, so the second
  // tap is refused before it can start a second write.
  const savingRef = useRef(false);

  const canSave =
    firstName && lastInitial && age && heightFeet && weight && gender && activityLevel && goal;

  // Opens the device's photo library, and if the user picks something,
  // uploads it to Cloudinary right away, holding only the resulting URL in
  // `avatar` state — so by the time they hit Save we're writing a short
  // string to Firestore, never image bytes.
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
    } catch (err) {
      haptics.error();
      Alert.alert(t('uploadFailed'), t('uploadFailedBody'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!authUser || !canSave || savingRef.current) return;
    savingRef.current = true;
    setError('');
    setSaving(true);
    try {
      const ageNum = parseInt(age);
      const waterGoal = calculateWaterGoal(ageNum);
      const calorieGoal = calculateCalorieGoal(
        ageNum,
        parseInt(weight),
        parseInt(heightFeet),
        parseInt(heightInches) || 0,
        gender,
        activityLevel,
        goal
      );
      // Same guard Onboarding carries, for the same reason. A NaN goal writes
      // silently and only surfaces weeks later as "my quests stopped working",
      // and this screen writes the identical fields — so leaving the check on
      // one of the two paths just means the bug comes back through the other.
      const safeCalorieGoal = Number.isFinite(calorieGoal) ? calorieGoal : DEFAULT_CALORIE_GOAL;
      const safeWaterGoal = Number.isFinite(waterGoal) ? waterGoal : DEFAULT_WATER_GOAL_ML;

      const updatedProfile = {
        firstName,
        lastInitial,
        // This screen still only edits first name + last initial — full
        // name (middle/last), nickname, date of birth and the goals array
        // all live on Settings/Onboarding and aren't fields on this form,
        // so (like physicalConditions, bio, etc. below) they have to be
        // explicitly carried forward or this screen's whole-document
        // setDoc silently erases them the next time someone saves here.
        ...(profile?.middleName ? { middleName: profile.middleName } : {}),
        ...(profile?.lastName ? { lastName: profile.lastName } : {}),
        ...(profile?.nickname ? { nickname: profile.nickname } : {}),
        ...(profile?.dateOfBirth ? { dateOfBirth: profile.dateOfBirth } : {}),
        // Recomputed from the age this save is actually writing, not carried
        // forward from the old profile like the other fields above — unlike
        // those, ageGroup is DERIVED from a field this same form edits, so
        // carrying the old value forward the same way left it stale: correct
        // an age from 17 to 19 (or the reverse) here and the stored
        // ageGroup silently kept saying "teen" (or "adult") regardless.
        ageGroup: ageGroupFor(ageNum),
        ...(profile?.goals ? { goals: profile.goals } : {}),
        age: ageNum,
        heightFeet: parseInt(heightFeet),
        heightInches: parseInt(heightInches) || 0,
        weightLbs: parseInt(weight),
        gender,
        activityLevel,
        goal,
        waterGoalMl: safeWaterGoal,
        calorieGoal: safeCalorieGoal,
        avatar,
        // Firestore's setDoc throws outright on an `undefined` field value —
        // it doesn't silently drop it — so "no color chosen" has to be
        // OMITTED from the written object, never set to undefined. The same
        // rule the leaderboard publish in DashboardScreen follows.
        ...(avatarColor ? { avatarColor } : {}),
        language: profile?.language ?? 'en',
        notificationsEnabled,
        // This screen writes the WHOLE profile document (setDoc without
        // merge), not a partial update — so any field this form doesn't
        // know about has to be explicitly carried forward here, or saving
        // an edit here silently erases it. None of these fields have a
        // field on this screen, so they'd otherwise be wiped the first
        // time someone opens Edit Profile and hits save.
        ...(profile?.physicalConditions ? { physicalConditions: profile.physicalConditions } : {}),
        ...(profile?.physicalNotes ? { physicalNotes: profile.physicalNotes } : {}),
        ...(profile?.birthdayMonth ? { birthdayMonth: profile.birthdayMonth } : {}),
        ...(profile?.birthdayDay ? { birthdayDay: profile.birthdayDay } : {}),
        ...(profile?.bedtimeHour !== undefined ? { bedtimeHour: profile.bedtimeHour } : {}),
        ...(profile?.bedtimeMinute !== undefined ? { bedtimeMinute: profile.bedtimeMinute } : {}),
        ...(profile?.displayName ? { displayName: profile.displayName } : {}),
        ...(profile?.bio ? { bio: profile.bio } : {}),
        ...(profile?.fontScale !== undefined ? { fontScale: profile.fontScale } : {}),
      };
      await setDoc(doc(db, 'users', authUser.uid), updatedProfile);
      setProfile(updatedProfile);
      haptics.setComplete();
      // The screen pops on success, so there is no visible confirmation left
      // to read — without this announcement a screen-reader user is returned
      // to the previous screen with no idea whether the save happened.
      AccessibilityInfo.announceForAccessibility(t('profileSaved'));
      safeGoBack(navigation);
    } catch (err: any) {
      const message = err.message || 'Something went wrong saving your profile.';
      setError(message);
      haptics.error();
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Every option picker on this screen routes its tap through here: one place
  // that pairs the state change with the selection tick, so no picker can be
  // added later that changes silently.
  const choose = <T,>(setter: (value: T) => void, value: T) => {
    haptics.selection();
    setter(value);
  };

  // Flips local state right away — the actual Firestore write only happens
  // on Save, matching every other field on this screen — but the OS
  // permission prompt / cancellation happens immediately, since asking for
  // permission (or clearing a pending reminder) shouldn't wait on an
  // unrelated Save tap the user might not get to for a while.
  const toggleNotifications = async (value: boolean) => {
    // AnimatedToggle fires its own selection haptic on press now.
    setNotificationsEnabled(value);
    if (value) {
      await requestNotificationPermission();
    } else {
      await cancelAllReminders();
    }
  };

  // A legacy `preset:<emoji>` value counts as "no photo" here too — anyone
  // who picked an emoji before that picker was removed sees the same
  // initials-avatar controls as someone who never set anything.
  const hasPhoto = Boolean(avatar) && !avatar.startsWith('preset:');
  // What the swatch row highlights as "selected" when the user hasn't
  // explicitly chosen a color yet — the same deterministic default Avatar
  // itself falls back to, so the preview and the picker never disagree about
  // which swatch is "current".
  const defaultAvatarColorForThisAccount = getDefaultAvatarColor(authUser?.uid ?? '');

  // Skeletons in the shape of the form rather than an empty screen: the
  // fields seed from `profile`, so until it exists there is nothing truthful
  // to put in them. The AppBar renders here too, so there is always a way out.
  if (!profile) {
    return (
      <Screen>
        <AppBar title={t('settings')} onBack={() => safeGoBack(navigation)} />
        <View style={styles.skeletonStack}>
          <Shimmer width="30%" height={12} />
          <Shimmer width="100%" height={232} style={styles.skeletonCard} />
          <Shimmer width="30%" height={12} />
          <Shimmer width="100%" height={96} style={styles.skeletonCard} />
          <Shimmer width="30%" height={12} />
          <Shimmer width="100%" height={196} style={styles.skeletonCard} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title={t('settings')} onBack={() => safeGoBack(navigation)} />

      {/* Nearly every control here sits below a text input, so without this the
          keyboard covers the half of the form the user is heading towards —
          including the Save button. `handled` keeps the first tap on an option
          or on Save working while the keyboard is up, instead of spending it on
          dismissing the keyboard. */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flexOne}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Identity: picture and name are one question — "who is this
              account" — so they're one card of rows, not four small cards. */}
          <Enter index={0}>
            <SectionTitle>{t('profileSection')}</SectionTitle>
            <Card style={styles.rowCard}>
              <View style={styles.row}>
                <Text style={dynamicStyles.groupLabel}>{t('chooseProfilePicture')}</Text>
                <View style={styles.avatarPreviewRow}>
                  {uploadingPhoto ? (
                    <Shimmer width={AVATAR_SIZE} height={AVATAR_SIZE} style={styles.avatarSkeleton} />
                  ) : (
                    <AvatarView
                      photoUrl={avatar}
                      color={avatarColor}
                      uid={authUser?.uid ?? ''}
                      firstName={firstName}
                      lastInitial={lastInitial}
                      size={AVATAR_SIZE}
                    />
                  )}
                  <View style={styles.avatarButtonCol}>
                    {/* Hidden entirely when Cloudinary isn't configured, rather
                        than offering a button guaranteed to fail — the
                        initials avatar below works with zero setup either way. */}
                    {photoUploadAvailable() && (
                      <Button
                        label={uploadingPhoto ? t('saving') : t('uploadPhoto')}
                        onPress={pickPhoto}
                        variant="secondary"
                        size="sm"
                        disabled={uploadingPhoto}
                      />
                    )}
                    {/* Only offered once there's actually a photo to remove —
                        showing "Remove Photo" on an initials avatar would be a
                        button with nothing to do. */}
                    {hasPhoto && (
                      <Button
                        label={t('removePhoto')}
                        onPress={() => choose(setAvatar, '')}
                        variant="ghost"
                        size="sm"
                        disabled={uploadingPhoto}
                      />
                    )}
                  </View>
                </View>
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                {/* The color only shows once a photo is removed (or never
                    added), so the label says exactly when it applies rather
                    than implying it changes something visible right now. */}
                <View style={styles.colorHeaderRow}>
                  <Text style={dynamicStyles.groupLabel}>{t('avatarColor')}</Text>
                  {/* Only shown once the user has actually overridden the
                      default — otherwise there's nothing to reset. */}
                  {avatarColor && (
                    <PressableScale
                      accessibilityRole="button"
                      accessibilityLabel={t('useDefaultColor')}
                      onPress={() => choose(setAvatarColor, undefined)}>
                      <Text style={dynamicStyles.resetColorText}>{t('useDefaultColor')}</Text>
                    </PressableScale>
                  )}
                </View>
                <View style={styles.chipWrap}>
                  {avatarPalette.map(swatch => {
                    const selected = (avatarColor ?? defaultAvatarColorForThisAccount) === swatch;
                    return (
                      <PressableScale
                        key={swatch}
                        accessibilityRole="radio"
                        accessibilityLabel={`${t('avatarColor')}: ${swatch}`}
                        accessibilityState={{ selected }}
                        onPress={() => choose(setAvatarColor, swatch)}>
                        <View style={[styles.colorSwatch, { backgroundColor: swatch }]}>
                          {selected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                <Field
                  label={t('firstName')}
                  placeholder={t('firstName')}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                <Field
                  label={t('lastInitial')}
                  placeholder={t('lastInitial')}
                  value={lastInitial}
                  onChangeText={(val) => setLastInitial(val.slice(0, 1).toUpperCase())}
                  maxLength={1}
                />
              </View>
            </Card>
          </Enter>

          {/* Age, height and weight are the three inputs to one calculation, so
              they read as one list to finish rather than three separate asks. */}
          <Enter index={2}>
            <SectionTitle>{t('bodyStatsSection')}</SectionTitle>
            <Card style={styles.rowCard}>
              <View style={styles.row}>
                <Field
                  label={t('age')}
                  placeholder={t('age')}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                <Text style={dynamicStyles.groupLabel}>{t('height')}</Text>
                <View style={styles.rowInputs}>
                  <Field
                    label={t('heightFt')}
                    placeholder={t('heightFt')}
                    value={heightFeet}
                    onChangeText={setHeightFeet}
                    keyboardType="numeric"
                    maxLength={1}
                    style={styles.rowInputItem}
                    accessibilityLabel={`${t('height')} — ${t('heightFt')}`}
                  />
                  <Field
                    label={t('heightIn')}
                    placeholder={t('heightIn')}
                    value={heightInches}
                    onChangeText={setHeightInches}
                    keyboardType="numeric"
                    maxLength={2}
                    style={styles.rowInputItem}
                    accessibilityLabel={`${t('height')} — ${t('heightIn')}`}
                  />
                </View>
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                <Field
                  label={t('weightLbs')}
                  placeholder={t('weightLbs')}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
            </Card>
          </Enter>

          {/* Gender and activity are both "how should the calorie maths treat
              you", so they share a card the way they share a step in
              onboarding. */}
          <Enter index={3}>
            <SectionTitle>{t('onboardingAboutTitle')}</SectionTitle>
            <Card style={styles.rowCard}>
              <View style={styles.row}>
                <Text style={dynamicStyles.groupLabel}>{t('gender')}</Text>
                <View style={styles.chipWrap}>
                  {[
                    { value: 'Male', key: 'male' as const },
                    { value: 'Female', key: 'female' as const },
                    { value: 'Other', key: 'other' as const },
                  ].map(({ value, key }) => {
                    const selected = gender === value;
                    return (
                      <PressableScale
                        key={value}
                        style={styles.chipGrowWrap}
                        accessibilityRole="radio"
                        accessibilityLabel={t(key)}
                        accessibilityState={{ selected }}
                        onPress={() => choose(setGender, value)}>
                        <View
                          style={[
                            dynamicStyles.chip,
                            styles.chipRow,
                            styles.chipCentred,
                            selected && dynamicStyles.chipSelected,
                          ]}>
                          <Text style={[dynamicStyles.chipLabel, selected && dynamicStyles.chipLabelSelected]}>
                            {t(key)}
                          </Text>
                          {selected && <Ionicons name="checkmark" size={16} color={palette.accent} />}
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              <View style={dynamicStyles.rowDivider} />

              <View style={styles.row}>
                <Text style={dynamicStyles.groupLabel}>{t('activityLevel')}</Text>
                <View style={styles.chipColumn}>
                  {activityOptions.map(a => {
                    const selected = activityLevel === a.label;
                    return (
                      <PressableScale
                        key={a.label}
                        accessibilityRole="radio"
                        accessibilityLabel={`${a.label}. ${a.description}`}
                        accessibilityState={{ selected }}
                        onPress={() => choose(setActivityLevel, a.label)}>
                        <View style={[dynamicStyles.chip, styles.chipBlock, selected && dynamicStyles.chipSelected]}>
                          <View style={styles.chipTitleRow}>
                            <Text style={[dynamicStyles.chipLabel, selected && dynamicStyles.chipLabelSelected]}>
                              {a.label}
                            </Text>
                            {selected && <Ionicons name="checkmark" size={16} color={palette.accent} />}
                          </View>
                          <Text style={dynamicStyles.chipDescription}>{a.description}</Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>
            </Card>
          </Enter>

          <Enter index={4}>
            <SectionTitle>{t('onboardingGoalTitle')}</SectionTitle>
            <Card>
              <View style={styles.chipColumn}>
                {goalOptions.map(g => {
                  const selected = goal === g;
                  return (
                    <PressableScale
                      key={g}
                      accessibilityRole="radio"
                      accessibilityLabel={g}
                      accessibilityState={{ selected }}
                      onPress={() => choose(setGoal, g)}>
                      <View
                        style={[
                          dynamicStyles.chip,
                          styles.chipBlock,
                          styles.chipRow,
                          selected && dynamicStyles.chipSelected,
                        ]}>
                        <Text style={[dynamicStyles.chipLabel, selected && dynamicStyles.chipLabelSelected]}>
                          {g}
                        </Text>
                        {selected && <Ionicons name="checkmark" size={16} color={palette.accent} />}
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </Card>
          </Enter>

          {notificationsAvailable() && (
            <Enter index={5}>
              <SectionTitle><Ionicons name="notifications" size={13} color={palette.textMuted} /> {t('notificationsSection')}</SectionTitle>
              <Card style={styles.rowCard}>
                <View style={[styles.row, styles.notificationRow]}>
                  <View style={styles.notificationCopy}>
                    <Text style={dynamicStyles.groupLabel}>{t('streakReminders')}</Text>
                    <Text style={dynamicStyles.notificationHint}>{t('streakRemindersHint')}</Text>
                  </View>
                  <AnimatedToggle
                    value={notificationsEnabled}
                    onValueChange={toggleNotifications}
                    palette={palette}
                    accessibilityLabel={t('streakReminders')}
                  />
                </View>
              </Card>
            </Enter>
          )}

          <Enter index={6}>
            {/* The error sits directly above the button it relates to, so the
                eye lands on the reason before the retry. */}
            {error !== '' && (
              <View style={dynamicStyles.errorBanner} accessibilityRole="alert">
                <Text style={dynamicStyles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              label={saving ? t('saving') : t('save')}
              onPress={handleSave}
              disabled={!canSave || saving}
              fullWidth
              style={styles.save}
            />
          </Enter>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  skeletonStack: {
    gap: layout.gap,
    marginTop: spacing.lg,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },

  // A card of rows: horizontal padding only, because each row supplies its own
  // vertical padding — that's what makes the hairlines run edge to edge and the
  // tap target span the full row height.
  rowCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 0,
  },
  row: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  rowDivider: {
    height: layout.hairline,
    // backgroundColor is applied via dynamicStyles.rowDivider.
  },
  groupLabel: {
    ...type.label,
    // color is applied via dynamicStyles.groupLabel.
    textTransform: 'uppercase',
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  notificationCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  notificationHint: {
    ...type.bodySm,
    // color is applied via dynamicStyles.notificationHint.
  },
  rowInputs: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowInputItem: {
    flex: 1,
  },

  // Option chips. The fill and border are the same values OnboardingScreen
  // uses, so the two screens' pickers still read as one control — the addition
  // here is the tick, because an accent tint on its own is invisible to a
  // colourblind user and says nothing to a screen reader.
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipColumn: {
    gap: spacing.sm,
  },
  chip: {
    // backgroundColor/borderColor are applied via dynamicStyles.chip.
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chipCentred: {
    justifyContent: 'center',
  },
  // The scale wrapper, not the chip, has to grow — the chip is inside it.
  chipGrowWrap: {
    flexGrow: 1,
  },
  chipBlock: {
    width: '100%',
  },
  // chipSelected is now entirely in dynamicStyles (it was color-only).
  chipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chipLabel: {
    ...type.body,
    // color is applied via dynamicStyles.chipLabel.
  },
  // chipLabelSelected is now entirely in dynamicStyles (it was color-only).
  chipDescription: {
    ...type.bodySm,
    // color is applied via dynamicStyles.chipDescription.
    marginTop: spacing.xs,
  },

  avatarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatarSkeleton: {
    borderRadius: radius.pill,
  },
  // Upload/Remove stack vertically beside the preview rather than sitting in
  // a row with it — two buttons next to a 56px circle would either wrap
  // awkwardly on a narrow phone or force the circle smaller to make room.
  avatarButtonCol: {
    gap: spacing.sm,
    flexShrink: 1,
  },
  colorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resetColorText: {
    ...type.bodySm,
    // color is applied via dynamicStyles.resetColorText.
    fontFamily: fontFamily.sansBold,
  },
  // A swatch is a plain filled circle, not a chip — there's no glyph to
  // center like the old emoji chips had, just the color itself and the
  // selected mark on top of it.
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    // backgroundColor/borderColor are applied via dynamicStyles.errorBanner.
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  errorText: {
    ...type.bodySm,
    // color is applied via dynamicStyles.errorText.
    textAlign: 'center',
  },
  save: {
    marginTop: spacing.xxl,
  },
});
