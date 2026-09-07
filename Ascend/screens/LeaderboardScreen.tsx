import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
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
import { getRankIcon } from '../data/ranks';
import { safeGoBack } from '../utils/nav';

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
  const palette = usePalette();
  // This screen never called usePalette() before — every card, divider, and
  // XP/rank colour was hardcoded from the static dark-only `colors`, so the
  // whole leaderboard stayed dark-themed regardless of the user's light/dark
  // setting. Built as a plain object (not StyleSheet.create, which registers
  // once and can't react to the theme changing) merging each static
  // structural style with its palette-correct colour under the same key
  // name, so every `styles.X` reference below only needed to become
  // `dynamicStyles.X`.
  const dynamicStyles = {
    myRankCard: [styles.myRankCard, { backgroundColor: palette.surfaceRaised, borderColor: palette.accentBorder }],
    myRankValue: [styles.myRankValue, { color: palette.accent }],
    myRankLabel: [styles.myRankLabel, { color: palette.textMuted }],
    myRankXP: [styles.myRankXP, { color: palette.xp }],
    myRankOutOf: [styles.myRankOutOf, { color: palette.textMuted }],
    listCard: [styles.listCard, { backgroundColor: palette.surface, borderColor: palette.border }],
    headerLabel: [styles.headerLabel, { color: palette.textMuted }],
    rowDivider: [styles.rowDivider, { backgroundColor: palette.divider }],
    rowMe: [styles.rowMe, { backgroundColor: palette.accentSoft, borderLeftColor: palette.accent }],
    rankNumber: [styles.rankNumber, { color: palette.textSecondary }],
    name: [styles.name, { color: palette.textPrimary }],
    youBadge: [styles.youBadge, { backgroundColor: palette.accent }],
    youBadgeText: [styles.youBadgeText, { color: palette.textOnAccent }],
    rankLine: [styles.rankLine, { color: palette.textMuted }],
    xp: [styles.xp, { color: palette.xp }],
    reactionChip: [styles.reactionChip, { borderColor: palette.border }],
    reactionChipMine: { borderColor: palette.accent, backgroundColor: palette.accentSoft },
    reactionCount: [styles.reactionCount, { color: palette.textMuted }],
    privacyNote: [styles.privacyNote, { color: palette.textMuted }],
  };
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

  // Same "medal" glyph for all three podium spots — differentiated by tint
  // (gold/silver/bronze) rather than three different icons, since Ionicons
  // has no separate 1st/2nd/3rd-place symbol.
  const medalColorFor = (index: number): string => {
    if (index === 0) return '#FFD700';
    if (index === 1) return '#C0C0C0';
    return '#CD7F32';
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
          onBack={() => safeGoBack(navigation)}
        />
        <Shimmer width="100%" height={84} style={styles.skeletonCard} />
        <View style={dynamicStyles.listCard}>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <View key={index}>
              {index > 0 && <View style={dynamicStyles.rowDivider} />}
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
        onBack={() => safeGoBack(navigation)}
      />

      {/* Your own standing is pinned to the top so it never requires scrolling
          to find — the number most people open this screen for. */}
      {myIndex >= 0 && (
        <Enter index={0}>
          <View style={dynamicStyles.myRankCard}>
            <View style={styles.myRankTopRow}>
              <View>
                <Text style={dynamicStyles.myRankValue}>#{myIndex + 1}</Text>
                <Text style={dynamicStyles.myRankLabel}>{t('yourPosition')}</Text>
              </View>
              <View style={styles.myRankRight}>
                <Text style={dynamicStyles.myRankXP}>{entries[myIndex].totalXP.toLocaleString()} XP</Text>
                <Text style={dynamicStyles.myRankOutOf}>
                  {t('outOf')} {entries.length}
                </Text>
              </View>
            </View>
          </View>
        </Enter>
      )}

      {/* One card of rows separated by hairlines, not a stack of cards: a
          ranking is a single list you read down, and the hairlines are what
          make the columns line up as columns. */}
      <Enter index={1}>
        <View style={dynamicStyles.listCard}>
          {failed ? (
            <EmptyState icon="lock-closed" title={t('leaderboard')} message={t('leaderboardUnavailable')} />
          ) : entries.length === 0 ? (
            <EmptyState icon="trophy" title={t('leaderboard')} message={t('leaderboardEmpty')} />
          ) : (
            <>
              {/* Column headers, so the trailing number is identifiably XP
                  without relying on its colour to say so. */}
              <View style={styles.headerRow}>
                <Text style={[dynamicStyles.headerLabel, styles.headerRankLabel]}>#</Text>
                <Text style={dynamicStyles.headerLabel}>XP</Text>
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
                    {index > 0 && <View style={dynamicStyles.rowDivider} />}
                    <View
                      style={[styles.row, isMe && dynamicStyles.rowMe]}
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
                        {isPodium ? (
                          <Ionicons name="medal" size={22} color={medalColorFor(index)} />
                        ) : (
                          <Text style={dynamicStyles.rankNumber}>
                            {index + 1}
                          </Text>
                        )}
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
                          <Text style={dynamicStyles.name} numberOfLines={1}>
                            {entry.displayName}
                          </Text>
                          {/* Your row is already tinted and outlined, but a tint
                              is invisible to a colourblind eye and to a
                              screenshot in bright sun — the word is what
                              actually carries it. */}
                          {isMe && (
                            <View style={dynamicStyles.youBadge}>
                              <Text style={dynamicStyles.youBadgeText}>{t('you').toUpperCase()}</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.rankLineRow}>
                          <Ionicons name={getRankIcon(entry.rank)} size={12} color={palette.textMuted} />
                          <Text style={dynamicStyles.rankLine} numberOfLines={1}>
                            {' '}{entry.rank} · {t('level')} {entry.level}
                          </Text>
                          {entry.streak > 0 && (
                            <>
                              <Text style={dynamicStyles.rankLine}> · </Text>
                              <Ionicons name="flame" size={12} color={palette.textMuted} />
                              <Text style={dynamicStyles.rankLine}> {entry.streak}</Text>
                            </>
                          )}
                        </View>
                      </View>

                      <Text style={dynamicStyles.xp}>{entry.totalXP.toLocaleString()}</Text>
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
                              style={[dynamicStyles.reactionChip, mine && dynamicStyles.reactionChipMine]}>
                              <Text style={styles.reactionEmoji}>{emoji}</Text>
                              {count > 0 && <Text style={dynamicStyles.reactionCount}>{count}</Text>}
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
        <Text style={dynamicStyles.privacyNote}>{t('leaderboardPrivacy')}</Text>
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
    // backgroundColor/borderColor are applied via dynamicStyles.myRankCard.
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    padding: spacing.lg,
  },
  myRankTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  myRankValue: {
    ...type.display,
  },
  myRankLabel: {
    ...type.label,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  myRankRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  myRankXP: {
    ...type.body,
    fontFamily: fontFamily.sansBlack,
  },
  myRankOutOf: {
    ...type.bodySm,
  },
  // One card, N rows. Horizontal padding only — each row owns its vertical
  // padding so the hairlines run the full height of the row.
  listCard: {
    // backgroundColor/borderColor are applied via dynamicStyles.listCard.
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
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
  },
  headerRankLabel: {
    width: RANK_SLOT_WIDTH,
    textAlign: 'center',
  },
  rowDivider: {
    // backgroundColor is applied via dynamicStyles.rowDivider.
    height: layout.hairline,
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
    // backgroundColor/borderLeftColor are applied via dynamicStyles.rowMe.
    borderLeftWidth: 3,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.lg - 3,
  },
  rankSlot: {
    width: RANK_SLOT_WIDTH,
    alignItems: 'center',
  },
  rankNumber: {
    ...type.body,
    fontFamily: fontFamily.sansBlack,
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
    fontFamily: fontFamily.sansBold,
    flexShrink: 1,
  },
  youBadge: {
    // backgroundColor is applied via dynamicStyles.youBadge.
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  youBadgeText: {
    ...type.label,
  },
  rankLine: {
    ...type.bodySm,
  },
  rankLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs / 2,
  },
  xp: {
    ...type.body,
    fontFamily: fontFamily.sansBlack,
  },
  // Flush with the row's own edges rather than indented to start under the
  // avatar/name — reactions belong to the whole entry, not visually nested
  // beneath the person's name specifically.
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    paddingBottom: spacing.md,
  },
  reactionChip: {
    // borderColor is applied via dynamicStyles.reactionChip.
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: layout.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  // reactionChipMine is now entirely in dynamicStyles (it was color-only).
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    ...type.label,
  },
  privacyNote: {
    ...type.bodySm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
