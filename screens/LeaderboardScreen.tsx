import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, EmptyState } from '../components/ui';
import { Shimmer, SlideInRow } from '../components/anim';
import { Enter } from '../components/dashboard';
import Avatar from '../components/Avatar';
import haptics from '../services/haptics';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import {
  LeaderboardEntry,
  fetchTopEntries,
  parseDisplayName,
  REACTION_EMOJI,
  ReactionEmoji,
  ReactionSummary,
  fetchReactions,
  setReaction,
  clearReaction,
} from '../firebase/leaderboard';
import { getRankEmoji } from '../data/ranks';

// Component dimensions, not spacing. The skeleton reuses all three so the
// layout doesn't shift when the real rows land on top of it.
const AVATAR_SIZE = 38;
const RANK_SLOT_WIDTH = 34;
const SKELETON_ROWS = 6;

// Reactions only load (and only render) for the top N rows — see
// firebase/leaderboard.ts's fetchReactions comment. A leaderboard capped at
// 50 entries makes N reads a bounded cost, but there's no reason to spend it
// on rows most people never scroll to.
const REACTION_ROW_LIMIT = 10;

export default function LeaderboardScreen({ navigation }: any) {
  const { authUser } = useUser();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const top = await fetchTopEntries(50);
        if (!cancelled) setEntries(top);

        const forReactions = top.slice(0, REACTION_ROW_LIMIT);
        const summaries = await Promise.all(forReactions.map(e => fetchReactions(e.uid)));
        if (!cancelled) {
          const map: Record<string, ReactionSummary> = {};
          forReactions.forEach((e, i) => { map[e.uid] = summaries[i]; });
          setReactions(map);
        }
      } catch {
        // Most likely cause is the Firestore rules not yet allowing reads of
        // the leaderboard collection, so say so rather than showing an empty
        // list that looks like "nobody is playing".
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic toggle: updates local state immediately (so the tap feels
  // instant) and fires the write in the background. If the write fails —
  // offline, most likely — the next full reload will correct the count; a
  // rare, brief overcount here is a fair trade against making every tap wait
  // on a round trip for something this low-stakes.
  const toggleReaction = async (entryUid: string, emoji: ReactionEmoji) => {
    const myUid = authUser?.uid;
    if (!myUid) return;
    const current = reactions[entryUid] ?? [];
    const mine = current.find(r => r.uid === myUid);
    const removing = mine?.emoji === emoji;

    haptics.selection();
    const next = removing
      ? current.filter(r => r.uid !== myUid)
      : [...current.filter(r => r.uid !== myUid), { uid: myUid, emoji }];
    setReactions(prev => ({ ...prev, [entryUid]: next }));

    try {
      if (removing) {
        await clearReaction(entryUid, myUid);
      } else {
        await setReaction(entryUid, myUid, emoji);
      }
    } catch {
      // Roll back to what it was before the optimistic update.
      setReactions(prev => ({ ...prev, [entryUid]: current }));
      haptics.error();
    }
  };

  // Where the signed-in user sits, so they can find themselves without
  // scrolling. Computed from the same fetched list rather than a second query.
  const myIndex = entries.findIndex(e => e.uid === authUser?.uid);

  const medalFor = (index: number): string => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  };

  // Skeletons in the shape of the rows that are coming, and the AppBar renders
  // in this branch too — the old spinner-only loading state had no back button,
  // so a leaderboard that never resolved was a dead end.
  if (loading) {
    return (
      <Screen scroll contentStyle={styles.container}>
        <AppBar
          title={t('leaderboard')}
          subtitle={t('leaderboardSubtitle')}
          onBack={() => navigation.goBack()}
        />
        <Shimmer width="100%" height={84} style={styles.skeletonCard} />
        <View style={styles.listCard}>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <View key={index}>
              {index > 0 && <View style={styles.rowDivider} />}
              <View style={styles.row}>
                <Shimmer width={RANK_SLOT_WIDTH} height={20} />
                <Shimmer width={AVATAR_SIZE} height={AVATAR_SIZE} style={styles.skeletonAvatar} />
                <View style={styles.nameBlock}>
                  <Shimmer width="55%" height={15} />
                  <Shimmer width="35%" height={11} style={styles.skeletonSubline} />
                </View>
                <Shimmer width={52} height={15} />
              </View>
            </View>
          ))}
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.container}>
      <AppBar
        title={t('leaderboard')}
        subtitle={t('leaderboardSubtitle')}
        onBack={() => navigation.goBack()}
      />

      {/* Your own standing is pinned to the top so it never requires scrolling
          to find — the number most people open this screen for. */}
      {myIndex >= 0 && (
        <Enter index={0}>
          <View style={styles.myRankCard}>
            <View>
              <Text style={styles.myRankValue}>#{myIndex + 1}</Text>
              <Text style={styles.myRankLabel}>{t('yourPosition')}</Text>
            </View>
            <View style={styles.myRankRight}>
              <Text style={styles.myRankXP}>{entries[myIndex].totalXP.toLocaleString()} XP</Text>
              <Text style={styles.myRankOutOf}>
                {t('outOf')} {entries.length}
              </Text>
            </View>
          </View>
        </Enter>
      )}

      {/* One card of rows separated by hairlines, not a stack of cards: a
          ranking is a single list you read down, and the hairlines are what
          make the columns line up as columns. */}
      <Enter index={1}>
        <View style={styles.listCard}>
          {failed ? (
            <EmptyState icon="🔒" title={t('leaderboard')} message={t('leaderboardUnavailable')} />
          ) : entries.length === 0 ? (
            <EmptyState icon="🏆" title={t('leaderboard')} message={t('leaderboardEmpty')} />
          ) : (
            <>
              {/* Column headers, so the trailing number is identifiably XP
                  without relying on its colour to say so. */}
              <View style={styles.headerRow}>
                <Text style={[styles.headerLabel, styles.headerRankLabel]}>#</Text>
                <Text style={styles.headerLabel}>XP</Text>
              </View>

              {entries.map((entry, index) => {
                const isMe = entry.uid === authUser?.uid;
                const { firstName, lastInitial } = parseDisplayName(entry.displayName);
                const isPodium = index < 3;
                const streakPart = entry.streak > 0 ? `, ${entry.streak} day streak` : '';

                return (
                  // SlideInRow reads its stagger from animation/motion.ts, where
                  // the cap lives — all 50 rows finish arriving in the same beat
                  // as every other list in the app.
                  <SlideInRow key={entry.uid} index={index}>
                    {index > 0 && <View style={styles.rowDivider} />}
                    <View
                      style={[styles.row, isMe && styles.rowMe]}
                      accessible
                      // One sentence, in reading order. Left to itself a screen
                      // reader announces four disconnected fragments and the
                      // listener has to reassemble the row.
                      accessibilityLabel={
                        `${isMe ? `${t('you')}, ` : ''}rank ${index + 1}, ${entry.displayName}, ` +
                        `${entry.rank}, ${t('level')} ${entry.level}, ` +
                        `${entry.totalXP.toLocaleString()} XP${streakPart}`
                      }>
                      {/* The numeral is always rendered, medal or not: the
                          medals are a flourish on top of the rank, never the
                          only way to read it. */}
                      <View style={styles.rankSlot}>
                        {isPodium && <Text style={styles.medal}>{medalFor(index)}</Text>}
                        <Text style={[styles.rankNumber, isPodium && styles.rankNumberPodium]}>
                          {index + 1}
                        </Text>
                      </View>

                      <Avatar
                        photoUrl={entry.avatar}
                        color={entry.avatarColor}
                        uid={entry.uid}
                        firstName={firstName}
                        lastInitial={lastInitial}
                        size={AVATAR_SIZE}
                      />

                      <View style={styles.nameBlock}>
                        <View style={styles.nameLine}>
                          <Text style={styles.name} numberOfLines={1}>
                            {entry.displayName}
                          </Text>
                          {/* Your row is already tinted and outlined, but a tint
                              is invisible to a colourblind eye and to a
                              screenshot in bright sun — the word is what
                              actually carries it. */}
                          {isMe && (
                            <View style={styles.youBadge}>
                              <Text style={styles.youBadgeText}>{t('you').toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.rankLine} numberOfLines={1}>
                          {getRankEmoji(entry.rank)} {entry.rank} · {t('level')} {entry.level}
                          {entry.streak > 0 ? ` · 🔥 ${entry.streak}` : ''}
                        </Text>
                      </View>

                      <Text style={styles.xp}>{entry.totalXP.toLocaleString()}</Text>
                    </View>

                    {/* No reacting to your own row — there's nothing to
                        acknowledge about your own standing, and it would
                        just be a way to inflate your own count. */}
                    {index < REACTION_ROW_LIMIT && !isMe && (
                      <View style={styles.reactionRow}>
                        {REACTION_EMOJI.map((emoji) => {
                          const summary = reactions[entry.uid] ?? [];
                          const count = summary.filter(r => r.emoji === emoji).length;
                          const mine = summary.some(r => r.uid === authUser?.uid && r.emoji === emoji);
                          return (
                            <Pressable
                              key={emoji}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityLabel={`React ${emoji} to ${entry.displayName}`}
                              accessibilityState={{ selected: mine }}
                              onPress={() => toggleReaction(entry.uid, emoji)}
                              style={[styles.reactionChip, mine && styles.reactionChipMine]}>
                              <Text style={styles.reactionEmoji}>{emoji}</Text>
                              {count > 0 && <Text style={styles.reactionCount}>{count}</Text>}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </SlideInRow>
                );
              })}
            </>
          )}
        </View>
      </Enter>

      <Enter index={2}>
        <Text style={styles.privacyNote}>{t('leaderboardPrivacy')}</Text>
      </Enter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: layout.gap,
    paddingBottom: layout.bottomInset,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  skeletonAvatar: {
    borderRadius: AVATAR_SIZE / 2,
  },
  skeletonSubline: {
    marginTop: spacing.xs + 2,
  },
  // Your standing is the headline of this screen, so it gets the raised
  // surface and the brighter border — depth here is fill + border, not shadow.
  myRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.accentBorder,
    padding: spacing.lg,
  },
  myRankValue: {
    ...type.display,
    color: colors.accent,
  },
  myRankLabel: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  myRankRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  myRankXP: {
    ...type.body,
    color: colors.xp,
    fontFamily: fontFamily.sansBlack,
  },
  myRankOutOf: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  // One card, N rows. Horizontal padding only — each row owns its vertical
  // padding so the hairlines run the full height of the row.
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  headerRankLabel: {
    width: RANK_SLOT_WIDTH,
    textAlign: 'center',
  },
  rowDivider: {
    height: layout.hairline,
    backgroundColor: colors.divider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  // Fill AND edge, because a tint alone is the one thing a colourblind or
  // sun-glared reader can miss. The negative margin lets the tint reach the
  // card's inner edges while the row keeps the card's gutter.
  rowMe: {
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.lg - 3,
  },
  rankSlot: {
    width: RANK_SLOT_WIDTH,
    alignItems: 'center',
  },
  medal: {
    fontSize: 16,
    lineHeight: 20,
  },
  rankNumber: {
    ...type.body,
    color: colors.textSecondary,
    fontFamily: fontFamily.sansBlack,
  },
  // Under a medal the numeral is confirmation rather than the main read, so
  // it drops to the small size — but it never disappears.
  rankNumberPodium: {
    ...type.label,
    color: colors.textMuted,
  },
  nameBlock: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...type.body,
    color: colors.textPrimary,
    fontFamily: fontFamily.sansBold,
    flexShrink: 1,
  },
  youBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  youBadgeText: {
    ...type.label,
    color: colors.textOnAccent,
  },
  rankLine: {
    ...type.bodySm,
    color: colors.textMuted,
    marginTop: spacing.xs / 2,
  },
  xp: {
    ...type.body,
    color: colors.xp,
    fontFamily: fontFamily.sansBlack,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingBottom: spacing.md,
    paddingLeft: RANK_SLOT_WIDTH + spacing.md + AVATAR_SIZE + spacing.md,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  reactionChipMine: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    ...type.label,
    color: colors.textMuted,
  },
  privacyNote: {
    ...type.bodySm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
