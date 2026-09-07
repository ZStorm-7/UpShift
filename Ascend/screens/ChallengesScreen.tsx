import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, Meter, Pill, EmptyState } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import Avatar from '../components/Avatar';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { getDoc } from 'firebase/firestore';
import { leaderboardDocRef, LeaderboardEntry, parseDisplayName } from '../firebase/leaderboard';
import { safeGoBack } from '../utils/nav';
import {
  Challenge,
  getMyChallenges,
  countWorkoutsInRange,
  reportChallengeScore,
  finalizeChallengeIfDue,
} from '../firebase/challenges';

const AVATAR_SIZE = 40;

type EnrichedChallenge = Challenge & { opponent: LeaderboardEntry | null; opponentUid: string };

function daysRemaining(endDate: string): number {
  const end = new Date(endDate + 'T23:59:59');
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

export default function ChallengesScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<EnrichedChallenge[]>([]);

  const load = useCallback(async () => {
    if (!authUser) return;
    const uid = authUser.uid;
    try {
      let mine = await getMyChallenges(uid);

      // Self-report this account's current score into every still-active
      // challenge before rendering, and close out anything whose window has
      // passed — see firebase/challenges.ts for why this can't be done
      // server-side on the free plan. Cheap to redo on every visit: both
      // functions are no-ops when nothing's actually changed.
      mine = await Promise.all(
        mine.map(async (c) => {
          if (c.status !== 'active') return c;
          const myCount = await countWorkoutsInRange(uid, c.startDate, c.endDate);
          let updated = c;
          if (myCount !== (c.scores[uid] ?? 0)) {
            await reportChallengeScore(c.id, uid, c.scores, myCount);
            updated = { ...c, scores: { ...c.scores, [uid]: myCount } };
          }
          return finalizeChallengeIfDue(updated);
        })
      );

      const enriched: EnrichedChallenge[] = await Promise.all(
        mine.map(async (c) => {
          const opponentUid = c.participants.find(p => p !== uid) ?? c.participants[0];
          const snap = await getDoc(leaderboardDocRef(opponentUid));
          return { ...c, opponentUid, opponent: snap.exists() ? (snap.data() as LeaderboardEntry) : null };
        })
      );

      // Active first, most-recently-created within each group first — a
      // challenge you just started from Friends should be the first thing
      // you see, not buried under ones from weeks ago.
      enriched.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return b.startDate.localeCompare(a.startDate);
      });

      setChallenges(enriched);
    } catch {
      // Same reasoning as Friends: offline or a transient failure just
      // leaves the screen showing whatever it last had.
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll>
        <AppBar title={t('challengesTitle')} onBack={() => safeGoBack(navigation)} />
        <View style={styles.skeletonStack}>
          <Shimmer width="100%" height={140} style={styles.skeletonCard} />
          <Shimmer width="100%" height={140} style={styles.skeletonCard} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppBar
        title={t('challengesTitle')}
        onBack={() => safeGoBack(navigation)}
        subtitle={t('challengesSubtitle')}
      />

      {challenges.length === 0 ? (
        <EmptyState icon="flag" title={t('noChallengesYet')} message={t('noChallengesYetHint')} />
      ) : (
        <Enter index={0}>
          {challenges.map((c) => {
            const uid = authUser?.uid ?? '';
            const myScore = c.scores[uid] ?? 0;
            const theirScore = c.scores[c.opponentUid] ?? 0;
            const highest = Math.max(myScore, theirScore, 1);
            const won = c.status === 'completed' && c.winnerUid === uid;
            const lost = c.status === 'completed' && c.winnerUid && c.winnerUid !== uid;
            const tied = c.status === 'completed' && !c.winnerUid;

            return (
              <Card key={c.id} style={styles.challengeCard}>
                <View style={styles.headerRow}>
                  <Text style={[styles.goalLabel, { color: palette.textPrimary }]} numberOfLines={1}>
                    {c.goalLabel}
                  </Text>
                  {c.status === 'active' ? (
                    <Pill label={`${daysRemaining(c.endDate)}d ${t('left')}`} />
                  ) : (
                    <Pill
                      label={won ? t('youWon') : lost ? t('youLost') : t('itsATie')}
                      color={won ? palette.success : lost ? palette.textMuted : palette.info}
                      filled={won}
                    />
                  )}
                </View>

                <View style={styles.participantRow}>
                  <Avatar
                    photoUrl={profile?.avatar}
                    color={profile?.avatarColor}
                    uid={uid}
                    firstName={profile?.firstName}
                    lastInitial={profile?.lastInitial}
                    size={AVATAR_SIZE}
                  />
                  <Text style={[styles.participantLabel, { color: palette.textSecondary }]}>{t('you')}</Text>
                  <Text style={[styles.scoreText, { color: palette.textPrimary }]}>{myScore}</Text>
                </View>
                <Meter progress={myScore / highest} color={palette.accent} />

                <View style={[styles.participantRow, styles.participantRowSpaced]}>
                  <Avatar
                    photoUrl={c.opponent?.avatar}
                    color={c.opponent?.avatarColor}
                    uid={c.opponentUid}
                    firstName={c.opponent ? parseDisplayName(c.opponent.displayName).firstName : undefined}
                    lastInitial={c.opponent ? parseDisplayName(c.opponent.displayName).lastInitial : undefined}
                    size={AVATAR_SIZE}
                  />
                  <Text style={[styles.participantLabel, { color: palette.textSecondary }]} numberOfLines={1}>
                    {c.opponent?.displayName ?? t('friend')}
                  </Text>
                  <Text style={[styles.scoreText, { color: palette.textPrimary }]}>{theirScore}</Text>
                </View>
                <Meter progress={theirScore / highest} color={palette.textMuted} />
              </Card>
            );
          })}
        </Enter>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletonStack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  challengeCard: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  goalLabel: {
    ...type.body,
    // color is applied inline from the palette.
    fontFamily: fontFamily.sansSemi,
    flex: 1,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  participantRowSpaced: {
    marginTop: spacing.md,
  },
  participantLabel: {
    ...type.bodySm,
    // color is applied inline from the palette.
    flex: 1,
  },
  scoreText: {
    ...type.heading,
    // color is applied inline from the palette.
  },
});
