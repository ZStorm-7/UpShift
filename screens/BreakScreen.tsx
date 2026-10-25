// The 15-second mindful break.
//
// Designed to work with the EYES CLOSED, because the point is to rest them:
//   * an eye on screen closes first and stays closed, which is the cue to close yours
//   * a soft haptic marks every phase and ticks each second of breathing, so
//     nothing needs looking at
//   * only when the eye opens again does the screen ask for attention
//
// It is deliberately a dark, low-stimulation screen (not the app's light/dark
// theme): a bright flash after closing your eyes would defeat the purpose.
//
// The break is mandatory: the back gesture and Android back are blocked until
// the 15 seconds are done, and leaving the app mid-exercise restarts it.

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TOTAL_MS, SCALE_MIN, PhaseId, phaseAt, scaleAt, eyeOpenAt, PHASE_HAPTIC } from '../services/breaks/timeline';

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

const PHASE_KEY: Record<PhaseId, string> = {
  close: 'breakCloseEyes', in: 'breakIn', hold: 'breakHold', out: 'breakOut', open: 'breakOpenEyes', done: 'breakDoneTitle',
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
  const { t } = useLanguage();
  const { profile } = useUser();
  const { setBreakActive, completeBreak, appReady } = useBreak();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();

  const params = (route?.params ?? {}) as { pkg?: string; label?: string };
  const appLabel = params.label || '';

  const progress = useSharedValue(0); // elapsed ms, driven on the UI thread
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState(0); // bumps when the exercise restarts
  const [iosNote, setIosNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowLeave = useRef(false);
  const lastPhase = useRef<PhaseId | null>(null);
  const lastSecond = useRef(-1);

  const phase = phaseAt(elapsed);
  const done = phase.id === 'done';

  // ---- lifecycle: mark the break active, silence audio, run the clock ----
  useEffect(() => {
    setBreakActive(true);
    stopSpeaking();
    return () => setBreakActive(false);
  }, [setBreakActive]);

  // The clock starts only once the app's splash has gone, so a break that opens
  // on a cold start doesn't spend its first seconds behind the logo.
  useEffect(() => {
    if (!appReady) return;
    startedAt.current = Date.now();
    lastPhase.current = null;
    lastSecond.current = -1;
    setElapsed(0);
    progress.value = 0;
    progress.value = withTiming(TOTAL_MS, { duration: TOTAL_MS, easing: Easing.linear });
    const id = setInterval(() => setElapsed(Math.min(TOTAL_MS, Date.now() - startedAt.current)), 100);
    return () => { clearInterval(id); cancelAnimation(progress); };
  }, [round, progress, appReady]);

  // Leaving the app mid-exercise doesn't count: start again when they return.
  // (Only a real trip to the background; pulling down the notification shade
  // reports 'inactive' and shouldn't punish anyone.)
  const wasAway = useRef(false);
  const doneRef = useRef(false);
  doneRef.current = done;
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background' && !allowLeave.current && !doneRef.current) wasAway.current = true;
      if (s === 'active' && wasAway.current) { wasAway.current = false; setRound(r => r + 1); }
    });
    return () => sub.remove();
  }, []);

  // Block back / swipe until the exercise is finished.
  useEffect(() => navigation.addListener('beforeRemove', (e: any) => {
    if (!allowLeave.current) e.preventDefault();
  }), [navigation]);

  // ---- feedback: a haptic per phase, a tick each second of breathing, a spoken cue ----
  useEffect(() => {
    if (lastPhase.current !== phase.id) {
      lastPhase.current = phase.id;
      const kind = PHASE_HAPTIC[phase.id];
      if (kind === 'done') haptics.setComplete(); else haptics.selection();
      AccessibilityInfo.announceForAccessibility?.(t(PHASE_KEY[phase.id]));
    }
    const sec = Math.floor(elapsed / 1000);
    if (sec !== lastSecond.current) {
      lastSecond.current = sec;
      if (phase.id === 'in' || phase.id === 'out') haptics.selection();
    }
  }, [elapsed, phase.id, t]);

  // ---- animation (all on the UI thread, driven by `progress`) ----
  const eyeProps = useAnimatedProps(() => ({ d: eyePath(eyeOpenAt(progress.value)) }));
  const irisProps = useAnimatedProps(() => {
    const o = eyeOpenAt(progress.value);
    return { r: 14 * o, fillOpacity: o };
  });
  const lashProps = useAnimatedProps(() => ({ opacity: 1 - eyeOpenAt(progress.value) }));
  const eyeGlow = useAnimatedStyle(() => ({ opacity: (1 - eyeOpenAt(progress.value)) * 0.9 }));

  const orbStyle = useAnimatedStyle(() => {
    const s = reduced ? 0.8 : scaleAt(progress.value);
    return { transform: [{ scale: s }], opacity: 0.55 + 0.45 * ((s - SCALE_MIN) / (1 - SCALE_MIN)) };
  });
  const haloStyle = useAnimatedStyle(() => {
    const s = reduced ? 0.9 : SCALE_MIN + (scaleAt(progress.value) - SCALE_MIN) * 1.28;
    return { transform: [{ scale: s * 1.06 }], opacity: 0.12 + 0.18 * ((s - SCALE_MIN) / (1.28 - SCALE_MIN)) };
  });
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - Math.min(1, progress.value / TOTAL_MS)) }));

  // ---- leaving ----
  const leave = useCallback(() => {
    allowLeave.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: profile ? 'Dashboard' : 'Welcome' }] });
  }, [navigation, profile]);

  async function onStay() {
    if (busy) return;
    setBusy(true);
    await completeBreak();
    leave();
  }

  async function onExit() {
    if (busy) return;
    setBusy(true);
    await completeBreak();
    const result = await exitToPreviousApp(params.pkg);
    if (result === 'unsupported') { setIosNote(true); setBusy(false); return; }
    leave();
  }

  const secondsLeft = Math.max(0, Math.ceil((TOTAL_MS - elapsed) / 1000));
  const compact = height < 700;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
      accessibilityViewIsModal>
      <StatusBar style="light" />

      <View style={styles.top}>
        <Text style={styles.eyebrow}>{t('breakEyebrow')}</Text>
        {!!appLabel && <Text style={styles.from}>{fill(t('breakFrom'), { app: appLabel })}</Text>}
      </View>

      {/* The eye: closes first, opens last. */}
      <View style={styles.eyeWrap} accessible accessibilityLabel={t(PHASE_KEY[phase.id])}>
        <Animated.View style={[styles.eyeGlow, eyeGlow]} pointerEvents="none" />
        <Svg width={compact ? 96 : 132} height={compact ? 64 : 88} viewBox="0 0 120 80">
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
      <View style={[styles.stage, { width: ORB + 40, height: ORB + 40 }]}>
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
            <Animated.Text key={phase.id} entering={FadeIn.duration(420)} exiting={FadeOut.duration(240)}
              style={styles.phase} accessibilityLiveRegion="polite">
              {t(PHASE_KEY[phase.id])}
            </Animated.Text>
          )}
        </View>
      </View>

      {/* Below the orb: a quiet hint while breathing, the choices when done. */}
      <View style={styles.bottom}>
        {!done ? (
          <>
            <Text style={styles.hint}>{t('breakSubtitle')}</Text>
            <Text style={styles.count} accessibilityElementsHidden importantForAccessibility="no">{secondsLeft}</Text>
          </>
        ) : iosNote ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.doneBlock}>
            <Text style={styles.doneTitle}>{t('breakDoneTitle')}</Text>
            <Text style={styles.doneBody}>{t('breakExitNoteIos')}</Text>
            <Pressable accessibilityRole="button" onPress={leave} style={[styles.btn, styles.btnPrimary]}>
              <Text style={styles.btnPrimaryText}>{t('breakGotIt')}</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(500)} style={styles.doneBlock}>
            <Text style={styles.doneTitle} accessibilityRole="header">{t('breakDoneTitle')}</Text>
            <Text style={styles.doneBody}>{t('breakDoneBody')}</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onStay}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
              <Text style={styles.btnPrimaryText}>{t('breakStay')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={onExit}
              style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
              <Text style={styles.btnGhostText}>{appLabel ? fill(t('breakExitTo'), { app: appLabel }) : t('breakExit')}</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  top: { alignItems: 'center', gap: spacing.xs },
  eyebrow: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.6, color: MUTED },
  from: { fontFamily: fontFamily.sans, fontSize: 13, color: MUTED, textAlign: 'center' },
  eyeWrap: { alignItems: 'center', justifyContent: 'center', height: 96 },
  eyeGlow: { position: 'absolute', width: 150, height: 90, borderRadius: 75, backgroundColor: 'rgba(45, 212, 191, 0.14)' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  orb: { position: 'absolute', width: ORB, height: ORB },
  halo: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, backgroundColor: 'rgba(45, 212, 191, 0.5)' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  phase: { fontFamily: fontFamily.serif, fontSize: 30, lineHeight: 36, color: TEXT, textAlign: 'center', paddingHorizontal: spacing.lg },
  bottom: { minHeight: 200, alignItems: 'center', justifyContent: 'flex-start', width: '100%' },
  hint: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center', maxWidth: 300 },
  count: { fontFamily: fontFamily.sansBlack, fontSize: 44, color: 'rgba(242,247,245,0.20)', marginTop: spacing.lg, fontVariant: ['tabular-nums'] },
  doneBlock: { width: '100%', maxWidth: 360, alignItems: 'center', gap: spacing.md },
  doneTitle: { fontFamily: fontFamily.serif, fontSize: 26, color: TEXT, textAlign: 'center' },
  doneBody: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 22, color: MUTED, textAlign: 'center', marginBottom: spacing.sm },
  btn: { width: '100%', height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: ACCENT },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: 16, color: '#031006' },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(242,247,245,0.28)' },
  btnGhostText: { fontFamily: fontFamily.sansSemi, fontSize: 16, color: TEXT },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
});
