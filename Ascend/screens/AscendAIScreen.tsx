// AscendAIScreen — placeholder chat surface for "Ascend AI".
//
// PLACEHOLDER: no model is connected. Sending a message appends a canned
// reply saying so, rather than pretending to answer — an assistant that
// invents fitness or nutrition advice from a stub would be worse than one
// that plainly says it isn't wired up yet.
//
// The disclaimer under the composer ("Ascend AI can make mistakes…") is
// deliberately permanent, not dismissible: once a real model IS connected,
// that line is the thing standing between a confident-sounding wrong answer
// about someone's health and a user who assumes the app verified it.

import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radius, layout } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { usePalette } from '../theme/themedColors';
import { Screen, AppBar } from '../components/ui';
import { useUser } from '../context/UserContext';
import haptics from '../services/haptics';
import { safeGoBack } from '../utils/nav';

type Message = { id: number; role: 'user' | 'ai'; text: string };

const PLACEHOLDER_REPLY =
  "I'm not connected to a model yet — this is a placeholder. Once Ascend AI is wired up, I'll be able to answer questions about your workouts, nutrition, and progress.";

export default function AscendAIScreen({ navigation }: any) {
  const palette = usePalette();
  const { profile } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const nextId = useRef(1);
  const scrollRef = useRef<ScrollView>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    haptics.selection();
    setMessages(prev => [
      ...prev,
      { id: nextId.current++, role: 'user', text },
      { id: nextId.current++, role: 'ai', text: PLACEHOLDER_REPLY },
    ]);
    setInput('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <Screen style={{ backgroundColor: palette.bg }}>
      <AppBar title="Ascend AI" onBack={() => safeGoBack(navigation)} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="sparkles" size={32} color={palette.accent} style={styles.emptyIcon} />
              <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                Hi{profile?.firstName ? `, ${profile.firstName}` : ''} — I'm Ascend AI
              </Text>
              <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>
                Ask me about your workouts, meals, or progress. I'm still a
                placeholder for now, so I can't answer properly yet.
              </Text>
            </View>
          ) : (
            messages.map(m => (
              <View
                key={m.id}
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? { alignSelf: 'flex-end', backgroundColor: palette.accent }
                    : { alignSelf: 'flex-start', backgroundColor: palette.surface, borderWidth: layout.hairline, borderColor: palette.border },
                ]}>
                <Text
                  style={[
                    styles.bubbleText,
                    { color: m.role === 'user' ? palette.textOnAccent : palette.textPrimary },
                  ]}>
                  {m.text}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.composerWrap, { borderTopColor: palette.divider, backgroundColor: palette.bg }]}>
          <View style={[styles.composer, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <TextInput
              style={[styles.input, { color: palette.textPrimary }]}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Ascend AI…"
              placeholderTextColor={palette.textMuted}
              multiline
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable
              onPress={send}
              disabled={!input.trim()}
              style={[
                styles.sendButton,
                { backgroundColor: input.trim() ? palette.accent : palette.surfaceSunken },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send">
              <Ionicons name="arrow-up" size={18} color={input.trim() ? palette.textOnAccent : palette.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.disclaimer, { color: palette.textMuted }]}>
            Ascend AI can make mistakes. Double-check anything important, and
            don't rely on it for medical advice.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyIcon: { marginBottom: spacing.xs },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: 20, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  bubbleText: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  composerWrap: {
    borderTopWidth: layout.hairline,
    padding: spacing.md, gap: spacing.xs,
  },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    borderRadius: radius.lg, borderWidth: layout.hairline,
    paddingLeft: spacing.md, paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1, fontFamily: fontFamily.sans, fontSize: 15,
    maxHeight: 120, paddingVertical: spacing.sm,
  },
  sendButton: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  disclaimer: {
    fontFamily: fontFamily.sans, fontSize: 11,
    textAlign: 'center', lineHeight: 15,
    paddingHorizontal: spacing.md,
  },
});
