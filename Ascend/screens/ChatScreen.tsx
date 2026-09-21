import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { Screen, AppBar, Field } from '../components/ui';
import haptics from '../services/haptics';
import { useUser } from '../context/UserContext';
import { confirmAsync } from '../utils/confirm';
import { LeaderboardEntry } from '../firebase/leaderboard';
import {
  Message,
  Conversation,
  subscribeToMessages,
  subscribeToConversation,
  sendMessage,
  markConversationRead,
  deleteMessage,
  blockUser,
  reportUser,
  isBlocked,
} from '../firebase/messages';
import { safeGoBack } from '../utils/nav';

const REPORT_REASONS = ['Spam', 'Harassment', 'Inappropriate content', 'Other'];

export default function ChatScreen({ navigation, route }: any) {
  const palette = usePalette();
  const { authUser } = useUser();
  const { conversationId, peerUid, peer } = route.params as {
    conversationId: string;
    peerUid: string;
    peer: LeaderboardEntry | null;
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(conversationId, msgs => {
      setMessages(msgs);
      // New messages arrive at the bottom — follow them the way any chat
      // app does, rather than leaving the reader scrolled up on old history.
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    return unsubscribe;
  }, [conversationId]);

  useEffect(() => {
    const unsubscribe = subscribeToConversation(conversationId, setConversation);
    return unsubscribe;
  }, [conversationId]);

  // Whether THIS account already blocked the peer, checked once on open —
  // there's no live listener for it since it only ever changes from this
  // same screen's own Block action, which already updates `blocked` locally.
  useEffect(() => {
    if (!authUser) return;
    isBlocked(authUser.uid, peerUid).then(setBlocked).catch(() => {});
  }, [authUser?.uid, peerUid]);

  // Marks the thread read the moment it's open, and again any time a new
  // message streams in while it's still open — otherwise a message that
  // arrives while you're already looking at the screen would sit "unread"
  // until you left and came back.
  useEffect(() => {
    if (!authUser) return;
    markConversationRead(conversationId, authUser.uid).catch(() => {});
  }, [conversationId, authUser?.uid, messages.length]);

  const handleSend = useCallback(async () => {
    if (!authUser || !draft.trim() || sending) return;
    setSending(true);
    const text = draft;
    setDraft('');
    try {
      await sendMessage(conversationId, authUser.uid, text);
      haptics.selection();
    } catch {
      // Most likely cause: the recipient has blocked this account, which
      // firestore.rules refuses server-side (see the rules file's comment on
      // the messages collection). There's no way to distinguish "blocked"
      // from "offline" from the client's error alone, so the message is
      // honest about that rather than guessing.
      haptics.error();
      setDraft(text);
      Alert.alert('Message not sent', "This couldn't be delivered. You may no longer be able to message this person.");
    } finally {
      setSending(false);
    }
  }, [authUser, draft, sending, conversationId]);

  const handleDeleteMessage = useCallback(
    async (message: Message) => {
      if (!authUser || message.senderId !== authUser.uid || message.deleted) return;
      const confirmed = await confirmAsync({
        title: 'Delete message?',
        message: 'This will remove the message for both of you.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteMessage(conversationId, message.id);
        haptics.selection();
      } catch {
        haptics.error();
      }
    },
    [authUser, conversationId]
  );

  const handleBlock = useCallback(async () => {
    if (!authUser) return;
    const confirmed = await confirmAsync({
      title: `Block ${peer?.displayName ?? 'this person'}?`,
      message: 'They will no longer be able to send you messages.',
      confirmLabel: 'Block',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await blockUser(authUser.uid, peerUid);
      setBlocked(true);
      haptics.setComplete();
      safeGoBack(navigation, 'Messages');
    } catch {
      haptics.error();
    }
  }, [authUser, peerUid, peer, navigation]);

  const handleReport = useCallback(() => {
    if (!authUser) return;
    Alert.alert(
      'Report user',
      'Why are you reporting this person?',
      [
        ...REPORT_REASONS.map(reason => ({
          text: reason,
          onPress: async () => {
            try {
              await reportUser(authUser.uid, peerUid, reason);
              haptics.setComplete();
              Alert.alert('Report sent', 'Thanks — our team will take a look.');
            } catch {
              haptics.error();
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true }
    );
  }, [authUser, peerUid]);

  const openMenu = useCallback(() => {
    Alert.alert(
      peer?.displayName ?? 'Options',
      undefined,
      [
        { text: 'Report', onPress: handleReport },
        { text: 'Block', style: 'destructive', onPress: handleBlock },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [peer, handleReport, handleBlock]);

  const myUid = authUser?.uid ?? '';
  const peerReadAt = conversation?.lastReadAt?.[peerUid];

  const renderMessage = ({ item }: { item: Message }) => {
    const mine = item.senderId === myUid;
    const isRead = mine && !!item.createdAt && !!peerReadAt && peerReadAt.toMillis() >= item.createdAt.toMillis();
    return (
      <Pressable
        onLongPress={() => mine && handleDeleteMessage(item)}
        disabled={!mine || item.deleted}
        accessibilityRole={mine && !item.deleted ? 'button' : undefined}
        accessibilityLabel={item.deleted ? 'Message deleted' : item.text}
        accessibilityHint={mine && !item.deleted ? 'Long press to delete' : undefined}
        style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: palette.accent, borderColor: palette.accent }
              : { backgroundColor: palette.surface, borderColor: palette.border },
          ]}>
          <Text
            style={[
              styles.bubbleText,
              { color: mine ? palette.textOnAccent : palette.textPrimary },
              item.deleted && styles.bubbleTextDeleted,
            ]}>
            {item.deleted ? 'Message deleted' : item.text}
          </Text>
        </View>
        {mine && !item.deleted && (
          <Text style={[styles.readLabel, { color: palette.textMuted }]}>{isRead ? 'Read' : 'Sent'}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <Screen>
      <AppBar
        title={peer?.displayName ?? 'Chat'}
        onBack={() => safeGoBack(navigation, 'Messages')}
        right={
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Conversation options"
            onPress={openMenu}>
            <Ionicons name="ellipsis-horizontal" size={22} color={palette.textPrimary} />
          </Pressable>
        }
      />

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <Field
            value={draft}
            onChangeText={setDraft}
            placeholder={blocked ? "You've blocked this person" : 'Message...'}
            style={styles.inputField}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim() || sending || blocked}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !draft.trim() || sending || blocked }}
            style={[
              styles.sendButton,
              { backgroundColor: palette.accent },
              (!draft.trim() || sending || blocked) && styles.sendButtonDisabled,
            ]}>
            <Ionicons name="arrow-up" size={20} color={palette.textOnAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    // No horizontal padding here — Screen (non-scroll) already applies
    // layout.screenPadding to this whole view; adding it again here would
    // double the gutter on both the message list and the input row below.
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  bubbleRow: {
    maxWidth: '78%',
    gap: 2,
  },
  bubbleRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  bubbleRowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderWidth: layout.hairline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    ...type.body,
  },
  bubbleTextDeleted: {
    fontStyle: 'italic',
  },
  readLabel: {
    ...type.bodySm,
    fontSize: 11,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  inputField: {
    flex: 1,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
