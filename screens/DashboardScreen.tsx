import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from 'react-native';
import { colors } from '../theme/colors';
import { useUser } from '../context/UserContext';

const DAILY_QUESTS = [
  { id: 1, title: 'Log a workout', xp: 30 },
  { id: 2, title: 'Hit your calorie goal', xp: 25 },
  { id: 3, title: 'Drink your water goal', xp: 20 },
];

export default function DashboardScreen({ navigation }: any) {
  const { profile } = useUser();

  const [quests, setQuests] = useState(DAILY_QUESTS.map(q => ({ ...q, completed: false })));
  const [currentXP, setCurrentXP] = useState(20);
  const [level, setLevel] = useState(1);

  const [waterTotal, setWaterTotal] = useState(0);
  const waterGoal = profile?.waterGoalMl || 2500;
  const [waterModalVisible, setWaterModalVisible] = useState(false);
  const [waterInput, setWaterInput] = useState('');

  const [sleepHours, setSleepHours] = useState(0);
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [sleepInput, setSleepInput] = useState('');

  const waterPercent = Math.round((waterTotal / waterGoal) * 100);
  const totalXP = 100;
  const xpProgress = (currentXP / totalXP) * 100;

  const completeQuest = (id: number, xp: number) => {
    setQuests(prev =>
      prev.map(q => q.id === id ? { ...q, completed: true } : q)
    );
    const newXP = currentXP + xp;
    if (newXP >= totalXP) {
      setCurrentXP(newXP - totalXP);
      setLevel(prev => prev + 1);
    } else {
      setCurrentXP(newXP);
    }
  };

  const addWater = () => {
    const amount = parseInt(waterInput) || 0;
    if (amount > 0) {
      setWaterTotal(prev => Math.min(prev + amount, waterGoal));
      setWaterInput('');
      setWaterModalVisible(false);
    }
  };

  const logSleep = () => {
    const hours = parseFloat(sleepInput) || 0;
    if (hours > 0 && hours <= 24) {
      setSleepHours(hours);
      setSleepInput('');
      setSleepModalVisible(false);
    }
  };

  const getRankInfo = () => {
    if (level < 5) return { rank: 'Rookie', next: 'Grinder at Level 5' };
    if (level < 10) return { rank: 'Grinder', next: 'Athlete at Level 10' };
    if (level < 20) return { rank: 'Athlete', next: 'Warrior at Level 20' };
    if (level < 35) return { rank: 'Warrior', next: 'Champion at Level 35' };
    if (level < 50) return { rank: 'Champion', next: 'Legend at Level 50' };
    if (level < 75) return { rank: 'Legend', next: 'Mythic at Level 75' };
    return { rank: 'Mythic', next: "You've reached the top!" };
  };

  const { rank, next } = getRankInfo();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Warning banners */}
      {sleepHours > 0 && sleepHours < 6 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>😴 You only got {sleepHours}h of sleep. Rest up today.</Text>
        </View>
      )}
      {waterTotal > 0 && waterPercent < 50 && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>💧 You've only hit {waterPercent}% of your water goal.</Text>
        </View>
      )}

      {/* Greeting */}
      {profile && (
        <Text style={styles.greeting}>Good morning, {profile.firstName} 👋</Text>
      )}

      {/* Rank + XP */}
      <View style={styles.card}>
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>Level {level}</Text>
          <Text style={styles.xpLabel}>{currentXP} / {totalXP} XP</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, { width: `${xpProgress}%` }]} />
        </View>
        <Text style={styles.rankTitle}>⚔️ {rank}</Text>
        <Text style={styles.rankNext}>Next rank: {next}</Text>
      </View>

      {/* Daily Quests */}
      <Text style={styles.sectionTitle}>Daily Quests</Text>
      {quests.map(quest => (
        <Pressable
          key={quest.id}
          style={[styles.questCard, quest.completed && styles.questCompleted]}
          onPress={() => !quest.completed && completeQuest(quest.id, quest.xp)}>
          <View style={styles.questLeft}>
            <Text style={styles.questCheck}>{quest.completed ? '✅' : '⬜'}</Text>
            <Text style={[styles.questTitle, quest.completed && styles.questTitleDone]}>
              {quest.title}
            </Text>
          </View>
          <Text style={styles.questXP}>+{quest.xp} XP</Text>
        </Pressable>
      ))}

      {/* Today's Stats */}
      <Text style={styles.sectionTitle}>Today</Text>
      <View style={styles.statsRow}>
        <Pressable style={styles.statCard} onPress={() => navigation.navigate('Nutrition')}>
          <Text style={styles.statIcon}>🍎</Text>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Calories</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => navigation.navigate('Workout')}>
          <Text style={styles.statIcon}>💪</Text>
          <Text style={styles.statValue}>0</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setWaterModalVisible(true)}>
          <Text style={styles.statIcon}>💧</Text>
          <Text style={styles.statValue}>{(waterTotal / 1000).toFixed(1)}L</Text>
          <Text style={styles.statLabel}>Water</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => setSleepModalVisible(true)}>
          <Text style={styles.statIcon}>😴</Text>
          <Text style={styles.statValue}>{sleepHours > 0 ? `${sleepHours}h` : '—'}</Text>
          <Text style={styles.statLabel}>Sleep</Text>
        </Pressable>
      </View>

      {/* Water progress */}
      <View style={styles.card}>
        <View style={styles.rankRow}>
          <Text style={styles.rankLabel}>💧 Water</Text>
          <Text style={styles.xpLabel}>{waterTotal}ml / {waterGoal}ml</Text>
        </View>
        <View style={styles.xpBarBg}>
          <View style={[styles.xpBarFill, {
            width: `${Math.min(waterPercent, 100)}%`,
            backgroundColor: colors.protein
          }]} />
        </View>
        <Pressable style={styles.addWaterButton} onPress={() => setWaterModalVisible(true)}>
          <Text style={styles.addWaterText}>+ Log Water</Text>
        </Pressable>
      </View>

      {/* Water modal */}
      <Modal visible={waterModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Water</Text>
            <Text style={styles.modalSubtitle}>How much did you drink? (ml)</Text>
            <View style={styles.quickButtons}>
              {[250, 350, 500, 750].map(amount => (
                <Pressable
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => {
                    setWaterTotal(prev => Math.min(prev + amount, waterGoal));
                    setWaterModalVisible(false);
                  }}>
                  <Text style={styles.quickButtonText}>{amount}ml</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.orText}>or enter custom amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Custom amount (ml)"
              placeholderTextColor={colors.textSecondary}
              value={waterInput}
              onChangeText={setWaterInput}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelButton} onPress={() => setWaterModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={addWater}>
                <Text style={styles.confirmText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Sleep modal */}
      <Modal visible={sleepModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Log Sleep</Text>
            <Text style={styles.modalSubtitle}>How many hours did you sleep?</Text>
            <View style={styles.quickButtons}>
              {[6, 7, 8, 9].map(hours => (
                <Pressable
                  key={hours}
                  style={styles.quickButton}
                  onPress={() => {
                    setSleepHours(hours);
                    setSleepModalVisible(false);
                  }}>
                  <Text style={styles.quickButtonText}>{hours}h</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.orText}>or enter custom amount</Text>
            <TextInput
              style={styles.input}
              placeholder="Hours (e.g. 7.5)"
              placeholderTextColor={colors.textSecondary}
              value={sleepInput}
              onChangeText={setSleepInput}
              keyboardType="numeric"
            />
            <View style={styles.modalButtons}>
              <Pressable style={styles.cancelButton} onPress={() => setSleepModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={logSleep}>
                <Text style={styles.confirmText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 60,
    gap: 16,
    paddingBottom: 100,
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  warningBanner: {
    backgroundColor: '#2A1F10',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 12,
    padding: 14,
  },
  warningText: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  rankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rankLabel: {
    color: colors.xp,
    fontWeight: '700',
    fontSize: 16,
  },
  xpLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  xpBarBg: {
    height: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 8,
    backgroundColor: colors.xp,
    borderRadius: 4,
  },
  rankTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  rankNext: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  questCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  questCompleted: {
    opacity: 0.5,
  },
  questLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  questCheck: {
    fontSize: 20,
  },
  questTitle: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  questTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  questXP: {
    color: colors.xp,
    fontWeight: '700',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  statIcon: {
    fontSize: 20,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  addWaterButton: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addWaterText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
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
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  orText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
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
  confirmButton: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});