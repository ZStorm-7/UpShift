// UpShift motion system — "weight, not bounce".
//
// The governing rule, and the reason this file is short: EVERYTHING uses one
// curve. cubic-bezier(0.16, 1, 0.3, 1) over 320–440ms. Things arrive like they
// have mass and stop without wobbling.
//
// This replaces the earlier spring-based system. Springs were removed on
// purpose. A spring is a physical simulation with overshoot baked in, and
// overshoot is a reward the eye spends on every button press — which means by
// the time something genuinely worth celebrating happens (a level-up), the
// user has already seen that motion two hundred times and it reads as
// ordinary. Removing bounce from the ordinary case is what buys the
// celebration its impact.
//
// The one exception is the quest tick's 1.14 scale pop. That single overshoot
// IS the reward for completing a quest, so nothing else gets one.

import { Easing } from 'react-native-reanimated';

/* ------------------------------------------------------------------ *
 * The one curve
 * ------------------------------------------------------------------ */

/**
 * cubic-bezier(0.16, 1, 0.3, 1).
 *
 * Leaves fast, decelerates hard, arrives without overshooting. Every
 * entrance, exit, transition and fill in the app uses this. If you are
 * reaching for a different curve, the answer is almost always a different
 * DURATION with this curve instead.
 */
export const CURVE = Easing.bezier(0.16, 1, 0.3, 1);

/* ------------------------------------------------------------------ *
 * Durations
 * ------------------------------------------------------------------ */

/**
 * The three tiers from the design, plus the named steps the rest of the app
 * imports. Nothing here is arbitrary — each value is a row in the animation
 * inventory.
 */
export const duration = {
  /** Tap feedback. Anything slower reads as lag rather than response. */
  instant: 180,
  /** Small state changes: a set marking complete, a chip toggling. */
  fast: 300,
  /** THE standard. Entrances, transitions, fills. */
  base: 380,
  /** Heavier arrivals — a bar filling, a card of real content landing. */
  slow: 520,
  /** Long single moves: the calorie ring drawing itself on first load. */
  cinematic: 940,
};

/**
 * Named beats from the animation inventory. Screens should pull from here
 * rather than typing a number, so retiming the app is one edit.
 */
export const beat = {
  /** Dashboard content arriving, 60ms apart per row. */
  dashboardEnter: 400,
  dashboardStagger: 60,
  /** Skeleton sweep while Firestore is in flight. */
  skeletonLoop: 1150,
  /** Push/pop between screens. Fade only — no horizontal slide, because the
   *  app is a hub, not a drill-down. */
  screenTransition: 380,
  /** Quest checkbox: box scales past to 1.14, checkmark strokes in over the
   *  back half, row desaturates and strikes through. */
  questTick: 340,
  questTickScale: 1.14,
  /** "+30 XP" floating up off the quest row and fading. */
  xpMote: 780,
  xpMoteRise: 34,
  /** XP bar width transition. Not a keyframe — interrupted increments
   *  retarget from where they are instead of restarting. */
  xpBar: 520,
  /** XP numeral counting. Lands on the exact value, never a straight
   *  interval. */
  xpCounter: 600,
  /** Calorie ring drawing to today's value once per mount. Slowest thing in
   *  the app on purpose — it's the headline. */
  ringFill: 940,
  ringDelay: 220,
  /** Set checkbox left to right, progress bar retargets. */
  setComplete: 300,
  /** Sync spinner. Only for genuinely indeterminate waits. */
  syncLoop: 900,
  /** The attention pulse — a slow expanding ring on something waiting for the
   *  user. Deliberately the longest loop in the file: it may sit on screen for
   *  minutes, and at this length it reads as a heartbeat you can ignore rather
   *  than an alarm. `pulseRest` is the pause at full before it restarts;
   *  without it the ring re-triggers on the same frame it finishes and
   *  strobes. */
  pulseLoop: 1600,
  pulseRest: 400,
};

/**
 * The level-up takeover, 2.5s end to end. `at` values are DELAYS from the
 * start of the sequence; each step's own length is in `dur`.
 *
 * The steps OVERLAP, and they have to. Run them strictly back to back and
 * 620 + 700 + 800 + 900 is 3,020ms — half a second over the budget, which
 * means the rank name gets cut off by the auto-dismiss. Starting each step
 * before the previous one finishes keeps every duration the design asked for
 * AND lands the last one exactly on 2,300ms, leaving 200ms for the scrim to
 * fade out. The invariant to preserve when editing: every
 * `at.x + dur.x` must be <= `total`.
 */
export const levelUp = {
  total: 2500,
  at: { ring: 0, rays: 500, numeral: 900, rankName: 1400 },
  dur: { ring: 620, rays: 700, numeral: 800, rankName: 900 },
  /** When the scrim starts fading out. Everything else has landed by here. */
  outAt: 2300,
};

/**
 * The workout summary payoff, 1.43s end to end. Same shape as `levelUp`: `at`
 * values are DELAYS from the start of the sequence, `dur` is each step's own
 * length, and the invariant to preserve is that every `at.x + dur.x` (plus the
 * stat row's own stagger) stays <= `total`.
 *
 * It lives here rather than in the screen because the pacing is a
 * RELATIONSHIP — headline, then XP, then the stats, then the way out — and
 * retiming it means moving these together, which is only possible if they sit
 * together.
 *
 * The medal gets the longest step and the biggest scale distance because it is
 * the most prominent arrival on the screen. It earns that with weight, not
 * with a bounce: the only overshoot in the app is the quest tick.
 */
export const summary = {
  total: 1430,
  at: { medal: 0, headline: 220, xp: 420, stats: 700, action: 1050 },
  dur: {
    medal: duration.slow,
    headline: duration.base,
    xp: duration.base,
    stats: duration.base,
    action: duration.base,
  },
  /** Stat tiles assemble left to right inside their own beat. */
  statStagger: beat.dashboardStagger,
  /** Scale the medal grows from. Far enough to read as an arrival on its own,
   *  without ever passing 1. */
  medalFrom: 0.6,
  /** Half-period of the breathing glow behind a perfect session's medal. Slow
   *  enough to read as a heartbeat rather than a blink. */
  glowBreath: 1400,
};

/**
 * Splash sequence, 1.7s — cut short if cold start is already slow.
 */
export const splash = {
  total: 1700,
  at: { mark: 0, wordmark: 820, hairline: 1080 },
  dur: { mark: 780, wordmark: 480, hairline: 420 },
};

/* ------------------------------------------------------------------ *
 * Easing
 * ------------------------------------------------------------------ */

/**
 * Every key is the same curve. That is not an oversight — the keys exist so
 * call sites stay readable ("this is an entrance") and so existing imports
 * across the app keep working, but they all resolve to CURVE.
 *
 * `loop` is the one genuine exception: a repeating animation eased with CURVE
 * has a visible seam where it snaps back to the start, so continuous loops
 * use a symmetric in-out.
 */
export const easing = {
  standard: CURVE,
  revUp: CURVE,
  enter: CURVE,
  exit: CURVE,
  loop: Easing.inOut(Easing.cubic),
};

/* ------------------------------------------------------------------ *
 * Press feedback
 * ------------------------------------------------------------------ */

/** Scale a pressed surface compresses to. One value, every surface. */
export const PRESS_SCALE = 0.965;

/**
 * Kept only so the handful of files still calling `withSpring(x, spring.y)`
 * keep compiling. These are deliberately over-damped — a spring at damping 40
 * / stiffness 300 settles in roughly the same time as CURVE and does not
 * overshoot, so callers that haven't migrated still look like the rest of the
 * app.
 *
 * New code should not use these. Use `withTiming(x, { duration, easing:
 * easing.standard })`.
 *
 * @deprecated Use timing with `easing.standard`.
 */
export const spring = {
  press: { damping: 40, stiffness: 340, mass: 0.7 },
  release: { damping: 40, stiffness: 300, mass: 0.8 },
  settle: { damping: 42, stiffness: 260, mass: 1 },
  /** The lone survivor with any overshoot, and only because the quest tick
   *  needs one. Still far tamer than the old pop. */
  pop: { damping: 22, stiffness: 320, mass: 0.8 },
};

/* ------------------------------------------------------------------ *
 * Stagger
 * ------------------------------------------------------------------ */

/**
 * 60ms between rows, capped. Uncapped, a long list has its last row arriving
 * seconds after the first — by which point the user has scrolled past where
 * it should already have been.
 */
export const stagger = {
  step: beat.dashboardStagger,
  maxSteps: 8,
  delayFor(index: number) {
    return Math.min(index, this.maxSteps) * this.step;
  },
};

export default { CURVE, duration, beat, levelUp, summary, splash, easing, spring, stagger, PRESS_SCALE };
