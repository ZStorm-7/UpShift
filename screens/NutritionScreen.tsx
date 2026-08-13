import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Modal } from 'react-native';
import { colors } from '../theme/colors';

type FoodEntry = {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const CALORIE_GOAL = 2000;

export default function NutritionScreen({ navigation }: any) {
  const [foodLog, setFoodLog] = useState<FoodEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const totalCalories = foodLog.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = foodLog.reduce((sum, item) => sum + item.protein, 0);
  const totalCarbs = foodLog.reduce((sum, item) => sum + item.carbs, 0);
  const totalFat = foodLog.reduce((sum, item) => sum + item.fat, 0);
  const calorieProgress = Math.min((totalCalories / CALORIE_GOAL) * 100, 100);

  const addFood = () => {
    if (!foodName || !calories) return;
    const newEntry: FoodEntry = {
      id: Date.now(),
      name: foodName,
      calories: parseInt(calories) || 0,
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
    };
    setFoodLog([...foodLog, newEntry]);
    setFoodName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setModalVisible(false);
  };

  const deleteFood = (id: number) => {
    setFoodLog(foodLog.filter(item => item.id !== id));
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </Pressable>
          <Text style={styles.screenTitle}>Nutrition</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Calorie progress */}
        <View style={styles.card}>
          <View style={styles.calorieRow}>
            <Text style={styles.calorieCount}>{totalCalories}</Text>
            <Text style={styles.calorieGoal}>/ {CALORIE_GOAL} kcal</Text>
          </View>
          <View style={styles.progressBg}>
            <View style={[
              styles.progressFill,
              { width: `${calorieProgress}%` },
              totalCalories > CALORIE_GOAL && styles.progressOver
            ]} />
          </View>
          <Text style={styles.calorieLabel}>
            {totalCalories > CALORIE_GOAL
              ? `${totalCalories - CALORIE_GOAL} kcal over goal`
              : `${CALORIE_GOAL - totalCalories} kcal remaining`}
          </Text>
        </View>

        {/* Macro row */}
        <View style={styles.macroRow}>
          <View style={styles.macroCard}>
            <Text style={[styles.macroValue, { color: colors.protein }]}>{totalProtein}g</Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroCard}>
            <Text style={[styles.macroValue, { color: colors.carbs }]}>{totalCarbs}g</Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroCard}>
            <Text style={[styles.macroValue, { color: colors.fat }]}>{totalFat}g</Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
        </View>

        {/* Food log */}
        <Text style={styles.sectionTitle}>Today's Food</Text>
        {foodLog.length === 0 && (
          <Text style={styles.emptyText}>No food logged yet. Tap + to add.</Text>
        )}
        {foodLog.map(item => (
          <View key={item.id} style={styles.foodCard}>
            <View style={styles.foodLeft}>
              <Text style={styles.foodName}>{item.name}</Text>
              <Text style={styles.foodMacros}>
                P: {item.protein}g · C: {item.carbs}g · F: {item.fat}g
              </Text>
            </View>
            <View style={styles.foodRight}>
              <Text style={styles.foodCalories}>{item.calories} kcal</Text>
              <Pressable onPress={() => deleteFood(item.id)}>
                <Text style={styles.deleteButton}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}

      </ScrollView>

      {/* Add food button */}
      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ Log Food</Text>
      </Pressable>

      {/* Add food modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Food</Text>
            <TextInput
              style={styles.input}
              placeholder="Food name"
              placeholderTextColor={colors.textSecondary}
              value={foodName}
              onChangeText={setFoodName}
            />
            <TextInput
              style={styles.input}
              placeholder="Calories"
              placeholderTextColor={colors.textSecondary}
              value={calories}
              onChangeText={setCalories}
              keyboardType="numeric"
            />
            <View style={styles.macroInputRow}>
              <TextInput
                style={[styles.input, styles.macroInput]}
                placeholder="Protein (g)"
                placeholderTextColor={colors.textSecondary}
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.macroInput]}
                placeholder="Carbs (g)"
                placeholderTextColor={colors.textSecondary}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, styles.macroInput]}
                placeholder="Fat (g)"
                placeholderTextColor={colors.textSecondary}
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.modalButtons}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.addButton, (!foodName || !calories) && styles.buttonDisabled]}
                onPress={addFood}>
                <Text style={styles.addButtonText}>Add Food</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    gap: 16,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    color: colors.accent,
    fontSize: 16,
    width: 60,
  },
  screenTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  calorieCount: {
    color: colors.textPrimary,
    fontSize: 36,
    fontWeight: '700',
  },
  calorieGoal: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  progressBg: {
    height: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 8,
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  progressOver: {
    backgroundColor: colors.danger,
  },
  calorieLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  macroValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  macroLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  foodCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  foodLeft: {
    flex: 1,
  },
  foodName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  foodMacros: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  foodRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  foodCalories: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  fabText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  macroInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  macroInput: {
    flex: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});