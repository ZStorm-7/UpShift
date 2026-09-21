import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getDoc } from 'firebase/firestore';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, EmptyState, Divider } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import Avatar from '../components/Avatar';
import haptics from '../services/haptics';
import { useUser } from '../context/UserContext';
import { leaderboardDocRef, LeaderboardEntry, parseDisplayName } from '../firebase/leaderboard';
import { Conversation, subscribeToConversations, otherParticipant, hasUnread } from '../firebase/messages';
import { safeGoBack } from '../utils/nav';

const AVATAR_SIZE = 44;

type Row = { conversation: Conversation; otherUid: string; peer: LeaderboardEntry | null };

export default function MessagesScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  // Peer display info (name/avatar) is looked up once per uid and cached
  // across snapshots — it changes rarely enough that re-fetching it on every
  // message is wasted reads, and the conversation doc itself never carries
  // it (see firebase/messages.ts's comment on why the leaderboard is the
  // one shared place a friend's display info lives).
  const peerCache = useState(() => new Map<string, LeaderboardEntry | null>())[0];

  const resolvePeer = useCallback(async (uid: string): Promise<LeaderboardEntry | null> => {
    if (peerCache.has(uid)) return peerCache.get(uid)!;
    const snap = await getDoc(leaderboardDocRef(uid));
    const entry = snap.exists() ? (snap.data() as LeaderboardEntry) : null;
    peerCache.set(uid, entry);
    return entry;
  }, [peerCache]);

  useEffect(() => {
    if (!authUser) return;
    const unsubscribe = subscribeToConversations(authUser.uid, async conversations => {
      const withPeers = await Promise.all(
        conversations.map(async conversation => {
          const otherUid = otherParticipant(conversation, authUser.uid);
          const peer = await resolvePeer(otherUid);
          return { conversation, otherUid, peer };
        })
      );
      setRows(withPeers);
      setLoading(false);
    });
    return unsubscribe;
  }, [authUser?.uid, resolvePeer]);

  const openChat = (row: Row) => {
    haptics.selection();
    navigation.navigate('Chat', { conversationId: row.conversation.id, peerUid: row.otherUid, peer: row.peer });
  };

  if (loading) {
    return (
      <Screen scroll>
        <AppBar title="Messages" onBack={() => safeGoBack(navigation)} />
        <View style={styles.skeletonStack}>
          <Shimmer width="100%" height={76} style={styles.skeletonCard} />
          <Shimmer width="100%" height={76} style={styles.skeletonCard} />
          <Shimmer width="100%" height={76} style={styles.skeletonCard} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppBar title="Messages" onBack={() => safeGoBack(navigation)} />

      {rows.length === 0 ? (
        <EmptyState
          icon="chatbubbles"
          title="No conversations yet"
          message="Message a friend from the Friends screen to start one."
        />
      ) : (
        <Enter index={0}>
          <Card style={styles.rowCard}>
            {rows.map((row, i) => {
              const { firstName, lastInitial } = row.peer
                ? parseDisplayName(row.peer.displayName)
                : { firstName: 'Friend', lastInitial: '' };
              const unread = authUser ? hasUnread(row.conversation, authUser.uid) : false;
              const preview = row.conversation.lastMessage || 'Say hi!';
              return (
                <View key={row.conversation.id}>
                  {i > 0 && <Divider style={styles.tightDivider} />}
                  <Card
                    onPress={() => openChat(row)}
                    accessibilityLabel={`Conversation with ${row.peer?.displayName ?? 'friend'}${unread ? ', unread' : ''}`}
                    style={styles.rowInner}>
                    <View style={styles.row}>
                      <Avatar
                        photoUrl={row.peer?.avatar}
                        color={row.peer?.avatarColor}
                        uid={row.otherUid}
                        firstName={firstName}
                        lastInitial={lastInitial}
                        size={AVATAR_SIZE}
                      />
                      <View style={styles.info}>
                        <Text style={[styles.name, { color: palette.textPrimary }]} numberOfLines={1}>
                          {row.peer?.displayName ?? 'Friend'}
                        </Text>
                        <Text
                          style={[styles.preview, { color: unread ? palette.textPrimary : palette.textMuted }]}
                          numberOfLines={1}>
                          {preview}
                        </Text>
                      </View>
                      {unread && <View style={[styles.unreadDot, { backgroundColor: palette.accent }]} />}
                    </View>
                  </Card>
                </View>
              );
            })}
          </Card>
        </Enter>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeletonStack: {
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  rowCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  rowInner: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: layout.screenPadding,
  },
  tightDivider: {
    marginVertical: 0,
    marginHorizontal: layout.screenPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...type.body,
    fontFamily: fontFamily.sansSemi,
  },
  preview: {
    ...type.bodySm,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
