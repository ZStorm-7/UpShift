import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from 'react-native';
import { colors } from '../theme/colors';
import { useUser, calculateWaterGoal, calculateCalorieGoal } from '../context/UserContext';

const activityOptions = [
  { label: 'Sedentary', description: 'Little to no exercise, desk job' },
  { label: 'Lightly active', description: 'Light exercise 1–3 days/week' },
  { label: 'Moderately active', description: 'Moderate exercise 3–5 days/week' },
  { label: 'Very active', description: 'Hard exercise 6–7 days/week' },
];

export default function OnboardingScreen({ navigation }: any) {
  const { setProfile } = useUser();
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

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.stepText}>Step 1 of 5</Text>
              <Text style={styles.title}>What's your name?</Text>
              <Text style={styles.subtitle}>We'll use this to personalize your experience.</Text>
            </View>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={colors.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
                onSubmitEditing={() => firstName && lastInitial && setStep(2)}
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                placeholder="Last initial (e.g. S)"
                placeholderTextColor={colors.textSecondary}
                value={lastInitial}
                onChangeText={(val) => setLastInitial(val.slice(0, 1).toUpperCase())}
                onSubmitEditing={() => firstName && lastInitial && setStep(2)}
                returnKeyType="done"
                maxLength={1}
              />
            </View>
            <Pressable
              style={[styles.button, (!firstName || !lastInitial) && styles.buttonDisabled]}
              onPress={() => firstName && lastInitial && setStep(2)}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </>
        );

      case 2:
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.stepText}>Step 2 of 5</Text>
              <Text style={styles.title}>Your body stats</Text>
              <Text style={styles.subtitle}>Used to calculate your calorie targets.</Text>
            </View>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Age (max 120 years)"
                placeholderTextColor={colors.textSecondary}
                value={age}
                onChangeText={(val) => setAge(validateAge(val))}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.label}>Height</Text>
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Feet (max 8 ft)"
                  placeholderTextColor={colors.textSecondary}
                  value={heightFeet}
                  onChangeText={(val) => setHeightFeet(validateHeightFeet(val))}
                  keyboardType="numeric"
                  maxLength={1}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Inches (0–11 in)"
                  placeholderTextColor={colors.textSecondary}
                  value={heightInches}
                  onChangeText={(val) => setHeightInches(validateHeightInches(val))}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              {heightFeet ? (
                <Text style={styles.conversionText}>= {heightInCm()} cm</Text>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Weight in lbs (max 1000 lbs)"
                placeholderTextColor={colors.textSecondary}
                value={weight}
                onChangeText={(val) => setWeight(validateWeight(val))}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
            <Pressable
              style={[styles.button, (!age || !heightFeet || !weight) && styles.buttonDisabled]}
              onPress={() => age && heightFeet && weight && setStep(3)}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </>
        );

      case 3:
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.stepText}>Step 3 of 5</Text>
              <Text style={styles.title}>About you</Text>
              <Text style={styles.subtitle}>Helps us fine-tune your daily targets.</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.optionRow}>
                {['Male', 'Female', 'Other'].map(g => (
                  <Pressable
                    key={g}
                    style={[styles.option, gender === g && styles.optionSelected]}
                    onPress={() => setGender(g)}>
                    <Text style={[styles.optionText, gender === g && styles.optionTextSelected]}>{g}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Activity Level</Text>
              <View style={styles.optionColumn}>
                {activityOptions.map(a => (
                  <Pressable
                    key={a.label}
                    style={[styles.activityOption, activityLevel === a.label && styles.optionSelected]}
                    onPress={() => setActivityLevel(a.label)}>
                    <Text style={[styles.optionText, activityLevel === a.label && styles.optionTextSelected]}>
                      {a.label}
                    </Text>
                    <Text style={styles.optionDescription}>{a.description}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable
              style={[styles.button, (!gender || !activityLevel) && styles.buttonDisabled]}
              onPress={() => gender && activityLevel && setStep(4)}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </>
        );

      case 4:
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.stepText}>Step 4 of 5</Text>
              <Text style={styles.title}>What's your goal?</Text>
              <Text style={styles.subtitle}>We'll customize your quests around this.</Text>
            </View>
            <View style={styles.optionColumn}>
              {[
                'Lose weight',
                'Build muscle',
                'Stay healthy',
                'Improve endurance',
                'Build better habits',
              ].map(g => (
                <Pressable
                  key={g}
                  style={[styles.option, goal === g && styles.optionSelected]}
                  onPress={() => setGoal(g)}>
                  <Text style={[styles.optionText, goal === g && styles.optionTextSelected]}>{g}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, !goal && styles.buttonDisabled]}
              onPress={() => goal && setStep(5)}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </>
        );

      case 5:
        return (
          <>
            <View style={styles.header}>
              <Text style={styles.stepText}>Step 5 of 5</Text>
              <Text style={styles.title}>You're all set, {firstName}!</Text>
              <Text style={styles.subtitle}>Here's what your first day looks like.</Text>
            </View>
            <View style={styles.previewCard}>
              <Text style={styles.previewItem}>⚡ Daily XP Goal: 100 XP</Text>
              <Text style={styles.previewItem}>🎯 Daily Quests: 3</Text>
              <Text style={styles.previewItem}>
                💧 Water Goal: {calculateWaterGoal(parseInt(age))}ml
              </Text>
              <Text style={styles.previewItem}>
                🔥 Calorie Goal: {calculateCalorieGoal(
                  parseInt(age),
                  parseInt(weight),
                  parseInt(heightFeet),
                  parseInt(heightInches),
                  gender,
                  activityLevel,
                  goal
                )} kcal
              </Text>
              <Text style={styles.previewItem}>😴 Sleep Goal: 8 hours</Text>
            </View>
            <Pressable
              style={styles.button}
              onPress={() => {
                const ageNum = parseInt(age);
                const waterGoal = calculateWaterGoal(ageNum);
                const calorieGoal = calculateCalorieGoal(
                  ageNum,
                  parseInt(weight),
                  parseInt(heightFeet),
                  parseInt(heightInches),
                  gender,
                  activityLevel,
                  goal
                );
                setProfile({
                  firstName,
                  lastInitial,
                  age: ageNum,
                  heightFeet: parseInt(heightFeet),
                  heightInches: parseInt(heightInches),
                  weightLbs: parseInt(weight),
                  gender,
                  activityLevel,
                  goal,
                  waterGoalMl: waterGoal,
                  calorieGoal,
                });
                navigation.navigate('Dashboard');
              }}>
              <Text style={styles.buttonText}>Your journey begins now</Text>
            </Pressable>
          </>
        );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {renderStep()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    paddingVertical: 60,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 40,
  },
  stepText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
  },
  inputGroup: {
    gap: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  conversionText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: -4,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionColumn: {
    gap: 8,
  },
  option: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
    alignItems: 'center',
  },
  activityOption: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: '600',
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '600',
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewItem: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
});