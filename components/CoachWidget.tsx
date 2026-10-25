// Floating AI coach: a small circle in the bottom-right that opens a chat sheet.
// Mounted once inside NavigationContainer so it floats over every screen, and
// hides itself on auth, onboarding and workout screens where it would get in
// the way.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Switch, Animated, Easing, Alert, Linking, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../context/SubscriptionContext';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import haptics from '../services/haptics';
import { scheduleStreakRiskReminder } from '../services/notifications';
import { speak, stopSpeaking, listen, canSpeak, canListen } from '../services/voice';
import {
  CoachMessage, CoachContext, CoachPrefs, DEFAULT_PREFS, TONES, FREE_DAILY_LIMIT, PREMIUM_DAILY_LIMIT,
  chat, analyzeMealPhoto, buildWeeklyPlan, streakRescueLine, setStreakRescueLine, gatherContext,
  logMealItems, savePlan, loadPrefs, savePrefs, screen, loadHistory, saveMessage, clearHistory,
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
  const [prefs, setPrefsState] = useState<CoachPrefs>(DEFAULT_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const [listening, setListening] = useState(false);
  const stopListenRef = useRef<(() => void) | null>(null);
  const { consented, useData, tone, speak: speakOn } = prefs;
  const [msgs, setMsgs] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(0);
  const [revealing, setRevealing] = useState<{ id: string; shown: number } | null>(null);
  const listRef = useRef<FlatList>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const loadedFor = useRef<string | null>(null);

  const setPrefs = (patch: Partial<CoachPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    if (uid) savePrefs(uid, next).catch(() => {});
  };

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
    loadPrefs(uid).then(setPrefsState).catch(() => {});
  }, [open, uid]);

  // Streak rescue: once per day, if a streak is at risk, write a tone-matched
  // notification line and reschedule the evening reminder with it. Only runs
  // after the user has consented to the coach sharing profile data.
  const rescueDay = useRef('');
  useEffect(() => {
    if (!uid || !profile || profile.notificationsEnabled === false) return;
    const today = new Date().toDateString();
    if (rescueDay.current === today) return;
    rescueDay.current = today;
    (async () => {
      try {
        const pr = await loadPrefs(uid);
        if (!pr.consented || !pr.useData) return;
        const ctx = await gatherContext(uid, profile);
        if (!ctx.streakAtRisk || !ctx.streak) return;
        const line = await streakRescueLine(ctx, pr.tone);
        if (!line) return;
        setStreakRescueLine(line);
        await scheduleStreakRiskReminder(true, ctx.streak, 20, line);
      } catch { /* best-effort */ }
    })();
  }, [uid, profile]);

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

  const mk = (role: 'user' | 'coach', t: string, extra: Partial<CoachMessage> = {}): CoachMessage =>
    ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${role}`, role, text: t, at: Date.now(), ...extra });

  const push = (m: CoachMessage) => {
    setMsgs(prev => [...prev, m]);
    if (uid) saveMessage(uid, m).catch(() => {});
  };

  const reply = (m: CoachMessage) => {
    push(m);
    setRevealing({ id: m.id, shown: 0 });
    if (speakOn && !m.safety) speak(m.text);
  };

  const patchMsg = (id: string, patch: Partial<CoachMessage>) => {
    setMsgs(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      if (uid) saveMessage(uid, next).catch(() => {});
      return next;
    }));
  };

  const freshCtx = async (): Promise<CoachContext | null> =>
    useData && profile && uid ? gatherContext(uid, profile, routeName) : null;

  // Runs a model call with the shared busy flag, quota and error handling.
  const run = useCallback(async (job: () => Promise<CoachMessage>) => {
    if (busy || !uid) return;
    if (used >= limit) { haptics.error(); return; }
    setBusy(true);
    try {
      const m = await job();
      const n = used + 1;
      setUsed(n);
      setUsedToday(uid, n).catch(() => {});
      reply(m);
    } catch (e: any) {
      haptics.error();
      reply(mk('coach', e?.message === 'missing-key'
        ? 'The coach isn\'t configured yet (missing API key).'
        : 'I couldn\'t do that just now. Check your connection and try again.', { safety: true }));
    } finally {
      setBusy(false);
    }
  }, [busy, uid, used, limit, speakOn, useData, profile, routeName]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !uid || used >= limit) return;
    haptics.selection();
    stopSpeaking();
    setInput('');
    const userMsg = mk('user', text);
    const next = [...msgs, userMsg];
    push(userMsg);
    const s = screen(text);
    if (s.kind !== 'ok') { reply(mk('coach', s.reply, { safety: true })); return; }
    await run(async () => {
      const r = await chat(next, await freshCtx(), tone);
      return mk('coach', r.text, { ...(r.card ? { card: r.card } : {}), ...(r.sources.length ? { sources: r.sources } : {}) });
    });
  }, [busy, uid, used, limit, msgs, tone, run]);

  // Tools. Each costs one message from the daily allowance.
  const needData = () => {
    if (useData) return false;
    reply(mk('coach', 'Turn on "Personalize with my profile" in the settings (⚙) so I can use your recent activity for this.', { safety: true }));
    return true;
  };

  const toolRecap = () => {
    if (needData()) return;
    send('Give me my weekly recap from my last 7 days: wins, one thing to improve, and one goal for next week. Under 120 words.');
  };
  const toolRecovery = () => {
    if (needData()) return;
    send('Based on my last 7 days of workouts, sleep and activity, should I train hard, go light or rest today? Give a short recovery recommendation.');
  };
  const toolForm = () => setInput('Form tips for ');
  const toolPlan = () => {
    push(mk('user', 'Build me a weekly workout plan.'));
    run(async () => {
      const r = await buildWeeklyPlan(await freshCtx(), tone, profile ? `My goal is ${profile.goal}; activity level ${profile.activityLevel}.` : '');
      return mk('coach', r.text, { card: { kind: 'plan', days: r.days } });
    });
  };
  const toolPhoto = () => {
    const pick = async (camera: boolean) => {
      try {
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true, allowsEditing: false };
        const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        const asset = res.canceled ? null : res.assets?.[0];
        if (!asset?.base64) return;
        push(mk('user', '📸 Estimate the nutrition in this meal.'));
        run(async () => {
          const r = await analyzeMealPhoto(asset.base64!, asset.mimeType || 'image/jpeg', '');
          return mk('coach', r.items.length ? `${r.text || 'Here\'s my estimate.'}\nPortions are estimates, so adjust if it looks off.` : 'I couldn\'t spot any food in that photo. Try a closer, brighter shot.',
            r.items.length ? { card: { kind: 'meal', items: r.items } } : { safety: true });
        });
      } catch { /* picker cancelled or unavailable */ }
    };
    if (Platform.OS === 'web') { pick(false); return; }
    Alert.alert('Meal photo', 'Photos are sent to Google Gemini for analysis.', [
      { text: 'Camera', onPress: () => pick(true) },
      { text: 'Photo library', onPress: () => pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleMic = async () => {
    if (listening) { stopListenRef.current?.(); return; }
    stopSpeaking();
    const stop = await listen(setInput, final => {
      setListening(false);
      stopListenRef.current = null;
      if (final.trim()) send(final);
    });
    if (!stop) { haptics.error(); return; }
    stopListenRef.current = stop;
    setListening(true);
    haptics.selection();
  };

  const logMeal = async (m: CoachMessage) => {
    if (!uid || m.card?.kind !== 'meal' || m.card.logged) return;
    try {
      await logMealItems(uid, m.card.items);
      haptics.setComplete();
      patchMsg(m.id, { card: { ...m.card, logged: true } });
    } catch { haptics.error(); }
  };

  const savePlanCard = async (m: CoachMessage) => {
    if (!uid || m.card?.kind !== 'plan' || m.card.saved) return;
    try {
      await savePlan(uid, m.card.days);
      haptics.setComplete();
      patchMsg(m.id, { card: { ...m.card, saved: true } });
    } catch { haptics.error(); }
  };

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
          {m.card?.kind === 'meal' && !revealing && (
            <View style={[styles.card, { borderColor: p.border, backgroundColor: p.surface }]}>
              {m.card.items.map((it, i) => (
                <Text key={i} style={[type.bodySm, { color: p.textPrimary }]}>
                  {it.name}: {it.calories} kcal · P{it.protein} C{it.carbs} F{it.fat}
                </Text>
              ))}
              <Pressable accessibilityRole="button" disabled={m.card.logged} onPress={() => logMeal(m)}
                style={[styles.cardBtn, { backgroundColor: m.card.logged ? p.successSoft : p.accent }]}>
                <Text style={[type.button, { color: m.card.logged ? p.success : p.textOnAccent }]}>
                  {m.card.logged ? '✓ Logged to today' : 'Log to today'}
                </Text>
              </Pressable>
            </View>
          )}
          {m.card?.kind === 'plan' && !revealing && (
            <View style={[styles.card, { borderColor: p.border, backgroundColor: p.surface }]}>
              {m.card.days.map((d, i) => (
                <Text key={i} style={[type.bodySm, { color: p.textPrimary }]}>
                  {d.day.slice(0, 3)}: {d.rest ? 'Rest' : `${d.focus} (${d.exercises.length} exercises)`}
                </Text>
              ))}
              <Pressable accessibilityRole="button" disabled={m.card.saved} onPress={() => savePlanCard(m)}
                style={[styles.cardBtn, { backgroundColor: m.card.saved ? p.successSoft : p.accent }]}>
                <Text style={[type.button, { color: m.card.saved ? p.success : p.textOnAccent }]}>
                  {m.card.saved ? '✓ Saved to Workout' : 'Save to Workout'}
                </Text>
              </Pressable>
            </View>
          )}
          {!!m.sources?.length && !revealing && (
            <View style={styles.sources}>
              <Text style={[type.label, { color: p.textMuted }]}>SOURCES</Text>
              {m.sources.map(src => (
                <Pressable key={src.uri} accessibilityRole="link" onPress={() => Linking.openURL(src.uri)}>
                  <Text style={[type.bodySm, { color: p.info, textDecorationLine: 'underline' }]} numberOfLines={1}>{src.title}</Text>
                </Pressable>
              ))}
            </View>
          )}
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
                <Pressable accessibilityRole="button" accessibilityLabel="Coach settings" hitSlop={8} onPress={() => setShowSettings(v => !v)}>
                  <Text style={{ color: p.textSecondary, fontSize: 18 }}>⚙</Text>
                </Pressable>
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
                    <Switch value={useData} onValueChange={v => setPrefsState(x => ({ ...x, useData: v }))} trackColor={{ true: p.accent }} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { haptics.selection(); setPrefs({ consented: true }); }}
                    style={[styles.cta, { backgroundColor: p.accent }]}>
                    <Text style={[type.button, { color: p.textOnAccent }]}>I understand, let's go</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {showSettings && (
                    <View style={[styles.settings, { borderColor: p.border }]}>
                      <Text style={[type.label, { color: p.textMuted }]}>COACH STYLE</Text>
                      <View style={styles.toneRow}>
                        {TONES.map(t => (
                          <Pressable key={t.id} accessibilityRole="button" accessibilityState={{ selected: tone === t.id }}
                            onPress={() => { haptics.selection(); setPrefs({ tone: t.id }); }}
                            style={[styles.chip, { borderColor: tone === t.id ? p.accent : p.border, backgroundColor: tone === t.id ? p.accentSoft : 'transparent' }]}>
                            <Text style={[type.bodySm, { color: p.textPrimary }]}>{t.emoji} {t.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.setRow}>
                        <Text style={[type.bodySm, { color: p.textPrimary, flex: 1 }]}>Personalize with my profile and last 7 days</Text>
                        <Switch value={useData} onValueChange={v => setPrefs({ useData: v })} trackColor={{ true: p.accent }} />
                      </View>
                      {canSpeak() && (
                        <View style={styles.setRow}>
                          <Text style={[type.bodySm, { color: p.textPrimary, flex: 1 }]}>Read replies aloud</Text>
                          <Switch value={speakOn} onValueChange={v => { if (!v) stopSpeaking(); setPrefs({ speak: v }); }} trackColor={{ true: p.accent }} />
                        </View>
                      )}
                    </View>
                  )}
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}>
                    {[
                      ['📸 Meal photo', toolPhoto], ['📅 Weekly plan', toolPlan], ['📊 Weekly recap', toolRecap],
                      ['🏋️ Form tips', toolForm], ['😴 Recovery', toolRecovery],
                    ].map(([label, fn]) => (
                      <Pressable key={label as string} accessibilityRole="button" disabled={busy || left === 0}
                        onPress={fn as () => void}
                        style={[styles.chip, { borderColor: p.border, backgroundColor: p.surfaceRaised, opacity: busy || left === 0 ? 0.5 : 1 }]}>
                        <Text style={[type.bodySm, { color: p.textPrimary }]}>{label as string}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
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
                    {canListen() && (
                      <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Speak your question'}
                        onPress={toggleMic}
                        style={[styles.send, { backgroundColor: listening ? p.danger : p.surfaceRaised, borderWidth: 1, borderColor: p.border }]}>
                        <Text style={{ fontSize: 18 }}>{listening ? '■' : '🎤'}</Text>
                      </Pressable>
                    )}
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
  card: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  cardBtn: { marginTop: spacing.sm, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sources: { marginTop: spacing.sm, gap: 2 },
  settings: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  toneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
