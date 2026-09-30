// AchievementsScreen — the trophy case for the achievements layer (see
// data/achievements.ts for why this is a separate system from rank).
// Groups by tier (Platinum first — the rarest at the top, same convention
// the Leaderboard uses for podium ordering) and shows every achievement,
// locked or not, rather than hiding what hasn't been earned yet — seeing
// "Unstoppable: reach a 100-day streak" locked is itself a hint at what the
// app rewards, the same reason a game's trophy list shows names before
// they're earned instead of just a count.
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette, Palette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar } from '../components/ui';
import { Shimmer, SlideInRow } from '../components/anim';
import { Enter } from '../components/dashboard';
import { useUser } from '../context/UserContext';
import { ACHIEVEMENTS, AchievementTier, TIER_COLORS } from '../data/achievements';
import { loadUnlockedAchievements } from '../firebase/achievements';
import { safeGoBack } from '../utils/nav';

const TIER_ORDER: AchievementTier[] = ['platinum', 'gold', 'silver', 'bronze'];
const TIER_LABELS: Record<AchievementTier, string> = {
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
};

export default function AchievementsScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    loadUnlockedAchievements(authUser.uid)
      .then(map => { if (!cancelled) setUnlocked(map); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  const unlockedCount = Object.keys(unlocked).length;

  return (
    <Screen scroll contentStyle={[styles.container, { backgroundColor: palette.bg }]}>
      <AppBar title="Achievements" subtitle={`${unlockedCount} / ${ACHIEVEMENTS.length} unlocked`} onBack={() => safeGoBack(navigation)} />

      {loading ? (
        <View style={{ gap: spacing.md }}>
          <Shimmer width="100%" height={80} radius={radius.lg} />
          <Shimmer width="100%" height={80} radius={radius.lg} />
          <Shimmer width="100%" height={80} radius={radius.lg} />
        </View>
      ) : (
        TIER_ORDER.map(tier => {
          const inTier = ACHIEVEMENTS.filter(a => a.tier === tier);
          return (
            <View key={tier} style={styles.tierSection}>
              <View style={styles.tierHeaderRow}>
                <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[tier] }]} />
                <Text style={[styles.tierHeader, { color: palette.textPrimary }]}>{TIER_LABELS[tier]}</Text>
              </View>
              {inTier.map((achievement, index) => {
                const isUnlocked = !!unlocked[achievement.id];
                return (
                  <SlideInRow key={achievement.id} index={index}>
                    <View
                      style={[
                        styles.card,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                        !isUnlocked && styles.cardLocked,
                      ]}
                      accessible
                      accessibilityLabel={`${achievement.name}, ${achievement.description}, ${isUnlocked ? 'unlocked' : 'locked'}`}>
                      <View
                        style={[
                          styles.iconCircle,
                          { backgroundColor: isUnlocked ? `${TIER_COLORS[tier]}33` : palette.surfaceSunken },
                        ]}>
                        <Ionicons
                          name={isUnlocked ? achievement.icon : 'lock-closed'}
                          size={22}
                          color={isUnlocked ? TIER_COLORS[tier] : palette.textMuted}
                        />
                      </View>
                      <View style={styles.cardText}>
                        <Text style={[styles.cardName, { color: isUnlocked ? palette.textPrimary : palette.textMuted }]}>
                          {achievement.name}
                        </Text>
                        <Text style={[styles.cardDescription, { color: palette.textMuted }]} numberOfLines={2}>
                          {achievement.description}
                        </Text>
                      </View>
                      {isUnlocked && <Ionicons name="checkmark-circle" size={20} color={TIER_COLORS[tier]} />}
                    </View>
                  </SlideInRow>
                );
              })}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: layout.gap,
    paddingBottom: layout.bottomInset,
  },
  tierSection: {
    gap: spacing.sm,
  },
  tierHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tierDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tierHeader: {
    ...type.title,
    fontSize: 17,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: layout.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardLocked: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: fontFamily.sansBold,
    fontSize: 15,
  },
  cardDescription: {
    ...type.bodySm,
  },
});
