import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Share, AccessibilityInfo, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Card, SectionTitle, Button, Field, EmptyState, Divider } from '../components/ui';
import { Shimmer } from '../components/anim';
import { Enter } from '../components/dashboard';
import Avatar from '../components/Avatar';
import haptics from '../services/haptics';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { LeaderboardEntry, parseDisplayName } from '../firebase/leaderboard';
import {
  FriendRequest,
  getOrCreateFriendCode,
  sendFriendRequest,
  getIncomingRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  syncAcceptedRequests,
  getFriends,
  removeFriend,
} from '../firebase/friends';
import { createChallenge, hasActiveChallengeWith } from '../firebase/challenges';
import { getOrCreateConversation } from '../firebase/messages';
import { safeGoBack } from '../utils/nav';

const AVATAR_SIZE = 44;

export default function FriendsScreen({ navigation }: any) {
  const palette = usePalette();
  const { authUser, profile } = useUser();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [friendCode, setFriendCode] = useState('');
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<LeaderboardEntry[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authUser) return;
    try {
      await syncAcceptedRequests(authUser.uid);
      const [code, requests, friendList] = await Promise.all([
        getOrCreateFriendCode(authUser.uid),
        getIncomingRequests(authUser.uid),
        getFriends(authUser.uid),
      ]);
      setFriendCode(code);
      setIncoming(requests);
      setFriends(friendList);
    } catch {
      // Offline or a transient read failure — the screen just stays on its
      // last-known (or skeleton) state rather than showing a hard error for
      // what's a secondary, non-blocking feature.
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    load();
  }, [load]);

  const shareCode = async () => {
    if (!friendCode) return;
    haptics.selection();
    try {
      await Share.share({
        message: `Add me on UpShift! My friend code is ${friendCode}.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  const handleSendRequest = async () => {
    if (!authUser || !profile || !codeInput.trim() || sending) return;
    setSending(true);
    setStatus('');
    try {
      const displayName = `${profile.firstName} ${profile.lastInitial}.`;
      const result = await sendFriendRequest(authUser.uid, displayName, profile.avatarColor, codeInput);
      // Built and announced as a local value, not read back from `status`
      // state — a state setter's effect isn't visible until the next
      // render, so announcing `status` here would always speak the PREVIOUS
      // message instead of the one just set.
      let message: string;
      if (result === 'sent') {
        haptics.setComplete();
        message = t('friendRequestSent');
        setCodeInput('');
      } else if (result === 'invalid_code') {
        haptics.error();
        message = t('friendCodeInvalid');
      } else if (result === 'self') {
        haptics.error();
        message = t('friendCodeSelf');
      } else if (result === 'already_pending') {
        haptics.error();
        message = t('friendRequestAlreadyPending');
      } else {
        haptics.error();
        message = t('friendAlreadyAdded');
      }
      setStatus(message);
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      haptics.error();
      setStatus(t('errorSaveFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (request: FriendRequest) => {
    setBusyUid(request.fromUid);
    try {
      await acceptFriendRequest(request);
      haptics.setComplete();
      await load();
    } catch {
      haptics.error();
    } finally {
      setBusyUid(null);
    }
  };

  const handleReject = async (request: FriendRequest) => {
    setBusyUid(request.fromUid);
    try {
      await rejectFriendRequest(request.id);
      haptics.selection();
      await load();
    } catch {
      haptics.error();
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async (friendUid: string) => {
    if (!authUser) return;
    setBusyUid(friendUid);
    try {
      await removeFriend(authUser.uid, friendUid);
      haptics.selection();
      await load();
    } catch {
      haptics.error();
    } finally {
      setBusyUid(null);
    }
  };

  const handleMessage = async (friend: LeaderboardEntry) => {
    if (!authUser) return;
    setBusyUid(friend.uid);
    try {
      const conversationId = await getOrCreateConversation(authUser.uid, friend.uid);
      haptics.selection();
      navigation.navigate('Chat', { conversationId, peerUid: friend.uid, peer: friend });
    } catch {
      haptics.error();
    } finally {
      setBusyUid(null);
    }
  };

  const handleChallenge = async (friend: LeaderboardEntry) => {
    if (!authUser) return;
    setBusyUid(friend.uid);
    try {
      // Without this check, tapping Challenge twice on the same friend (an
      // easy double-tap, or just forgetting one's already running) silently
      // created a second, indistinguishable challenge document instead of
      // either reusing or blocking it.
      if (await hasActiveChallengeWith(authUser.uid, friend.uid)) {
        haptics.selection();
        AccessibilityInfo.announceForAccessibility(t('challengeAlreadyActive'));
        navigation.navigate('Challenges');
        return;
      }
      await createChallenge(authUser.uid, friend.uid, t('challengeWorkoutsGoal'));
      haptics.setComplete();
      AccessibilityInfo.announceForAccessibility(t('challengeSent'));
      navigation.navigate('Challenges');
    } catch {
      haptics.error();
    } finally {
      setBusyUid(null);
    }
  };

  if (loading) {
    return (
      <Screen scroll>
        <AppBar title={t('friendsTitle')} onBack={() => safeGoBack(navigation)} />
        <View style={styles.skeletonStack}>
          <Shimmer width="100%" height={96} style={styles.skeletonCard} />
          <Shimmer width="100%" height={80} style={styles.skeletonCard} />
          <Shimmer width="100%" height={140} style={styles.skeletonCard} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppBar
        title={t('friendsTitle')}
        onBack={() => safeGoBack(navigation)}
        right={
          <View style={styles.headerActions}>
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Messages"
              onPress={() => navigation.navigate('Messages')}>
              <Ionicons name="chatbubbles" size={20} color={palette.textPrimary} />
            </Pressable>
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('challengesTitle')}
              onPress={() => navigation.navigate('Challenges')}>
              <Ionicons name="flag" size={20} color={palette.textPrimary} />
            </Pressable>
          </View>
        }
      />

      <Enter index={0}>
        <SectionTitle>{t('yourFriendCode')}</SectionTitle>
        <Card style={styles.codeCard}>
          <Text style={[styles.codeText, { color: palette.accent }]}>{friendCode}</Text>
          <Text style={[styles.codeHint, { color: palette.textMuted }]}>{t('friendCodeHint')}</Text>
          <Button label={t('shareCode')} onPress={shareCode} variant="secondary" style={styles.shareButton} />
        </Card>
      </Enter>

      <Enter index={1}>
        <SectionTitle>{t('addFriend')}</SectionTitle>
        <Card>
          <View style={styles.addRow}>
            <Field
              value={codeInput}
              onChangeText={(v) => setCodeInput(v.toUpperCase())}
              placeholder={t('enterFriendCode')}
              autoCapitalize="none"
              maxLength={6}
              style={styles.addField}
              accessibilityLabel={t('enterFriendCode')}
            />
            <Button
              label={sending ? t('sending') : t('send')}
              onPress={handleSendRequest}
              disabled={!codeInput.trim() || sending}
              size="sm"
            />
          </View>
          {!!status && <Text style={[styles.statusText, { color: palette.textSecondary }]}>{status}</Text>}
        </Card>
      </Enter>

      {incoming.length > 0 && (
        <Enter index={2}>
          <SectionTitle>{t('friendRequests')}</SectionTitle>
          <Card style={styles.rowCard}>
            {incoming.map((request, i) => (
              <View key={request.id}>
                {i > 0 && <Divider style={styles.tightDivider} />}
                <View style={styles.requestRow}>
                  <Text style={[styles.requestName, { color: palette.textPrimary }]} numberOfLines={1}>
                    {request.fromDisplayName}
                  </Text>
                  {busyUid === request.fromUid ? (
                    <ActivityIndicator color={palette.accent} />
                  ) : (
                    <View style={styles.requestActions}>
                      <Button label={t('decline')} onPress={() => handleReject(request)} variant="ghost" size="sm" />
                      <Button label={t('accept')} onPress={() => handleAccept(request)} size="sm" />
                    </View>
                  )}
                </View>
              </View>
            ))}
          </Card>
        </Enter>
      )}

      <Enter index={3}>
        <SectionTitle right={<Text style={[styles.friendCount, { color: palette.textMuted }]}>{friends.length}</Text>}>
          {t('yourFriends')}
        </SectionTitle>
        {friends.length === 0 ? (
          <EmptyState icon="people" title={t('noFriendsYet')} message={t('noFriendsYetHint')} />
        ) : (
          <Card style={styles.rowCard}>
            {friends.map((friend, i) => {
              const { firstName, lastInitial } = parseDisplayName(friend.displayName);
              return (
              <View key={friend.uid}>
                {i > 0 && <Divider style={styles.tightDivider} />}
                <View style={styles.friendRow}>
                  <Avatar
                    photoUrl={friend.avatar}
                    color={friend.avatarColor}
                    uid={friend.uid}
                    firstName={firstName}
                    lastInitial={lastInitial}
                    size={AVATAR_SIZE}
                  />
                  <View style={styles.friendInfo}>
                    <Text style={[styles.friendName, { color: palette.textPrimary }]} numberOfLines={1}>
                      {friend.displayName}
                    </Text>
                    <View style={styles.friendMetaRow}>
                      <Text style={[styles.friendMeta, { color: palette.textMuted }]}>
                        {t('level')} {friend.level} ·
                      </Text>
                      <Ionicons name="flame" size={13} color={palette.textMuted} />
                      <Text style={[styles.friendMeta, { color: palette.textMuted }]}>{friend.streak}</Text>
                    </View>
                  </View>
                  {busyUid === friend.uid ? (
                    <ActivityIndicator color={palette.accent} />
                  ) : (
                    <View style={styles.friendActions}>
                      <Button label="Message" onPress={() => handleMessage(friend)} variant="secondary" size="sm" />
                      <Button label={t('challengeAction')} onPress={() => handleChallenge(friend)} variant="secondary" size="sm" />
                      <Button label={t('remove')} onPress={() => handleRemove(friend.uid)} variant="ghost" size="sm" />
                    </View>
                  )}
                </View>
              </View>
              );
            })}
          </Card>
        )}
      </Enter>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonStack: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  skeletonCard: {
    borderRadius: radius.lg,
  },
  codeCard: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  codeText: {
    ...type.display,
    letterSpacing: 4,
    fontFamily: fontFamily.sansBlack,
  },
  codeHint: {
    ...type.bodySm,
    textAlign: 'center',
  },
  shareButton: {
    marginTop: spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  addField: {
    flex: 1,
  },
  statusText: {
    ...type.bodySm,
    marginTop: spacing.sm,
  },
  rowCard: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 0,
  },
  tightDivider: {
    marginVertical: 0,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  requestName: {
    ...type.body,
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  friendCount: {
    ...type.label,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    ...type.body,
    fontFamily: fontFamily.sansSemi,
  },
  friendMeta: {
    ...type.bodySm,
  },
  friendMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  friendActions: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
});
