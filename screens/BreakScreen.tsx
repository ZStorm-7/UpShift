// The mindful break (a 15-second breathing exercise) and the strict-mode screen.
//
// Designed to work with the EYES CLOSED, because the point is to rest them:
//   * an eye on screen closes first and stays closed, which is the cue to close yours
//   * a soft haptic marks every phase and ticks each second of breathing, and
//     an optional soft sound swells and fades with the breath, so nothing needs looking at
//   * only when the eye opens again does the screen ask for attention
//
// It is deliberately a dark, low-stimulation screen (not the app's light/dark
// theme): a bright flash after closing your eyes would defeat the purpose.
//
// The break is mandatory: the back gesture and Android back are blocked until
// the 15 seconds are done, and leaving the app mid-exercise restarts it. The one
// way out is the emergency pass: press and hold for 3 seconds, twice a day.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityInfo, AppState, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop, Path, G, Line } from 'react-native-svg';
import Animated, {
  Easing, FadeIn, FadeOut, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { useBreak } from '../context/BreakContext';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { fontFamily } from '../theme/fonts';
import { spacing, radius } from '../theme/tokens';
import haptics from '../services/haptics';
import { stopSpeaking } from '../services/voice';
import { exitToPreviousApp } from '../services/breaks/native';
import { clockTimeLabel, clock } from '../services/breaks/format';
import { reflectionForDay } from '../data/reflections';
import { MOODS } from '../services/breaks/stats';
import { startBreathSound, stopBreathSound } from '../services/breaks/breathSound';
import { PASS_HOLD_MS } from '../services/breaks/passes';
import { INTENT_IDS, IntentId } from '../services/breaks/stats';
import {
  TOTAL_MS, SCALE_MIN, PhaseId, PHASE_HAPTIC, PHASE_KEY, compile, asPatternId, phaseAt, scaleAt, eyeOpenAt,
} from '../services/breaks/timeline';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

// A calm, fixed palette (see the note at the top).
const BG = '#050A09';
const ACCENT = '#00C805';
const TEAL = '#2DD4BF';
const TEXT = '#F2F7F5';
const MUTED = 'rgba(242, 247, 245, 0.62)';

const ORB = 260;
const RING_R = 138;
const RING_C = 2 * Math.PI * RING_R;

const INTENT_KEY: Record<IntentId, string> = {
  specific: 'intentSpecific', connect: 'intentConnect', unwind: 'intentUnwind', unsure: 'intentUnsure',
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// Upper and lower lids as one almond path; `open` 1 = wide, 0 = shut.
function eyePath(open: number): string {
  'worklet';
  const h = 30 * open;
  return `M 8 40 Q 60 ${40 - h * 1.6} 112 40 Q 60 ${40 + h * 1.6} 8 40 Z`;
}

export default function BreakScreen({ navigation, route }: any) {
  const { t, language } = useLanguage();
  const { profile } = useUser();
  const { settings, updateSettings, setBreakActive, completeBreak, appReady, passesLeftToday, takeEmergencyPass, xpNext } = useBreak();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const params = (route?.params ?? {}) as {
    mode?: 'breathe' | 'strict'; pkg?: string; label?: string; until?: number; pattern?: string; winddown?: string;
    source?: string; preview?: boolean;
  };
  const isStrict = params.mode === 'strict';
  const isWindDown = isStrict && (params.winddown === '1' || params.winddown === 'true');
  const preview = !!params.preview;
  const appLabel = params.label || '';
  const fromOtherApp = !!appLabel && params.source !== 'in-app';

  const compiled = useMemo(() => compile(asPatternId(params.pattern ?? settings.pattern)), [params.pattern, settings.pattern]);

  const progress = useSharedValue(0); // elapsed ms, driven on the UI thread
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState(0); // bumps when the exercise restarts
  const [stage, setStage] = useState<'breathe' | 'intent' | 'choose'>('breathe');
  const [intent, setIntent] = useState<IntentId | undefined>();
  const [mood, setMood] = useState<number | undefined>();
  const [iosNote, setIosNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(!settings.sound);
  const [now, setNow] = useState(Date.now());
  const allowLeave = useRef(isStrict);
  const lastPhase = useRef<PhaseId | null>(null);
  const lastSecond = useRef(-1);

  const phase = phaseAt(compiled.id, elapsed);
  const done = phase.id === 'done';

  // ---- lifecycle: mark the break active, silence audio, run the clock ----
  useEffect(() => {
    if (isStrict) return;
    setBreakActive(true);
    stopSpeaking();
    return () => setBreakActive(false);
  }, [setBreakActive, isStrict]);

  // The clock starts only once the app's splash has gone, so a break that opens
  // on a cold start doesn't spend its first seconds behind the logo.
  useEffect(() => {
    if (isStrict || !appReady) return;
    startedAt.current = Date.now();
    lastPhase.current = null;
    lastSecond.current = -1;
    setElapsed(0);
    setStage('breathe');
    progress.value = 0;
    progress.value = withTiming(TOTAL_MS, { duration: TOTAL_MS, easing: Easing.linear });
    const id = setInterval(() => setElapsed(Math.min(TOTAL_MS, Date.now() - startedAt.current)), 100);
    return () => { clearInterval(id); cancelAnimation(progress); };
  }, [round, progress, appReady, isStrict]);

  // Soft sound for the breathing part only. It restarts with the exercise.
  useEffect(() => {
    if (isStrict || !appReady || muted) return;
    startBreathSound(compiled.id);
    return () => stopBreathSound();
  }, [round, appReady, muted, compiled.id, isStrict]);
  useEffect(() => { if (done) stopBreathSound(); }, [done]);

  // Strict screen clock.
  useEffect(() => {
    if (!isStrict) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [isStrict]);

  // Leaving the app mid-exercise doesn't count: start again when they return.
  // (Only a real trip to the background; pulling down the notification shade
  // reports 'inactive' and shouldn't punish anyone.)
  const wasAway = useRef(false);
  const doneRef = useRef(false);
  doneRef.current = done;
  useEffect(() => {
    if (isStrict) return;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background' && !allowLeave.current && !doneRef.current) wasAway.current = true;
      if (s === 'active' && wasAway.current) { wasAway.current = false; setRound(r => r + 1); }
    });
    return () => sub.remove();
  }, [isStrict]);

  // Block back / swipe until the exercise is finished (not on the strict screen,
  // which only explains; the blocked app is what is actually closed).
  useEffect(() => navigation.addListener('beforeRemove', (e: any) => {
    if (!allowLeave.current) e.preventDefault();
  }), [navigation]);

  // When the breathing ends, ask what brought them here (if they chose to be asked).
  useEffect(() => {
    if (!done || stage !== 'breathe') return;
    setStage(settings.intention && fromOtherApp && !preview ? 'intent' : 'choose');
  }, [done, stage, settings.intention, fromOtherApp, preview]);

  // ---- feedback: a haptic per phase, a tick each second of breathing ----
  useEffect(() => {
    if (isStrict) return;
    if (lastPhase.current !== phase.id) {
      lastPhase.current = phase.id;
      const kind = PHASE_HAPTIC[phase.id];
      if (kind === 'done') haptics.setComplete(); else haptics.selection();
      AccessibilityInfo.announceForAccessibility?.(t(PHASE_KEY[phase.id]));
    }
    const sec = Math.floor(elapsed / 1000);
    if (sec !== lastSecond.current) {
      lastSecond.current = sec;
      if (phase.id === 'in' || phase.id === 'out' || phase.id === 'sip') haptics.selection();
    }
  }, [elapsed, phase.id, t, isStrict]);

  // ---- animation (all on the UI thread, driven by `progress`) ----
  const eyeProps = useAnimatedProps(() => ({ d: eyePath(eyeOpenAt(compiled, progress.value)) }));
  const irisProps = useAnimatedProps(() => {
    const o = eyeOpenAt(compiled, progress.value);
    return { r: 14 * o, fillOpacity: o };
  });
  const lashProps = useAnimatedProps(() => ({ opacity: 1 - eyeOpenAt(compiled, progress.value) }));
  const eyeGlow = useAnimatedStyle(() => ({ opacity: (1 - eyeOpenAt(compiled, progress.value)) * 0.9 }));

  const orbStyle = useAnimatedStyle(() => {
    const s = reduced ? 0.8 : scaleAt(compiled, progress.value);
    return { transform: [{ scale: s }], opacity: 0.55 + 0.45 * ((s - SCALE_MIN) / (1 - SCALE_MIN)) };
  });
  const haloStyle = useAnimatedStyle(() => {
    const s = reduced ? 0.9 : SCALE_MIN + (scaleAt(compiled, progress.value) - SCALE_MIN) * 1.28;
    return { transform: [{ scale: s * 1.06 }], opacity: 0.12 + 0.18 * ((s - SCALE_MIN) / (1.28 - SCALE_MIN)) };
  });
  // Once the breathing is over the orb shrinks to make room for the choices.
  const compact = useSharedValue(0);
  useEffect(() => { compact.value = withTiming(stage === 'breathe' ? 0 : 1, { duration: 500 }); }, [stage, compact]);
  const stageWrap = useAnimatedStyle(() => ({ height: (ORB + 40) * (1 - 0.42 * compact.value) }));
  const stageInner = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.42 * compact.value }] }));
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - Math.min(1, progress.value / TOTAL_MS)) }));

  // ---- leaving ----
  const leave = useCallback(() => {
    allowLeave.current = true;
    stopBreathSound();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: profile ? 'Dashboard' : 'Welcome' }] });
  }, [navigation, profile]);

  async function finish(outcome: 'stay' | 'exit') {
    if (busy) return;
    setBusy(true);
    if (!preview) await completeBreak(outcome, intent, mood);
    if (outcome === 'stay' || preview) { leave(); return; }
    const result = await exitToPreviousApp(params.pkg);
    if (result === 'unsupported') { setIosNote(true); setBusy(false); return; }
    leave();
  }

  async function onPass() {
    if (busy) return;
    setBusy(true);
    const ok = await takeEmergencyPass({ abandonPending: !isStrict });
    if (!ok) { setBusy(false); return; }
    haptics.setComplete();
    if (params.pkg) await exitToPreviousApp(params.pkg);
    leave();
  }

  function toggleSound() {
    haptics.selection();
    const next = !muted;
    setMuted(next);
    if (next) stopBreathSound();
    updateSettings({ sound: !next });
  }

  const secondsLeft = Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));
  const smallScreen = height < 700;
  const showPass = !preview && stage === 'breathe' && !done;

  // ============================ STRICT MODE ============================
  if (isStrict) {
    // Deep-link parameters arrive as strings.
    const until = Number(params.until) || 0;
    const remaining = until - now;
    const over = remaining <= 0;
    const endTime = clockTimeLabel(until, language);
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]} accessibilityViewIsModal>
        <StatusBar style="light" />
        <View style={styles.top}>
          <Text style={styles.eyebrow}>{isWindDown ? t('breakWindDownEyebrow') : t('breakStrictEyebrow')}</Text>
        </View>
        <View style={styles.strictBody}>
          <Text style={styles.lock} accessibilityElementsHidden importantForAccessibility="no">🔒</Text>
          <Text style={styles.doneTitle} accessibilityRole="header">
            {over ? t('breakStrictOver') : isWindDown ? t('breakWindDownTitle') : fill(t('breakStrictTitle'), { app: appLabel || t('breakThisApp') })}
          </Text>
          {!over && (
            <>
              <Text style={styles.strictClock} accessibilityLiveRegion="polite">{clock(remaining)}</Text>
              <Text style={styles.doneBody}>
                {isWindDown
                  ? fill(t('breakWindDownBody'), { app: appLabel || t('breakThisApp'), time: endTime })
                  : fill(t('breakStrictUntil'), { time: endTime })}
              </Text>
            </>
          )}
        </View>
        <View style={styles.bottom}>
          <Pressable accessibilityRole="button" onPress={leave} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
            <Text style={styles.btnPrimaryText}>{over ? t('breakContinue') : t('breakStrictBack')}</Text>
          </Pressable>
          {!over && settings.passEnabled && <PassHold t={t} left={passesLeftToday} busy={busy} onDone={onPass} />}
        </View>
      </View>
    );
  }

  // ============================ THE BREAK ============================
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      accessibilityViewIsModal>
      <StatusBar style="light" />

      <View style={styles.top}>
        <Text style={styles.eyebrow}>{preview ? t('breakPreview') : t('breakEyebrow')}</Text>
        {!!appLabel && <Text style={styles.from}>{fill(t('breakFrom'), { app: appLabel })}</Text>}
        {!done && (
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? t('breakSoundOff') : t('breakSoundOn')}
            onPress={toggleSound} hitSlop={12} style={styles.soundBtn}>
            <Text style={styles.soundGlyph}>{muted ? '🔇' : '🔊'}</Text>
          </Pressable>
        )}
      </View>

      {/* The eye: closes first, opens last. */}
      <View style={styles.eyeWrap} accessible accessibilityRole="image" accessibilityLabel={t(PHASE_KEY[phase.id])}>
        <Animated.View style={[styles.eyeGlow, eyeGlow]} pointerEvents="none" />
        <Svg width={smallScreen ? 96 : 132} height={smallScreen ? 64 : 88} viewBox="0 0 120 80">
          <AnimatedPath animatedProps={eyeProps} fill="rgba(242,247,245,0.07)" stroke={TEXT} strokeWidth={3} strokeLinejoin="round" />
          <AnimatedCircle cx={60} cy={40} fill={TEAL} animatedProps={irisProps} />
          <AnimatedG animatedProps={lashProps} stroke={TEXT} strokeWidth={3} strokeLinecap="round">
            <Line x1={30} y1={42} x2={26} y2={52} />
            <Line x1={60} y1={44} x2={60} y2={56} />
            <Line x1={90} y1={42} x2={94} y2={52} />
          </AnimatedG>
        </Svg>
      </View>

      {/* The breath: an orb that grows as you breathe in and settles as you breathe out. */}
      <Animated.View style={[{ width: ORB + 40, alignItems: 'center', justifyContent: 'center' }, stageWrap]}>
      <Animated.View style={[styles.stage, { width: ORB + 40, height: ORB + 40 }, stageInner]}>
        <Svg width={ORB + 40} height={ORB + 40} style={StyleSheet.absoluteFill}>
          <Circle cx={(ORB + 40) / 2} cy={(ORB + 40) / 2} r={RING_R} stroke="rgba(242,247,245,0.10)" strokeWidth={3} fill="none" />
          <AnimatedCircle
            cx={(ORB + 40) / 2} cy={(ORB + 40) / 2} r={RING_R}
            stroke={ACCENT} strokeWidth={3} strokeLinecap="round" fill="none"
            strokeDasharray={`${RING_C}`} animatedProps={ringProps}
            transform={`rotate(-90 ${(ORB + 40) / 2} ${(ORB + 40) / 2})`}
          />
        </Svg>
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
        <Animated.View style={[styles.orb, orbStyle]} pointerEvents="none">
          <Svg width={ORB} height={ORB}>
            <Defs>
              <RadialGradient id="orb" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#B8FFE0" stopOpacity={0.95} />
                <Stop offset="0.45" stopColor={ACCENT} stopOpacity={0.65} />
                <Stop offset="1" stopColor={TEAL} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={ORB / 2} cy={ORB / 2} r={ORB / 2} fill="url(#orb)" />
          </Svg>
        </Animated.View>

        <View style={styles.center} pointerEvents="none">
          {!done && (
            <Animated.Text key={`${phase.index}-${phase.id}`} entering={FadeIn.duration(380).delay(150)} exiting={FadeOut.duration(120)}
              style={styles.phase} accessibilityLiveRegion="polite">
              {t(PHASE_KEY[phase.id])}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
      </Animated.View>

      {/* Below the orb: a quiet hint while breathing, then the question, then the choices. */}
      <View style={styles.bottom}>
        {stage === 'breathe' && (
          <>
            <Text style={styles.hint}>{t('breakSubtitle')}</Text>
            <Text style={styles.count} accessibilityElementsHidden importantForAccessibility="no">{secondsLeft}</Text>
            {showPass && settings.passEnabled && <PassHold t={t} left={passesLeftToday} busy={busy} onDone={onPass} />}
          </>
        )}

        {stage === 'intent' && (
          <Animated.View entering={FadeIn.duration(500)} style={styles.doneBlock}>
            <Text style={styles.doneTitle} accessibilityRole="header">{fill(t('breakIntentTitle'), { app: appLabel })}</Text>
            <View style={styles.grid}>
              {INTENT_IDS.map(id => (
                <Pressable key={id} accessibilityRole="button" onPress={() => { haptics.selection(); setIntent(id); setStage('choose'); }}
                  style={({ pressed }) => [styles.gridBtn, styles.btnGhost, pressed && styles.pressed]}>
                  <Text style={styles.gridText}>{t(INTENT_KEY[id])}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {stage === 'choose' && !iosNote && (
          <Animated.View entering={FadeIn.duration(500)} style={styles.doneBlock}>
            <Text style={styles.doneTitle} accessibilityRole="header">{t('breakDoneTitle')}</Text>
            {intent === 'unsure'
              ? <Text style={styles.doneBody}>{fill(t('breakNudgeUnsure'), { app: appLabel })}</Text>
              : settings.reflection
                ? <Text style={styles.reflection}>{reflectionForDay(language)}</Text>
                : <Text style={styles.doneBody}>{t('breakDoneBody')}</Text>}
            {/* One tap, optional: how do you feel now? Stored as a count, and read by the coach. */}
            <View style={styles.moodRow} accessibilityLabel={t('breakMoodQ')}>
              {MOODS.map(m => (
                <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: mood === m }}
                  accessibilityLabel={`${t('breakMoodQ')} ${m}/5`}
                  onPress={() => { haptics.selection(); setMood(mood === m ? undefined : m); }}
                  style={[styles.moodBtn, mood === m && styles.moodOn]}>
                  <Text style={{ fontSize: 20 }}>{['😞', '🙁', '😐', '🙂', '😄'][m - 1]}</Text>
                </Pressable>
              ))}
            </View>
            {!preview && xpNext > 0 && <Text style={styles.xp}>{fill(t('breakXpNext'), { n: xpNext })}</Text>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => finish('stay')}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
              <Text style={styles.btnPrimaryText}>{t('breakStay')}</Text>
            </Pressable>
            {(fromOtherApp || params.source === 'ios') && (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => finish('exit')}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
                <Text style={styles.btnGhostText}>{appLabel ? fill(t('breakExitTo'), { app: appLabel }) : t('breakExit')}</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {stage === 'choose' && iosNote && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.doneBlock}>
            <Text style={styles.doneTitle}>{t('breakDoneTitle')}</Text>
            <Text style={styles.doneBody}>{t('breakExitNoteIos')}</Text>
            <Pressable accessibilityRole="button" onPress={leave} style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>{t('breakGotIt')}</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// Press and hold for 3 seconds. A tap does nothing, so it can't be hit by accident
// with eyes closed. Screen-reader users get a plain "activate" action instead.
function PassHold({ t, left, busy, onDone }: { t: (k: string) => string; left: number; busy: boolean; onDone: () => void }) {
  const fillAmount = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    if (ticker.current) clearInterval(ticker.current);
    timer.current = null; ticker.current = null;
  };
  useEffect(() => clear, []);

  const bar = useAnimatedStyle(() => ({ width: `${fillAmount.value * 100}%` }));

  if (left <= 0) {
    return <Text style={styles.passNone}>{t('breakPassNone')}</Text>;
  }

  const start = () => {
    if (busy) return;
    fillAmount.value = 0;
    fillAmount.value = withTiming(1, { duration: PASS_HOLD_MS, easing: Easing.linear });
    haptics.selection();
    ticker.current = setInterval(() => haptics.selection(), 1000);
    timer.current = setTimeout(() => { clear(); onDone(); }, PASS_HOLD_MS);
  };
  const cancel = () => {
    clear();
    fillAmount.value = withTiming(0, { duration: 180 });
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${t('breakPassLabel')}. ${fillN(t('breakPassLeft'), left)}`}
      accessibilityHint={t('breakPassHold')}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => onDone()}
      style={styles.pass}>
      <Animated.View style={[styles.passFill, bar]} />
      <Text style={styles.passText}>{t('breakPassLabel')} · {fillN(t('breakPassLeft'), left)}</Text>
      <Text style={styles.passHint}>{t('breakPassHold')}</Text>
    </Pressable>
  );
}

const fillN = (s: string, n: number) => fill(s, { n });

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  top: { alignItems: 'center', gap: spacing.xs, width: '100%' },
  eyebrow: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.6, color: MUTED },
  from: { fontFamily: fontFamily.sans, fontSize: 13, color: MUTED, textAlign: 'center' },
  soundBtn: { position: 'absolute', right: 0, top: -4, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  soundGlyph: { fontSize: 18, opacity: 0.8 },
  eyeWrap: { alignItems: 'center', justifyContent: 'center', height: 96 },
  eyeGlow: { position: 'absolute', width: 150, height: 90, borderRadius: 75, backgroundColor: 'rgba(45, 212, 191, 0.14)' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', width: ORB, height: ORB },
  halo: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, backgroundColor: 'rgba(45, 212, 191, 0.5)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  phase: { fontFamily: fontFamily.serif, fontSize: 30, lineHeight: 36, color: TEXT, textAlign: 'center', paddingHorizontal: spacing.lg },
  bottom: { minHeight: 200, alignItems: 'center', justifyContent: 'flex-start', width: '100%' },
  hint: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center', maxWidth: 300 },
  count: { fontFamily: fontFamily.sansBlack, fontSize: 44, color: 'rgba(242,247,245,0.62)', marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, width: '100%' },
  gridBtn: { flexGrow: 1, flexBasis: '47%', minHeight: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  gridText: { fontFamily: fontFamily.sansSemi, fontSize: 14, color: TEXT, textAlign: 'center' },
  reflection: { fontFamily: fontFamily.serif, fontSize: 18, lineHeight: 26, color: TEXT, textAlign: 'center', fontStyle: 'italic', marginBottom: spacing.xs },
  moodRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  moodBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(242,247,245,0.18)', alignItems: 'center', justifyContent: 'center' },
  moodOn: { borderColor: ACCENT, backgroundColor: 'rgba(0,200,5,0.16)' },
  xp: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 0.4, color: ACCENT },
  doneBlock: { width: '100%', maxWidth: 360, alignItems: 'center', gap: spacing.md },
  doneTitle: { fontFamily: fontFamily.serif, fontSize: 26, color: TEXT, textAlign: 'center' },
  doneBody: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center', marginBottom: spacing.sm },
  btn: { width: '100%', height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: 16, color: '#031006' },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(242,247,245,0.28)' },
  btnGhostText: { fontFamily: fontFamily.sansSemi, fontSize: 16, color: TEXT },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  pass: {
    marginTop: spacing.lg, width: '100%', maxWidth: 300, minHeight: 56, borderRadius: radius.pill, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(242,247,245,0.18)', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm,
  },
  passFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(242,247,245,0.14)' },
  passText: { fontFamily: fontFamily.sansSemi, fontSize: 13, color: MUTED },
  passHint: { fontFamily: fontFamily.sans, fontSize: 11, color: MUTED, marginTop: 2 },
  passNone: { marginTop: spacing.lg, fontFamily: fontFamily.sans, fontSize: 12, color: MUTED, textAlign: 'center' },
  strictBody: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  lock: { fontSize: 44 },
  strictClock: { fontFamily: fontFamily.sansBlack, fontSize: 56, color: TEXT },
});
