// LiabilityScreen — the one-time waiver, shown once between the paywall and
// Onboarding.
//
// Deliberately NOT stored on the main `users/{uid}` profile document: that
// document's mere existence is what RootNavigator uses to decide "has this
// user finished Onboarding" (see App.tsx's hasProfile check). Merging a
// `liabilityAccepted` field into it here — before Onboarding has ever run —
// would make that document "exist" prematurely and misroute a user straight
// to the Dashboard with no profile. It lives in its own meta doc instead,
// the same pattern already used for weightPromptSkips/sleepPromptSkips.

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, Button } from '../components/ui';
import { useUser } from '../context/UserContext';
import haptics from '../services/haptics';

export function liabilityDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'liability');
}

export default function LiabilityScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    if (!authUser || !checked || accepting) return;
    setAccepting(true);
    try {
      await setDoc(liabilityDocRef(authUser.uid), { accepted: true }, { merge: true });
      haptics.setComplete();
      navigation.replace('Onboarding');
    } catch {
      Alert.alert('Something went wrong', 'Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>Before you start</Text>
        <ScrollView style={styles.scroll}>
          <Text style={[styles.text, { color: palette.textSecondary }]}>
            Exercise carries an inherent risk of injury. By using UpShift's workout
            features, you confirm that you are physically able to participate in
            exercise and that you are voluntarily participating with full knowledge
            of the risks involved.{'\n\n'}
            UpShift, its developers, and affiliates are not responsible for any
            injury, loss, or damage of any kind that may result from participating
            in workouts recommended or tracked through this app.{'\n\n'}
            If you have any medical condition, injury, or physical limitation, consult
            a physician before beginning any exercise program. Stop immediately and
            seek medical attention if you experience pain, dizziness, or discomfort
            during a workout.{'\n\n'}
            This app is not a substitute for professional medical advice, diagnosis,
            or treatment.
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => { haptics.selection(); setChecked(v => !v); }}
          style={styles.checkRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="I have read and accept this">
          <View
            style={[
              styles.checkbox,
              { borderColor: palette.borderStrong },
              checked && { backgroundColor: palette.accent, borderColor: palette.accent },
            ]}>
            {checked && <Ionicons name="checkmark" size={16} color={palette.textOnAccent} />}
          </View>
          <Text style={[styles.checkLabel, { color: palette.textPrimary }]}>
            I have read and accept this
          </Text>
        </Pressable>
        <Button
          label={accepting ? 'Please wait…' : 'Continue'}
          onPress={accept}
          disabled={!checked || accepting}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontFamily: fontFamily.serif, fontSize: 26, marginTop: spacing.xl },
  scroll: { flex: 1 },
  text: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21 },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: radius.sm, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkLabel: { fontFamily: fontFamily.sansBold, fontSize: 14, flex: 1 },
});
