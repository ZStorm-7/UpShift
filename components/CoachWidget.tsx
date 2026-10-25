// Floating AI coach: a small circle in the bottom-right that opens a chat sheet.
// Mounted once inside NavigationContainer so it floats over every screen, and
// hides itself on auth, onboarding and workout screens where it would get in
// the way. All model calls go through the secured Cloud Function (see
// services/coach.ts); this file is UI and orchestration only.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, FlatList, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Switch, Animated, Easing, Alert, Linking, ScrollView, Share,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import haptics from '../services/haptics';
import { scheduleStreakRiskReminder } from '../services/notifications';
import { speak, stopSpeaking, listen, canSpeak, canListen } from '../services/voice';
import { buildGroceryList, groceryToText } from '../services/grocery';
import { tipForDay } from '../data/coachTips';
import { getFriends } from '../firebase/friends';
import { createChallenge, hasActiveChallengeWith } from '../firebase/challenges';
import {
  CoachMessage, CoachPrefs, DEFAULT_PREFS, TONES, Usage, CoachError, COACH_CONSENT_VERSION, hasConsent,
  sendChat, analyzeMealPhoto, requestWorkoutPlan, requestMealPlan, requestChallenges, requestRescueLine,
  fetchUsage, getStreakStatus, setStreakRescueLine, logMealItems, savePlan, saveMealPlan,
  loadPrefs, savePrefs, loadHistory, saveMessage, clearHistory, loadTodayCheckin, saveCheckin, sendFeedback,
} from '../services/coach';

const HIDDEN_ROUTES = new Set(['Welcome', 'Auth', 'Subscription', 'Onboarding', 'Workout', 'WorkoutSummary']);

// Quick-reply chips change with the screen (values are translation keys).
const CHIPS: Record<string, string[]> = {
  Dashboard: ['coachChipPlanDay', 'coachChipQuests', 'coachChipStreak'],
  Nutrition: ['coachChipSnack', 'coachChipEnough', 'coachChipMacros'],
  History: ['coachChipProgress', 'coachChipWeight'],
  Leaderboard: ['coachChipRanks', 'coachChipXP'],
  Friends: ['coachChipFriendChallenge'],
  Challenges: ['coachChipWhichChallenge'],
  Settings: ['coachChipWhatCanYouDo'],
};
const DEFAULT_CHIPS = ['coachChipNextWorkout', 'coachChipMeal', 'coachChipMotivate'];
const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const REASONS: [string, string][] = [
  ['inaccurate', 'coachReasonInaccurate'], ['unsafe', 'coachReasonUnsafe'],
  ['unhelpful', 'coachReasonUnhelpful'], ['other', 'coachReasonOther'],
];

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

function timeLeft(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default function CoachWidget() {
  const routeName = useNavigationState(s => {
    let r: any = s?.routes?.[s.index ?? 0];
    while (r?.state) r = r.state.routes[r.state.index ?? 0];
    return r?.name as string | undefined;
  });
  const { authUser, profile } = useUser();
  const { t, language } = useLanguage();
  const p = usePalette();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [prefs, setPrefsState] = useState<CoachPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [allergyText, setAllergyText] = useState('');
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemText, setProblemText] = useState('');
  const [listening, setListening] = useState(false);
  const [msgs, setMsgs] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState<{ id: string; shown: number } | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [checkin, setCheckin] = useState<'unknown' | 'needed' | 'done'>('unknown');
  const [mood, setMood] = useState(0);
  const [soreness, setSoreness] = useState(-1);
  const stopListenRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const loadedFor = useRef<string | null>(null);

  const uid = authUser?.uid;
  const { consented, useData, tone, speak: speakOn } = prefs;
  const agreed = hasConsent(prefs);

  const setPrefs = (patch: Partial<CoachPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    if (uid) savePrefs(uid, next).catch(() => {});
  };

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Load history, prefs, usage and today's check-in the first time it opens.
  useEffect(() => {
    if (!open || !uid || loadedFor.current === uid) return;
    loadedFor.current = uid;
    loadHistory(uid).then(setMsgs).catch(() => {});
    loadPrefs(uid).then(pr => { setPrefsState(pr); setAllergyText(pr.allergies.join(', ')); }).catch(() => {}).finally(() => setPrefsLoaded(true));
    loadTodayCheckin(uid).then(c => setCheckin(c ? 'done' : 'needed')).catch(() => setCheckin('done'));
  }, [open, uid]);

  const refreshUsage = useCallback(() => { fetchUsage().then(u => u && setUsage(u)); }, []);
  useEffect(() => { if (open && uid) refreshUsage(); }, [open, uid, refreshUsage]);

  // Streak rescue: once a day, if a streak is at risk, ask the server for a
  // tone-matched line and reschedule the evening reminder with it. Only runs
  // after the user accepted the current terms and left personalization on.
  const rescueDay = useRef('');
  useEffect(() => {
    if (!uid || !profile || profile.notificationsEnabled === false) return;
    const today = new Date().toDateString();
    if (rescueDay.current === today) return;
    rescueDay.current = today;
    (async () => {
      try {
        const pr = await loadPrefs(uid);
        if (!hasConsent(pr) || !pr.useData) return;
        const st = await getStreakStatus(uid);
        if (!st.atRisk) return;
        const r = await requestRescueLine(st.streak);
        if (!r.text) return;
        setStreakRescueLine(r.text);
        await scheduleStreakRiskReminder(true, st.streak, 20, r.text);
      } catch { /* best-effort */ }
    })();
  }, [uid, profile]);

  // Typewriter reveal for the newest coach reply.
  useEffect(() => {
    if (!revealing) return;
    const full = msgs.find(m => m.id === revealing.id)?.text ?? '';
    if (revealing.shown >= full.length) { setRevealing(null); return; }
    const timer = setTimeout(() => setRevealing(r => (r ? { ...r, shown: Math.min(full.length, r.shown + 3) } : r)), 16);
    return () => clearTimeout(timer);
  }, [revealing, msgs]);

  const left = (b: 'chat' | 'tool') => (usage ? Math.max(0, usage[b].limit - usage[b].used) : 1);
  const chatLeft = left('chat');
  const toolLeft = left('tool');

  // ---- message plumbing ----
  const mk = (role: 'user' | 'coach', text: string, extra: Partial<CoachMessage> = {}): CoachMessage =>
    ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${role}`, role, text, at: Date.now(), ...extra });
  const push = (m: CoachMessage) => { setMsgs(prev => [...prev, m]); if (uid) saveMessage(uid, m).catch(() => {}); };
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
  const note = (text: string) => reply(mk('coach', text, { safety: true }));

  const errorText = (e: unknown): string => {
    const c = e instanceof CoachError ? e.code : 'unknown';
    switch (c) {
      case 'quota': {
        const wait = e instanceof CoachError && e.retryAt ? ' ' + fill(t('coachResetsIn'), { time: timeLeft(e.retryAt - Date.now()) }) : '';
        return (e instanceof CoachError && e.bucket === 'tool' ? t('coachLimitPlaceholder') : t('coachLimitPlaceholder')) + '.' + wait;
      }
      case 'busy': return t('coachErrBusy');
      case 'burst': return t('coachErrBurst');
      case 'blocked': return t('coachErrBlocked');
      case 'consent': return t('coachErrConsent');
      case 'allergen': return t('coachErrAllergen');
      case 'offline': return `${t('coachErrOffline')}\n\n💡 ${tipForDay(language)}`;
      default: return t('coachErrGeneric');
    }
  };

  // Runs one server call with the shared busy flag and error handling.
  const run = useCallback(async (job: () => Promise<{ text?: string; sources?: any; card?: any; safety?: boolean; usage?: Usage }>) => {
    if (busy || !uid) return;
    setBusy(true);
    try {
      const r = await job();
      if (r.usage) setUsage(r.usage);
      reply(mk('coach', r.text || '', {
        ...(r.card ? { card: r.card } : {}), ...(r.sources?.length ? { sources: r.sources } : {}), ...(r.safety ? { safety: true } : {}),
      }));
    } catch (e) {
      haptics.error();
      reply(mk('coach', errorText(e), { safety: true }));
      refreshUsage();
    } finally {
      setBusy(false);
    }
  }, [busy, uid, speakOn, language, refreshUsage]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !uid || chatLeft === 0) return;
    haptics.selection();
    stopSpeaking();
    setInput('');
    const userMsg = mk('user', text);
    push(userMsg);
    await run(() => sendChat([...msgs, userMsg], routeName));
  }, [busy, uid, chatLeft, msgs, routeName, run]);

  // ---- tools (each uses the "tools" allowance except recap/recovery, which are chat) ----
  const needData = () => {
    if (useData) return false;
    note(t('coachNeedData'));
    return true;
  };
  const toolRecap = () => { if (!needData()) send('Give me my weekly recap from my last 7 days: wins, one thing to improve, and one goal for next week. Under 120 words.'); };
  const toolRecovery = () => { if (!needData()) send('Based on my last 7 days of workouts, sleep, soreness and mood, should I train hard, go light or rest today? Give a short recovery recommendation.'); };
  const toolForm = () => setInput('Form tips for ');
  const toolPlan = () => {
    push(mk('user', t('coachToolPlan')));
    run(() => requestWorkoutPlan(profile ? `My goal is ${profile.goal}; activity level ${profile.activityLevel}.` : ''));
  };
  const toolMealPlan = () => {
    push(mk('user', t('coachToolMealPlan')));
    run(() => requestMealPlan(prefs.allergies, prefs.diet));
  };
  const toolChallenge = async () => {
    if (!uid || busy) return;
    push(mk('user', t('coachToolChallenge')));
    let friends: Awaited<ReturnType<typeof getFriends>> = [];
    try { friends = await getFriends(uid); } catch { /* treated as none */ }
    if (friends.length === 0) { note(t('coachNoFriends')); return; }
    run(() => requestChallenges(friends.map(f => ({
      uid: f.uid, name: f.displayName, level: f.level, totalXP: f.totalXP, streak: f.streak,
    }))));
  };
  const toolPhoto = () => {
    const pick = async (camera: boolean) => {
      try {
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
        const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        const asset = res.canceled ? null : res.assets?.[0];
        if (!asset?.base64) return;
        push(mk('user', t('coachToolPhoto')));
        run(async () => {
          const r = await analyzeMealPhoto(asset.base64!, asset.mimeType || 'image/jpeg');
          return r.card ? r : { text: t('coachNoFood'), safety: true, usage: r.usage };
        });
      } catch { /* picker cancelled or unavailable */ }
    };
    if (Platform.OS === 'web') { pick(false); return; }
    Alert.alert(t('coachToolPhoto'), t('coachMealPhotoNote'), [
      { text: t('coachCamera'), onPress: () => pick(true) },
      { text: t('coachLibrary'), onPress: () => pick(false) },
      { text: t('coachCancel'), style: 'cancel' },
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

  // ---- confirmable actions on cards ----
  const logMeal = async (m: CoachMessage) => {
    if (!uid || m.card?.kind !== 'meal' || m.card.logged) return;
    try { await logMealItems(uid, m.card.items); haptics.setComplete(); patchMsg(m.id, { card: { ...m.card, logged: true } }); }
    catch { haptics.error(); }
  };
  const savePlanCard = async (m: CoachMessage) => {
    if (!uid || m.card?.kind !== 'plan' || m.card.saved) return;
    try { await savePlan(uid, m.card.days); haptics.setComplete(); patchMsg(m.id, { card: { ...m.card, saved: true } }); }
    catch { haptics.error(); }
  };
  const saveMealPlanCard = async (m: CoachMessage) => {
    if (!uid || m.card?.kind !== 'mealplan' || m.card.saved) return;
    try { await saveMealPlan(uid, m.card.days, m.card.allergies ?? []); haptics.setComplete(); patchMsg(m.id, { card: { ...m.card, saved: true } }); }
    catch { haptics.error(); }
  };
  const showGrocery = (m: CoachMessage) => {
    if (m.card?.kind !== 'mealplan') return;
    reply(mk('coach', t('coachGrocery'), { safety: true, card: { kind: 'grocery', sections: buildGroceryList(m.card.days) } }));
  };
  const sendChallenge = async (m: CoachMessage, i: number) => {
    if (!uid || m.card?.kind !== 'challenge') return;
    const s = m.card.suggestions[i];
    if (s.sent) return;
    try {
      if (await hasActiveChallengeWith(uid, s.uid)) { note(t('challengeAlreadyActive')); return; }
      await createChallenge(uid, s.uid, s.goalLabel);
      haptics.setComplete();
      patchMsg(m.id, { card: { ...m.card, suggestions: m.card.suggestions.map((x, j) => (j === i ? { ...x, sent: true } : x)) } });
    } catch { haptics.error(); }
  };

  const rate = async (m: CoachMessage, rating: 'up' | 'down', reason?: string) => {
    if (!uid) return;
    patchMsg(m.id, { feedback: rating });
    setReasonFor(null);
    haptics.selection();
    sendFeedback(uid, { kind: 'rating', rating, reason, messageId: m.id, replyText: m.text }).catch(() => {});
  };
  const submitProblem = () => {
    if (!uid) return;
    sendFeedback(uid, { kind: 'problem', note: problemText.trim() || undefined }).catch(() => {});
    setProblemText(''); setProblemOpen(false); setShowSettings(false);
    note(t('coachFeedbackThanks'));
  };
  const submitCheckin = async () => {
    if (!uid || mood === 0 || soreness < 0) return;
    try { await saveCheckin(uid, { mood, soreness }); } catch { haptics.error(); return; }
    haptics.setComplete();
    setCheckin('done');
    note(t('coachCheckinThanks'));
  };
  const saveAllergies = () => {
    const list = allergyText.split(',').map(a => a.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    setPrefs({ allergies: list });
  };

  if (!authUser || !routeName || HIDDEN_ROUTES.has(routeName)) return null;

  const chips = (CHIPS[routeName] ?? DEFAULT_CHIPS).map(k => t(k));
  const exhausted = usage ? usage.chat.resetAt : null;

  const mealLine = (it: { name: string; calories: number; protein: number; carbs: number; fat: number }) =>
    `${it.name}: ${it.calories} kcal · P${it.protein} C${it.carbs} F${it.fat}`;

  const cardView = (m: CoachMessage) => {
    const c = m.card;
    if (!c || revealing?.id === m.id) return null;
    const box = [styles.card, { borderColor: p.border, backgroundColor: p.surface }];
    const btn = (done: boolean, label: string, doneLabel: string, onPress: () => void) => (
      <Pressable accessibilityRole="button" disabled={done} onPress={onPress}
        style={[styles.cardBtn, { backgroundColor: done ? p.successSoft : p.accent }]}>
        <Text style={[type.button, { color: done ? p.success : p.textOnAccent }]}>{done ? doneLabel : label}</Text>
      </Pressable>
    );
    switch (c.kind) {
      case 'meal': return (
        <View style={box}>
          {c.items.map((it, i) => <Text key={i} style={[type.bodySm, { color: p.textPrimary }]}>{mealLine(it)}</Text>)}
          {btn(!!c.logged, t('coachLogToday'), t('coachLogged'), () => logMeal(m))}
        </View>);
      case 'plan': return (
        <View style={box}>
          {c.days.map((d, i) => <Text key={i} style={[type.bodySm, { color: p.textPrimary }]}>{d.day.slice(0, 3)}: {d.rest ? '—' : `${d.focus} (${d.exercises.length})`}</Text>)}
          {btn(!!c.saved, t('coachSaveWorkout'), t('coachSavedWorkout'), () => savePlanCard(m))}
        </View>);
      case 'mealplan': return (
        <View style={box}>
          {c.days.map((d, i) => (
            <Text key={i} style={[type.bodySm, { color: p.textPrimary }]}>
              {d.day.slice(0, 3)}: {d.meals.reduce((n, x) => n + x.calories, 0)} kcal · {d.meals.map(x => x.name).join(', ')}
            </Text>))}
          {!!c.calorieNote && <Text style={[type.bodySm, { color: p.warning }]}>{c.calorieNote}</Text>}
          {(c.allergies?.length ?? 0) > 0 && <Text style={[type.bodySm, { color: p.warning }]}>⚠️ {t('coachAllergyNote')}</Text>}
          {btn(!!c.saved, t('coachSaveMealPlan'), t('coachSavedMealPlan'), () => saveMealPlanCard(m))}
          <Pressable accessibilityRole="button" onPress={() => showGrocery(m)} style={[styles.cardBtn, { borderWidth: 1, borderColor: p.accent }]}>
            <Text style={[type.button, { color: p.textPrimary }]}>{t('coachGrocery')}</Text>
          </Pressable>
        </View>);
      case 'grocery': return (
        <View style={box}>
          {c.sections.map(s => (
            <View key={s.aisle}>
              <Text style={[type.label, { color: p.textMuted }]}>{s.aisle.toUpperCase()}</Text>
              {s.items.map(i => <Text key={i.item + i.unit} style={[type.bodySm, { color: p.textPrimary }]}>• {i.item}: {i.qty}{i.unit ? ' ' + i.unit : ''}</Text>)}
            </View>))}
          <Pressable accessibilityRole="button" onPress={() => Share.share({ message: groceryToText(c.sections, t('coachGrocery')) }).catch(() => {})}
            style={[styles.cardBtn, { backgroundColor: p.accent }]}>
            <Text style={[type.button, { color: p.textOnAccent }]}>{t('coachShareList')}</Text>
          </Pressable>
        </View>);
      case 'challenge': return (
        <View style={box}>
          {c.suggestions.length === 0 && <Text style={[type.bodySm, { color: p.textMuted }]}>{t('coachNoFriends')}</Text>}
          {c.suggestions.map((s, i) => (
            <View key={s.uid} style={{ gap: 2 }}>
              <Text style={[type.heading, { color: p.textPrimary }]}>{s.name}: {s.goalLabel}</Text>
              <Text style={[type.bodySm, { color: p.textSecondary }]}>{s.reason}</Text>
              {btn(!!s.sent, t('coachSendChallenge'), t('coachChallengeSent'), () => sendChallenge(m, i))}
            </View>))}
        </View>);
    }
  };

  const bubble = (m: CoachMessage) => {
    const mine = m.role === 'user';
    const text = revealing?.id === m.id ? m.text.slice(0, revealing.shown) : m.text;
    const rateable = !mine && !m.safety && revealing?.id !== m.id;
    return (
      <View style={[styles.row, mine && { justifyContent: 'flex-end' }]}>
        <View style={[styles.bubble, mine
          ? { backgroundColor: p.accent, borderBottomRightRadius: 4 }
          : { backgroundColor: p.surfaceRaised, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: m.safety ? p.warning : p.border }]}>
          {!!text && <Text style={[type.body, { color: mine ? p.textOnAccent : p.textPrimary }]} selectable>{text}</Text>}
          {cardView(m)}
          {!!m.sources?.length && revealing?.id !== m.id && (
            <View style={styles.sources}>
              <Text style={[type.label, { color: p.textMuted }]}>{t('coachSources')}</Text>
              {m.sources.map(src => (
                <Pressable key={src.uri} accessibilityRole="link" onPress={() => Linking.openURL(src.uri)}>
                  <Text style={[type.bodySm, { color: p.info, textDecorationLine: 'underline' }]} numberOfLines={1}>{src.title}</Text>
                </Pressable>))}
            </View>)}
          {rateable && (
            <View style={styles.rateRow}>
              {(['up', 'down'] as const).map(r => (
                <Pressable key={r} accessibilityRole="button" accessibilityLabel={r === 'up' ? t('coachHelpful') : t('coachNotHelpful')}
                  hitSlop={8} onPress={() => (r === 'up' ? rate(m, 'up') : setReasonFor(m.id))}
                  style={{ opacity: m.feedback && m.feedback !== r ? 0.3 : 1 }}>
                  <Text style={{ fontSize: 16 }}>{r === 'up' ? '👍' : '👎'}</Text>
                </Pressable>))}
            </View>)}
          {reasonFor === m.id && (
            <View style={styles.toneRow}>
              {REASONS.map(([id, key]) => (
                <Pressable key={id} accessibilityRole="button" onPress={() => rate(m, 'down', id)} style={[styles.chip, { borderColor: p.border }]}>
                  <Text style={[type.bodySm, { color: p.textPrimary }]}>{t(key)}</Text>
                </Pressable>))}
            </View>)}
        </View>
      </View>
    );
  };

  const tools: [string, () => void, boolean][] = [
    [t('coachToolPhoto'), toolPhoto, true], [t('coachToolPlan'), toolPlan, true], [t('coachToolMealPlan'), toolMealPlan, true],
    [t('coachToolChallenge'), toolChallenge, true], [t('coachToolRecap'), toolRecap, false],
    [t('coachToolForm'), toolForm, false], [t('coachToolRecovery'), toolRecovery, false],
  ];

  return (
    <>
      {!open && (
        <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: insets.bottom + spacing.xl, right: spacing.lg }]}>
          <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: p.accent,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={t('coachOpenLabel')}
            onPress={() => { haptics.selection(); setOpen(true); }}
            style={({ pressed }) => [styles.fab, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={{ fontSize: 24 }}>✨</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={[styles.scrim, { backgroundColor: p.scrim }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} accessibilityLabel={t('coachCancel')} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border, paddingBottom: insets.bottom + spacing.sm }]}>
              <View style={styles.header}>
                <View style={[styles.avatar, { backgroundColor: p.accentSoft }]}><Text style={{ fontSize: 18 }}>✨</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.heading, { color: p.textPrimary }]}>Shift · AI Coach</Text>
                  {usage && (
                    <Text style={[type.bodySm, { color: p.textMuted }]}>
                      {fill(t('coachUsageLine'), { chat: chatLeft, tool: toolLeft })}
                      {usage.tier === 'free' ? ` · ${t('coachUpgradeHint')}` : ''}
                    </Text>)}
                  {!!exhausted && <Text style={[type.bodySm, { color: p.warning }]}>{fill(t('coachResetsIn'), { time: timeLeft(exhausted - Date.now()) })}</Text>}
                </View>
                {agreed && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={() => setShowSettings(v => !v)}>
                    <Text style={{ color: p.textSecondary, fontSize: 18 }}>⚙</Text>
                  </Pressable>)}
                {agreed && msgs.length > 0 && (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('coachClear')} hitSlop={8}
                    onPress={() => { uid && clearHistory(uid).catch(() => {}); setMsgs([]); }}>
                    <Text style={[type.bodySm, { color: p.textMuted }]}>{t('coachClear')}</Text>
                  </Pressable>)}
                <Pressable accessibilityRole="button" accessibilityLabel={t('coachCancel')} hitSlop={8} onPress={() => setOpen(false)}>
                  <Text style={{ color: p.textSecondary, fontSize: 20 }}>✕</Text>
                </Pressable>
              </View>

              {!prefsLoaded ? (
                <ActivityIndicator color={p.accent} style={{ margin: spacing.xxl }} />
              ) : !agreed ? (
                <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.consent}>
                  <Text style={[type.title, { color: p.textPrimary }]}>{t('coachLegalTitle')}</Text>
                  <Text style={[type.body, { color: p.textSecondary, marginTop: spacing.md }]}>{t('coachLegalBody')}</Text>
                  <View style={[styles.toggle, { borderColor: p.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.heading, { color: p.textPrimary }]}>{t('coachPersonalize')}</Text>
                      <Text style={[type.bodySm, { color: p.textMuted }]}>{t('coachPersonalizeHint')}</Text>
                    </View>
                    <Switch value={useData} onValueChange={v => setPrefsState(x => ({ ...x, useData: v }))} trackColor={{ true: p.accent }} />
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { haptics.selection(); setPrefs({ consented: true, consentVersion: COACH_CONSENT_VERSION }); }}
                    style={[styles.cta, { backgroundColor: p.accent }]}>
                    <Text style={[type.button, { color: p.textOnAccent }]}>{t('coachAgree')}</Text>
                  </Pressable>
                </ScrollView>
              ) : (
                <>
                  {showSettings && (
                    <ScrollView style={[styles.settings, { borderColor: p.border }]} contentContainerStyle={{ gap: spacing.sm }}>
                      <Text style={[type.label, { color: p.textMuted }]}>{t('coachStyle')}</Text>
                      <View style={styles.toneRow}>
                        {TONES.map(tn => (
                          <Pressable key={tn.id} accessibilityRole="button" accessibilityState={{ selected: tone === tn.id }}
                            onPress={() => { haptics.selection(); setPrefs({ tone: tn.id }); }}
                            style={[styles.chip, { borderColor: tone === tn.id ? p.accent : p.border, backgroundColor: tone === tn.id ? p.accentSoft : 'transparent' }]}>
                            <Text style={[type.bodySm, { color: p.textPrimary }]}>{tn.emoji} {t(tn.labelKey)}</Text>
                          </Pressable>))}
                      </View>
                      <View style={styles.setRow}>
                        <Text style={[type.bodySm, { color: p.textPrimary, flex: 1 }]}>{t('coachPersonalizeWeek')}</Text>
                        <Switch value={useData} onValueChange={v => setPrefs({ useData: v })} trackColor={{ true: p.accent }} />
                      </View>
                      {canSpeak() && (
                        <View style={styles.setRow}>
                          <Text style={[type.bodySm, { color: p.textPrimary, flex: 1 }]}>{t('coachReadAloud')}</Text>
                          <Switch value={speakOn} onValueChange={v => { if (!v) stopSpeaking(); setPrefs({ speak: v }); }} trackColor={{ true: p.accent }} />
                        </View>)}
                      <Text style={[type.bodySm, { color: p.textSecondary }]}>{t('coachAllergies')}</Text>
                      <TextInput value={allergyText} onChangeText={setAllergyText} onBlur={saveAllergies} maxLength={200}
                        placeholderTextColor={p.textMuted} placeholder="peanuts, shellfish"
                        style={[styles.smallInput, type.bodySm, { color: p.textPrimary, borderColor: p.border, backgroundColor: p.surfaceRaised }]} />
                      <Text style={[type.bodySm, { color: p.textSecondary }]}>{t('coachDiet')}</Text>
                      <TextInput value={prefs.diet} onChangeText={v => setPrefsState(x => ({ ...x, diet: v.slice(0, 60) }))} onBlur={() => setPrefs({})}
                        placeholderTextColor={p.textMuted} placeholder="vegetarian"
                        style={[styles.smallInput, type.bodySm, { color: p.textPrimary, borderColor: p.border, backgroundColor: p.surfaceRaised }]} />
                      {!problemOpen ? (
                        <Pressable accessibilityRole="button" onPress={() => setProblemOpen(true)}>
                          <Text style={[type.bodySm, { color: p.info, textDecorationLine: 'underline' }]}>{t('coachReport')}</Text>
                        </Pressable>
                      ) : (
                        <View style={{ gap: spacing.sm }}>
                          <Text style={[type.bodySm, { color: p.textPrimary }]}>{t('coachProblemTitle')}</Text>
                          <TextInput value={problemText} onChangeText={setProblemText} multiline maxLength={500}
                            placeholder={t('coachProblemPlaceholder')} placeholderTextColor={p.textMuted}
                            style={[styles.smallInput, type.bodySm, { minHeight: 60, color: p.textPrimary, borderColor: p.border, backgroundColor: p.surfaceRaised }]} />
                          <Pressable accessibilityRole="button" onPress={submitProblem} style={[styles.cardBtn, { backgroundColor: p.accent }]}>
                            <Text style={[type.button, { color: p.textOnAccent }]}>{t('coachSubmit')}</Text>
                          </Pressable>
                        </View>)}
                    </ScrollView>
                  )}

                  {checkin === 'needed' && (
                    <View style={[styles.checkin, { borderColor: p.border, backgroundColor: p.surfaceRaised }]}>
                      <Text style={[type.heading, { color: p.textPrimary }]}>{t('coachCheckinTitle')}</Text>
                      <Text style={[type.bodySm, { color: p.textSecondary }]}>{t('coachMood')}</Text>
                      <View style={styles.toneRow}>
                        {MOODS.map((e, i) => (
                          <Pressable key={e} accessibilityRole="button" onPress={() => setMood(i + 1)}
                            style={[styles.moodBtn, { borderColor: mood === i + 1 ? p.accent : p.border }]}>
                            <Text style={{ fontSize: 20 }}>{e}</Text>
                          </Pressable>))}
                      </View>
                      <Text style={[type.bodySm, { color: p.textSecondary }]}>{t('coachSoreness')}</Text>
                      <View style={styles.toneRow}>
                        {[0, 1, 2, 3].map(n => (
                          <Pressable key={n} accessibilityRole="button" onPress={() => setSoreness(n)}
                            style={[styles.chip, { borderColor: soreness === n ? p.accent : p.border }]}>
                            <Text style={[type.bodySm, { color: p.textPrimary }]}>{t(`coachSore${n}`)}</Text>
                          </Pressable>))}
                      </View>
                      <View style={styles.toneRow}>
                        <Pressable accessibilityRole="button" disabled={mood === 0 || soreness < 0} onPress={submitCheckin}
                          style={[styles.chip, { backgroundColor: p.accent, borderColor: p.accent, opacity: mood === 0 || soreness < 0 ? 0.4 : 1 }]}>
                          <Text style={[type.bodySm, { color: p.textOnAccent }]}>{t('coachSave')}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" onPress={() => setCheckin('done')} style={[styles.chip, { borderColor: p.border }]}>
                          <Text style={[type.bodySm, { color: p.textSecondary }]}>{t('coachCancel')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  <FlatList
                    ref={listRef} data={msgs} keyExtractor={m => m.id} renderItem={({ item }) => bubble(item)}
                    style={styles.list} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
                    onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                    ListEmptyComponent={<Text style={[type.body, { color: p.textSecondary }]}>
                      {profile?.firstName ? `${profile.firstName}! ` : ''}{t('coachGreeting')}</Text>}
                    ListFooterComponent={busy ? (
                      <View style={styles.row}><View style={[styles.bubble, { backgroundColor: p.surfaceRaised }]}><ActivityIndicator color={p.accent} /></View></View>
                    ) : null}
                  />

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}>
                    {tools.map(([label, fn, usesTool]) => {
                      const off = busy || (usesTool ? toolLeft === 0 : chatLeft === 0);
                      return (
                        <Pressable key={label} accessibilityRole="button" disabled={off} onPress={fn}
                          style={[styles.chip, { borderColor: p.border, backgroundColor: p.surfaceRaised, opacity: off ? 0.5 : 1 }]}>
                          <Text style={[type.bodySm, { color: p.textPrimary }]}>{label}</Text>
                        </Pressable>);
                    })}
                  </ScrollView>
                  <FlatList horizontal showsHorizontalScrollIndicator={false} data={chips} keyExtractor={c => c} style={{ flexGrow: 0 }}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
                    renderItem={({ item }) => (
                      <Pressable accessibilityRole="button" onPress={() => send(item)} disabled={busy || chatLeft === 0}
                        style={[styles.chip, { borderColor: p.accentBorder, backgroundColor: p.accentSoft }]}>
                        <Text style={[type.bodySm, { color: p.textPrimary }]}>{item}</Text>
                      </Pressable>)} />
                  <View style={styles.inputRow}>
                    <TextInput value={input} onChangeText={setInput} placeholder={chatLeft ? t('coachPlaceholder') : t('coachLimitPlaceholder')}
                      placeholderTextColor={p.textMuted} editable={chatLeft > 0} maxLength={500} multiline
                      style={[styles.input, type.body, { color: p.textPrimary, backgroundColor: p.surfaceRaised, borderColor: p.border }]} />
                    {canListen() && (
                      <Pressable accessibilityRole="button" accessibilityLabel="Voice" onPress={toggleMic}
                        style={[styles.send, { backgroundColor: listening ? p.danger : p.surfaceRaised, borderWidth: 1, borderColor: p.border }]}>
                        <Text style={{ fontSize: 18 }}>{listening ? '■' : '🎤'}</Text>
                      </Pressable>)}
                    <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!input.trim() || busy || chatLeft === 0}
                      onPress={() => send(input)}
                      style={[styles.send, { backgroundColor: p.accent, opacity: !input.trim() || busy || chatLeft === 0 ? 0.4 : 1 }]}>
                      <Text style={{ color: p.textOnAccent, fontSize: 18, fontFamily: fontFamily.sansBold }}>↑</Text>
                    </Pressable>
                  </View>
                </>
              )}
              <Text style={[styles.warn, { color: p.textMuted }]}>{t('coachWarning')}</Text>
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
  sheet: { maxHeight: '88%', minHeight: 420, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  list: { minHeight: 160 },
  row: { flexDirection: 'row' },
  bubble: { maxWidth: '88%', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: { flex: 1, maxHeight: 100, minHeight: 44, borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.md, paddingTop: 11 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  warn: { fontSize: 11, lineHeight: 15, textAlign: 'center', padding: spacing.md, fontFamily: fontFamily.sans },
  consent: { padding: spacing.lg, paddingTop: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg },
  cta: { marginTop: spacing.lg, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  card: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, gap: 2 },
  cardBtn: { marginTop: spacing.sm, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sources: { marginTop: spacing.sm, gap: 2 },
  rateRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  settings: { maxHeight: 260, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  smallInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  toneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkin: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm },
  moodBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
