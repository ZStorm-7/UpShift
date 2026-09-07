// UpShift shared UI kit.
//
// Every screen builds out of these, which is the whole point: the Dashboard
// and the Leaderboard should look like two rooms in one building, not two
// buildings. Anything visual that appears on more than one screen belongs
// here rather than in a screen's local StyleSheet.
//
// Deliberately plain React Native — no component-library dependency. The app
// already had a distinct dark look, and adopting a Material component set
// would have meant fighting its defaults on every screen for styling we can
// express directly in a few dozen lines. (Icons are the one exception:
// @expo/vector-icons' Ionicons replaced this kit's old emoji placeholders —
// an emoji renders differently per OS/font and reads as a stand-in rather
// than a designed glyph, where a vector icon set is consistent and themeable.)

import { ReactNode, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  TextInput,
  ViewStyle,
  TextStyle,
  StyleProp,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { usePalette } from '../theme/themedColors';
import { spacing, radius, type, layout, elevation } from '../theme/tokens';
import { fontFamily } from '../theme/fonts';
import { duration, beat, PRESS_SCALE } from '../animation/motion';

// The app's one curve, expressed for React Native's legacy Animated API.
// `animation/motion.ts` exports it as a Reanimated easing, which the modern
// components use; these older kit pieces still run on Animated, and the two
// have separate Easing implementations. Same four control points either way,
// so a Button and a PressableScale compress identically.
const pressEasing = Easing.bezier(0.16, 1, 0.3, 1);

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * The outermost wrapper for every screen. Owns the background colour and the
 * horizontal gutter so no screen has to remember them, which is what kept the
 * gutters from matching before.
 */
export function Screen({ children, scroll = false, style, contentStyle }: ScreenProps) {
  const palette = usePalette();
  // Every screen in the app renders through here, so this one hook is what
  // keeps content out from under the status bar / notch and the home
  // indicator — on the SE (no notch, 20pt status bar) as well as on the
  // notched phones, since the inset is reported per-device rather than
  // guessed at with a hardcoded number.
  const insets = useSafeAreaInsets();
  if (scroll) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.bg, paddingTop: insets.top }, style]}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            // The scroll view's own content clears the home indicator; the
            // bottomInset token already reserves room for the floating AI
            // button, so this only adds what the device actually needs.
            { paddingBottom: layout.bottomInset + insets.bottom },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg, paddingTop: insets.top, paddingBottom: insets.bottom },
        styles.screenPadded,
        style,
      ]}>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * AppBar
 * ------------------------------------------------------------------ */

type AppBarProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
};

/** Consistent header. A screen with a back arrow and a screen without one
 *  still put their title on the same baseline, so navigating doesn't make the
 *  title jump. */
export function AppBar({ title, subtitle, onBack, right }: AppBarProps) {
  const palette = usePalette();
  return (
    <View style={styles.appBar}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          // The visible glyph is '‹', which a screen reader reads as a stray
          // punctuation mark or skips entirely. Every screen in the app gets
          // its back button from here, so naming it once fixes it everywhere.
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.backGlyph, { color: palette.textPrimary }]} accessible={false}>
            ‹
          </Text>
        </Pressable>
      ) : (
        <View style={styles.backSpacer} />
      )}

      <View style={styles.appBarTitles}>
        <Text style={[styles.appBarTitle, { color: palette.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[styles.appBarSubtitle, { color: palette.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.appBarRight}>{right}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  raised?: boolean;
  /** Tints the border — used to mark a card as complete, overdue, etc. */
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Required whenever `onPress` is set. A card's accessible name can't be
   *  inferred the way a Button's can — its content is arbitrary children, so
   *  without this a screen reader announces the whole card body as one run-on
   *  string, or nothing at all. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link' | 'radio' | 'checkbox';
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
};

/** The single container primitive. If something on any screen sits in a box,
 *  it should be this box. */
export function Card({
  children,
  onPress,
  raised,
  accentColor,
  style,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
}: CardProps) {
  const palette = usePalette();
  // Replaces the old static `elevation.raised`/`elevation.flat` tokens
  // (theme/tokens.ts), which baked colors.surface/border in at module
  // load and never changed with the light/dark toggle.
  const elevationStyle = raised
    ? { backgroundColor: palette.surfaceRaised, borderWidth: layout.hairline, borderColor: palette.borderStrong }
    : { backgroundColor: palette.surface, borderWidth: layout.hairline, borderColor: palette.border };
  const base = [
    styles.card,
    elevationStyle,
    accentColor ? { borderColor: accentColor } : null,
    style,
  ];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * Section header
 * ------------------------------------------------------------------ */

/** Small uppercase label that introduces a group of cards. Optional trailing
 *  slot for a count or a "See all" action. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>{children}</Text>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Meter
 * ------------------------------------------------------------------ */

type MeterProps = {
  /** 0–1. Clamped, so a value over goal fills the bar instead of overflowing
   *  the container — the stored number stays truthful, only the bar caps. */
  progress: number;
  color?: string;
  height?: number;
  /** Animates from the previous value when true. */
  animated?: boolean;
};

export function Meter({ progress, color, height = 8, animated = true }: MeterProps) {
  const palette = usePalette();
  const resolvedColor = color ?? palette.accent;
  const clamped = Math.max(0, Math.min(1, isFinite(progress) ? progress : 0));
  const width = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (!animated) {
      width.setValue(clamped);
      return;
    }
    Animated.timing(width, {
      toValue: clamped,
      duration: beat.xpBar,
      easing: pressEasing,
      useNativeDriver: false,
    }).start();
  }, [clamped, animated]);

  const widthPercent = width.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[
      styles.meterTrack,
      { height, borderRadius: height / 2, backgroundColor: palette.surfaceSunken, borderColor: palette.border },
    ]}>
      <Animated.View
        style={[
          styles.meterFill,
          { width: widthPercent, backgroundColor: resolvedColor, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Pill
 * ------------------------------------------------------------------ */

type PillProps = {
  label: string;
  color?: string;
  /** Filled reads as a status; outlined reads as a category. */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Pill({ label, color, filled = false, style }: PillProps) {
  const palette = usePalette();
  const resolvedColor = color ?? palette.accent;
  return (
    <View
      style={[
        styles.pill,
        filled
          ? { backgroundColor: resolvedColor, borderColor: resolvedColor }
          : { backgroundColor: 'transparent', borderColor: resolvedColor },
        style,
      ]}>
      <Text
        style={[styles.pillText, { color: filled ? palette.textOnAccent : resolvedColor }]}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * A soft ambient glow that breathes behind the button — Jitter's "Glow
   * Button" reference, adapted to this kit's flat-pill shape instead of
   * copied wholesale. Reserve this for the one action on a screen that
   * matters most (subscribing, resubscribing after a lapse) — a glow on
   * every button would just be visual noise competing with itself.
   */
  glow?: boolean;
  /** Defaults to the label. Worth overriding when the visible label is a
   *  transient state ("Please wait…") and the control's identity is not — a
   *  button whose announced name changes mid-action reads to a screen-reader
   *  user as a different button appearing. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** `busy` while the action this button started is still in flight. */
  accessibilityState?: { disabled?: boolean; busy?: boolean; selected?: boolean };
};

/**
 * Presses scale to the app's one press scale. It's a small thing, but a button
 * that doesn't acknowledge the touch is the single most common reason an app
 * feels dead.
 *
 * Timing, not spring. This used to be `Animated.spring(..., bounciness: 4)`,
 * which put a bounce on the most-pressed surface in the app while the design
 * language says the quest tick's 1.14 scale is the only overshoot there is —
 * so the single most repeated motion in the product was also the one most
 * often contradicting the rule.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  fullWidth,
  style,
  glow,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: ButtonProps) {
  const palette = usePalette();
  const scale = useRef(new Animated.Value(1)).current;
  // A slow breathe, not a strobe — the same "read as a heartbeat, not an
  // alarm" reasoning `PulseRing` uses (components/anim.tsx), since this may
  // sit on screen for as long as the user leaves the paywall open.
  const glowPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!glow || disabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: beat.pulseLoop,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: beat.pulseLoop,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow, disabled]);

  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: duration.instant,
      easing: pressEasing,
      useNativeDriver: true,
    }).start();

  const variantStyle: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: palette.accent, borderColor: palette.accent }
      : variant === 'secondary'
      ? { backgroundColor: palette.surfaceRaised, borderColor: palette.borderStrong }
      : variant === 'danger'
      ? { backgroundColor: palette.dangerSoft, borderColor: palette.danger }
      : { backgroundColor: 'transparent', borderColor: 'transparent' };

  const labelColor =
    variant === 'primary'
      ? palette.textOnAccent
      : variant === 'danger'
      ? palette.danger
      : variant === 'ghost'
      ? palette.textSecondary
      : palette.textPrimary;

  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.08] });

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        fullWidth ? styles.buttonFull : null,
        style,
      ]}>
      {glow && !disabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.buttonGlow,
            size === 'sm' ? styles.buttonGlowSm : styles.buttonGlowMd,
            {
              backgroundColor: palette.accent,
              shadowColor: palette.accent,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
      )}
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => !disabled && animateTo(PRESS_SCALE)}
        onPressOut={() => !disabled && animateTo(1)}
        accessibilityRole="button"
        // The label is already the button's only content, so naming it here
        // costs nothing and means no screen in the app can ship a button that
        // announces as "button" and nothing else.
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
        style={[
          styles.button,
          size === 'sm' ? styles.buttonSm : styles.buttonMd,
          variantStyle,
          disabled && styles.buttonDisabled,
        ]}>
        <Text
          style={[
            styles.buttonLabel,
            size === 'sm' && styles.buttonLabelSm,
            { color: labelColor },
          ]}
          numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Field
 * ------------------------------------------------------------------ */

type FieldProps = {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'decimal-pad';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  error?: string;
  style?: StyleProp<ViewStyle>;
  // Pass-throughs to the underlying TextInput. Purely behavioural props that
  // the kit has no opinion about — they exist so a screen can adopt Field
  // without losing a character cap or a keyboard-submit handler it already
  // relied on.
  maxLength?: number;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  // Credential autofill. Both platforms need telling separately — Android reads
  // `autoComplete`, iOS reads `textContentType` — and a field that declares
  // neither gets no keychain suggestion and, worse, gets iOS's generic "strong
  // password" sheet on the wrong input.
  autoComplete?: 'email' | 'username' | 'password' | 'new-password' | 'off';
  textContentType?: 'emailAddress' | 'username' | 'password' | 'newPassword' | 'none';
  autoCorrect?: boolean;
  blurOnSubmit?: boolean;
  /** Overrides the announced name. Defaults to `label`, which is what ties the
   *  input to the words printed above it — without that, a screen reader
   *  reaches a numeric box and can only say "text field, 5". */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** Labelled text input. Bundling the label with the input is what keeps
 *  label-to-field spacing identical on Auth, Onboarding and Edit Profile. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  secureTextEntry,
  autoCapitalize = 'none',
  error,
  style,
  maxLength,
  onSubmitEditing,
  returnKeyType,
  autoComplete,
  textContentType,
  autoCorrect,
  blurOnSubmit,
  accessibilityLabel,
  accessibilityHint,
}: FieldProps) {
  const palette = usePalette();
  return (
    <View style={[styles.field, style]}>
      {!!label && <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>{label}</Text>}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        // A red border is invisible to a screen reader; the invalid state has
        // to be announced as state, not drawn.
        accessibilityState={{ invalid: !!error } as any}
        style={[
          styles.input,
          { backgroundColor: palette.surface, borderColor: palette.border, color: palette.textPrimary },
          !!error && { borderColor: palette.danger },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textMuted}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={autoCorrect}
        blurOnSubmit={blurOnSubmit}
      />
      {!!error && <Text style={[styles.fieldError, { color: palette.danger }]}>{error}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * StatTile
 * ------------------------------------------------------------------ */

type StatTileProps = {
  icon: string;
  value: string;
  label: string;
  /** Draws a thin meter under the value when supplied. */
  progress?: number;
  color?: string;
  onPress?: () => void;
};

/** The repeated "one number, one word" tile used across Dashboard and
 *  History. Values are always printed as text, never conveyed by colour
 *  alone. */
export function StatTile({ icon, value, label, progress, color, onPress }: StatTileProps) {
  const palette = usePalette();
  const resolvedColor = color ?? palette.accent;
  return (
    <Card
      onPress={onPress}
      // Icon, value and label are three separate Text nodes, so without a
      // composed name a screen reader reads "flame, 1,840, Calories" as three
      // unrelated fragments. The icon is decorative and stays out of it.
      accessibilityLabel={`${label}: ${value}`}
      style={styles.statTile}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color: resolvedColor }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: palette.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      {progress !== undefined && (
        <View style={styles.statMeter}>
          <Meter progress={progress} color={resolvedColor} height={4} />
        </View>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * EmptyState
 * ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={palette.textMuted} />
      <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>{title}</Text>
      {!!message && <Text style={[styles.emptyMessage, { color: palette.textSecondary }]}>{message}</Text>}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * FadeIn
 * ------------------------------------------------------------------ */

/** Fades and lifts children on mount. `delay` staggers a list so items
 *  arrive in sequence rather than all at once. */
export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: beat.dashboardEnter,
        delay,
        easing: pressEasing,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: beat.dashboardEnter,
        delay,
        easing: pressEasing,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * Divider
 * ------------------------------------------------------------------ */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  return <View style={[styles.divider, { backgroundColor: palette.divider }, style]} />;
}

/* ------------------------------------------------------------------ *
 * Shared text styles, exported so screens don't re-declare them
 * ------------------------------------------------------------------ */

export const text = StyleSheet.create({
  display: { ...type.display, color: colors.textPrimary },
  title: { ...type.title, color: colors.textPrimary },
  heading: { ...type.heading, color: colors.textPrimary },
  body: { ...type.body, color: colors.textPrimary },
  bodySecondary: { ...type.body, color: colors.textSecondary },
  small: { ...type.bodySm, color: colors.textSecondary },
  muted: { ...type.bodySm, color: colors.textMuted },
  metric: { ...type.metric, color: colors.textPrimary },
  label: { ...type.label, color: colors.textMuted, textTransform: 'uppercase' as const },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenPadded: {
    paddingHorizontal: layout.screenPadding,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: layout.bottomInset,
  },

  appBar: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  backSpacer: {
    width: 0,
  },
  backGlyph: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 26,
    marginTop: -2,
  },
  appBarTitles: {
    flex: 1,
  },
  appBarTitle: {
    ...type.heading,
    color: colors.textPrimary,
  },
  appBarSubtitle: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.75,
  },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  meterTrack: {
    width: '100%',
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  meterFill: {
    height: '100%',
  },

  pill: {
    borderWidth: layout.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: {
    ...type.label,
    textTransform: 'uppercase',
  },

  button: {
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMd: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  buttonSm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  buttonFull: {
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    fontSize: 15,
    fontFamily: fontFamily.sansBold,
  },
  buttonLabelSm: {
    fontSize: 13,
  },
  // Sits behind the pill, larger and blurred-looking via a big shadow radius
  // plus a filled, low-opacity core — a cheap approximation of a true blur
  // that still reads as an ambient glow rather than a hard-edged shape.
  buttonGlow: {
    position: 'absolute',
    borderRadius: radius.md,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.9,
    elevation: 0,
  },
  buttonGlowMd: {
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
  },
  buttonGlowSm: {
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
  },

  field: {
    gap: spacing.xs + 2,
  },
  fieldLabel: {
    ...type.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.textPrimary,
    fontSize: 15,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldError: {
    ...type.bodySm,
    color: colors.danger,
  },

  statTile: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIcon: {
    fontSize: 18,
  },
  statValue: {
    ...type.metric,
  },
  statLabel: {
    ...type.bodySm,
    color: colors.textMuted,
  },
  statMeter: {
    width: '100%',
    marginTop: spacing.xs,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...type.heading,
    color: colors.textPrimary,
  },
  emptyMessage: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  divider: {
    height: layout.hairline,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
});
