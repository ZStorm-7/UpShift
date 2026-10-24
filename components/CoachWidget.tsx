// Floating AI coach: a small circle in the bottom-right that opens a chat sheet.
// Mounted once inside NavigationContainer so it floats over every screen, and
// hides itself on auth, onboarding and workout screens where it would get in
// the way.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import haptics from '../services/haptics';
import {
  CoachMessage, CoachContext, FREE_DAILY_LIMIT, PREMIUM_DAILY_LIMIT,
  generate, screen, loadHistory, saveMessage, clearHistory,
  getUsedToday, setUsedToday,
} from '../services/coach';

const HIDDEN_ROUTES = new Set([
  'Welcome', 'Auth', 'Subscription', 'Onboarding', 'Workout', 'WorkoutSummary',
]);

// Chips change with the screen the user is on.
const CHIPS: Record<string, string[]> = {
  Dashboard: ['Plan my day', 'How do quests work?', 'Keep my streak alive'],
  Nutrition: ['High-protein snack ideas', 'Am I eating enough?', 'Explain macros'],
  History: ['Read my progress', 'Why did my weight change?'],
  Leaderboard: ['How do I climb ranks?', 'How is XP earned?'],
  Friends: ['Ideas for a friend challenge'],
  Challenges: ['Which challenge fits me?'],
  Settings: ['What can Shift help with?'],
};
const DEFAULT_CHIPS = ['Plan my next workout', 'Quick healthy meal idea', 'Motivate me'];

const LEGAL =
  'Shift is an AI and can make mistakes. It is not a doctor, dietitian or therapist, and nothing it says is medical advice. Check important information and consult a qualified professional before changing your exercise or diet. Use at your own risk: UpShift is not liable for decisions made from AI responses.';

export default function CoachWidget() {
  const routeName = useNavigationState(s => {
    let r: any = s?.routes?.[s.index ?? 0];
    while (r?.state) r = r.state.routes[r.state.index ?? 0];
    return r?.name as string | undefined;
  });
  const { authUser, profile } = useUser();
  const { isEntitled } = useSubscription();
  const p = usePalette();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [consented, setConsented] = useState(false);
  const [useData, setUseData] = useState(true);
  const [msgs, setMsgs] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(0);
  const [revealing, setRevealing] = useState<{ id: string; shown: number } | null>(null);
  const listRef = useRef<FlatList>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const loadedFor = useRef<string | null>(null);

  const limit = isEntitled ? PREMIUM_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const uid = authUser?.uid;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!open || !uid || loadedFor.current === uid) return;
    loadedFor.current = uid;
    loadHistory(uid).then(setMsgs).catch(() => {});
    getUsedToday(uid).then(setUsed).catch(() => {});
  }, [open, uid]);

  // Typewriter reveal for the newest coach reply.
  useEffect(() => {
    if (!revealing) return;
    const full = msgs.find(m => m.id === revealing.id)?.text ?? '';
    if (revealing.shown >= full.length) { setRevealing(null); return; }
    const t = setTimeout(
      () => setRevealing(r => (r ? { ...r, shown: Math.min(full.length, r.shown + 3) } : r)),
      16,
    );
    return () => clearTimeout(t);
  }, [revealing, msgs]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !uid) return;
    if (used >= limit) { haptics.error(); return; }
    haptics.selection();
    setInput('');
    const mk = (role: 'user' | 'coach', t: string, safety?: boolean): CoachMessage =>
      ({ id: `${Date.now()}-${role}`, role, text: t, at: Date.now(), ...(safety ? { safety } : {}) });
    const userMsg = mk('user', text);
    const next = [...msgs, userMsg];
    setMsgs(next);
    saveMessage(uid, userMsg).catch(() => {});

    const finish = (reply: CoachMessage) => {
      setMsgs(m => [...m, reply]);
      setRevealing({ id: reply.id, shown: 0 });
      saveMessage(uid, reply).catch(() => {});
    };

    const s = screen(text);
    if (s.kind !== 'ok') { finish(mk('coach', s.reply, true)); return; }

    setBusy(true);
    try {
      const ctx: CoachContext | null = useData && profile
        ? { firstName: profile.firstName, goal: profile.goal, activityLevel: profile.activityLevel,
            calorieGoal: profile.calorieGoal, screen: routeName }
        : null;
      const reply = await generate(next, ctx);
      const n = used + 1;
      setUsed(n);
      setUsedToday(uid, n).catch(() => {});
      finish(mk('coach', reply));
    } catch (e: any) {
      haptics.error();
      finish(mk('coach', e?.message === 'missing-key'
        ? 'The coach isn\'t configured yet (missing API key).'
        : 'I couldn\'t reach the coach just now. Check your connection and try again.', true));
    } finally {
      setBusy(false);
    }
  }, [busy, uid, used, limit, msgs, useData, profile, routeName]);

  if (!authUser || !routeName || HIDDEN_ROUTES.has(routeName)) return null;

  const chips = CHIPS[routeName] ?? DEFAULT_CHIPS;
  const left = Math.max(0, limit - used);

  const bubble = (m: CoachMessage) => {
    const mine = m.role === 'user';
    const text = revealing?.id === m.id ? m.text.slice(0, revealing.shown) : m.text;
    return (
      <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
        <View style={[
          styles.bubble,
          mine ? { backgroundColor: p.accent, borderBottomRightRadius: 4 }
               : { backgroundColor: p.surfaceRaised, borderBottomLeftRadius: 4,
                   borderWidth: 1, borderColor: m.safety ? p.warning : p.border },
        ]}>
          <Text style={[type.body, { color: mine ? p.textOnAccent : p.textPrimary }]} selectable>{text}</Text>
        </View>
      </View>
    );
  };

  return (
    <>
      {!open && (
        <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: insets.bottom + spacing.xl, right: spacing.lg }]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { borderColor: p.accent, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open AI coach. Ask anything about fitness, food or the app."
            onPress={() => { haptics.selection(); setOpen(true); }}
            style={({ pressed }) => [styles.fab, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={{ fontSize: 24 }}>✨</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={[styles.scrim, { backgroundColor: p.scrim }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel="Close coach" />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border, paddingBottom: insets.bottom + spacing.sm }]}>
              <View style={styles.header}>
                <View style={[styles.avatar, { backgroundColor: p.accentSoft }]}><Text style={{ fontSize: 18 }}>✨</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.heading, { color: p.textPrimary }]}>Shift · AI Coach</Text>
                  <Text style={[type.bodySm, { color: p.textMuted }]}>
                    {left} of {limit} messages left today{isEntitled ? '' : ' · Premium gets more'}
                  </Text>
                </View>
                {msgs.length > 0 && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Clear chat history" hitSlop={8}
                    onPress={() => { uid && clearHistory(uid).catch(() => {}); setMsgs([]); }}>
                    <Text style={[type.bodySm, { color: p.textMuted }]}>Clear</Text>
                  </Pressable>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => setOpen(false)} style={{ marginLeft: spacing.md }}>
                  <Text style={{ color: p.textSecondary, fontSize: 20 }}>✕</Text>
                </Pressable>
              </View>

              {!consented ? (
                <View style={styles.consent}>
                  <Text style={[type.title, { color: p.textPrimary }]}>Before we start</Text>
                  <Text style={[type.body, { color: p.textSecondary, marginTop: spacing.md }]}>{LEGAL}</Text>
                  <View style={[styles.toggle, { borderColor: p.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.heading, { color: p.textPrimary }]}>Personalize with my profile</Text>
                      <Text style={[type.bodySm, { color: p.textMuted }]}>Shares your name, goal and calorie target with Google Gemini. You can change this later.</Text>
                    </View>
                    <Switch value={useData} onValueChange={setUseData} trackColor={{ true: p.accent }} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { haptics.selection(); setConsented(true); }}
                    style={[styles.cta, { backgroundColor: p.accent }]}>
                    <Text style={[type.button, { color: p.textOnAccent }]}>I understand, let's go</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <FlatList
                    ref={listRef}
                    data={msgs}
                    keyExtractor={m => m.id}
                    renderItem={({ item }) => bubble(item)}
                    style={styles.list}
                    contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                    ListEmptyComponent={
                      <Text style={[type.body, { color: p.textSecondary }]}>
                        Hey{profile?.firstName ? ` ${profile.firstName}` : ''}! Ask me anything about training, food or UpShift.
                      </Text>
                    }
                    ListFooterComponent={busy ? (
                      <View style={styles.row}><View style={[styles.bubble, { backgroundColor: p.surfaceRaised }]}>
                        <ActivityIndicator color={p.accent} />
                      </View></View>
                    ) : null}
                  />
                  <FlatList
                    horizontal showsHorizontalScrollIndicator={false}
                    data={chips} keyExtractor={c => c}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
                    style={{ flexGrow: 0 }}
                    renderItem={({ item }) => (
                      <Pressable accessibilityRole="button" onPress={() => send(item)}
                        style={[styles.chip, { borderColor: p.accentBorder, backgroundColor: p.accentSoft }]}>
                        <Text style={[type.bodySm, { color: p.textPrimary }]}>{item}</Text>
                      </Pressable>
                    )}
                  />
                  <View style={styles.inputRow}>
                    <TextInput
                      value={input} onChangeText={setInput} placeholder={left ? 'Ask Shift anything…' : 'Daily limit reached'}
                      placeholderTextColor={p.textMuted} editable={left > 0}
                      maxLength={500} multiline onSubmitEditing={() => send(input)}
                      style={[styles.input, type.body, { color: p.textPrimary, backgroundColor: p.surfaceRaised, borderColor: p.border }]}
                    />
                    <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!input.trim() || busy || left === 0}
                      onPress={() => send(input)}
                      style={[styles.send, { backgroundColor: p.accent, opacity: !input.trim() || busy || left === 0 ? 0.4 : 1 }]}>
                      <Text style={{ color: p.textOnAccent, fontSize: 18, fontFamily: fontFamily.sansBold }}>↑</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.warn, { color: p.textMuted }]}>
                    ⚠️ AI-generated. May be inaccurate. Not medical advice. UpShift is not liable for actions taken from these answers.
                  </Text>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabWrap: { position: 'absolute', width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  scrim: { flex: 1 },
  sheet: { maxHeight: '85%', minHeight: 420, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { minHeight: 180 },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '86%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: { flex: 1, maxHeight: 100, minHeight: 44, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: 11 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  warn: { fontSize: 11, lineHeight: 15, textAlign: 'center', padding: spacing.md, fontFamily: fontFamily.sans },
  consent: { padding: spacing.lg, paddingTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg },
  cta: { marginTop: spacing.lg, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
