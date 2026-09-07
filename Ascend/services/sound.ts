// Sound — the audible half of feedback.
//
// Six cues, matching the Claude Design spec exactly. They're synthesised
// rather than licensed (see scripts that generated assets/sounds/*.wav), so
// there is no attribution or licence to carry.
//
//     questTick        1200Hz square, 50ms     — dry, tiny click
//     xpEarned         988 → 1319Hz, 180ms     — two-note pickup
//     levelUp          C-E-G-C arpeggio, 640ms — triangle, 90ms apart
//     restTimerEnd     90Hz sine, 180ms        — low and physical
//     screenTransition filtered noise, 250ms   — OFF by default, see below
//     sessionComplete  784 + 1047Hz, 420ms     — confirmation, not celebration
//
// This module mirrors services/haptics.ts on purpose: same lazy-load, same
// swallow-everything guard, same enabled flag. Feedback is decoration, and a
// failed cue must never be able to stop a quest from being marked complete.
//
// ── The rules the design doc sets, and how they're kept ──
//
// "Always gated behind a settings toggle plus the device silent switch."
//
//   The toggle is `setSoundEnabled`. The silent switch is handled by NOT
//   setting `playsInSilentMode` — expo-audio defaults to respecting the
//   hardware switch on iOS, and the one thing that would break this rule is
//   turning that on. It is deliberately not turned on. If a future change
//   needs audio during workouts with the phone silenced, that is a product
//   decision someone should make on purpose, not a flag that drifts.
//
// "Mixed −18 dBFS."
//
//   Baked into the files themselves, not applied here as a volume multiplier.
//   Normalising at generation time means the cues are consistent relative to
//   each other no matter what the player volume is set to.
//
// "Screen transition — optional; most apps are better without it."
//
//   Taken at its word: that one cue defaults to off even when sound is on.
//   A sound on every navigation is the fastest way to make someone disable
//   audio entirely, and then they lose the five cues that were actually
//   carrying information.
//
// ── Why players are created once and reused ──
//
// Creating a player per call would allocate a decoder on every quest tick and
// leak it. Each cue gets exactly one player, created on first use and then
// rewound with seekTo(0) — which is also what makes rapid repeats work: tick
// three quests quickly and the third tick restarts the sound rather than
// waiting politely for the first to finish.

import { Platform } from 'react-native';

/** The cue names, which are also the filenames under assets/sounds. */
export type Cue =
  | 'quest_tick'
  | 'xp_earned'
  | 'level_up'
  | 'rest_end'
  | 'screen_transition'
  | 'session_complete';

// require() rather than import: Metro resolves these to asset modules at
// bundle time, and a static map means an unused cue is still bundled (which
// is what we want — the alternative is a stutter the first time it plays).
const SOURCES: Record<Cue, unknown> = {
  quest_tick: require('../assets/sounds/quest_tick.wav'),
  xp_earned: require('../assets/sounds/xp_earned.wav'),
  level_up: require('../assets/sounds/level_up.wav'),
  rest_end: require('../assets/sounds/rest_end.wav'),
  screen_transition: require('../assets/sounds/screen_transition.wav'),
  session_complete: require('../assets/sounds/session_complete.wav'),
};

type AudioPlayer = {
  play: () => void;
  seekTo: (seconds: number) => Promise<void> | void;
  remove: () => void;
  volume: number;
};

type AudioModule = {
  createAudioPlayer: (source: unknown) => AudioPlayer;
  setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
};

// `undefined` = not tried, `null` = tried and unavailable. Without the
// distinction a missing package means a require() attempt per quest tick.
let cached: AudioModule | null | undefined;

function load(): AudioModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-audio') as AudioModule;
    cached = mod;

    // Ask for the mode that mixes with other audio rather than interrupting
    // it. Someone logging a set while listening to music should not have the
    // music duck for a 50ms click.
    //
    // Note what is NOT here: playsInSilentMode. Leaving it unset is what keeps
    // the design's "plus the device silent switch" promise.
    mod.setAudioModeAsync?.({
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {});
  } catch {
    cached = null;
  }
  return cached;
}

/** True once expo-audio has resolved — for a Settings toggle that should hide
 *  itself where audio can't work at all. */
export function soundAvailable(): boolean {
  return load() !== null;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

// In-memory, deliberately. Persisting this belongs with the rest of the user's
// preferences in their Firestore profile rather than in a separate local
// store, and wiring it there is a product change (a Settings screen) rather
// than an audio one. Until that exists, sound resets to on each launch —
// which is the right default for a feature most people never think about, and
// the wrong one to silently persist without a visible switch to undo it.
let enabled = true;

// The one cue the design flags as optional. Off unless explicitly asked for.
let transitionsEnabled = false;

export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (!value) stopAll();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Opt in to the screen-transition whoosh. Off by default on the design's own
 *  advice — "most apps are better without it". */
export function setTransitionSoundEnabled(value: boolean) {
  transitionsEnabled = value;
}

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

const players = new Map<Cue, AudioPlayer>();

function play(cue: Cue) {
  if (!enabled) return;
  const audio = load();
  if (!audio) return;

  try {
    let player = players.get(cue);
    if (!player) {
      player = audio.createAudioPlayer(SOURCES[cue]);
      players.set(cue, player);
    }
    // Rewind first so a rapid repeat restarts the cue instead of being
    // swallowed because the player is already at the end.
    const seek = player.seekTo(0);
    if (seek && typeof (seek as Promise<void>).then === 'function') {
      (seek as Promise<void>).then(() => player!.play()).catch(() => {});
    } else {
      player.play();
    }
  } catch {
    // Decoding failure, an OS refusing the session, a player removed out from
    // under us on a fast unmount — none of it is worth surfacing.
  }
}

/** Releases every player. Call on sign-out or when sound is switched off;
 *  the decoders are native resources and don't free themselves. */
export function stopAll() {
  players.forEach(p => {
    try {
      p.remove();
    } catch {
      /* already gone */
    }
  });
  players.clear();
}

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

/** Quest ticked. Fires on TAP, not on the state settling — the design is
 *  specific about this, and it's why the click feels like it belongs to your
 *  finger rather than to the app catching up. */
export function questTick() {
  play('quest_tick');
}

/** XP awarded. The rising two-note figure, paired with the mote floating up. */
export function xpEarned() {
  play('xp_earned');
}

/** Level up. Starts on the ring burst so the arpeggio resolves as the numeral
 *  lands — 640ms against the takeover's 2.5s. */
export function levelUp() {
  play('level_up');
}

/** Rest timer hitting zero. The only cue below 500Hz, so it reads as a
 *  different KIND of event rather than a louder version of the others. */
export function restTimerEnd() {
  play('rest_end');
}

/** Workout finished. Held, consonant — confirmation rather than celebration.
 *  The celebration is the level-up, and only one of them can be the biggest. */
export function sessionComplete() {
  play('session_complete');
}

/** Screen change. No-op unless explicitly enabled; see setTransitionSoundEnabled. */
export function screenTransition() {
  if (!transitionsEnabled) return;
  play('screen_transition');
}

export default {
  questTick,
  xpEarned,
  levelUp,
  restTimerEnd,
  sessionComplete,
  screenTransition,
  setSoundEnabled,
  isSoundEnabled,
  setTransitionSoundEnabled,
  soundAvailable,
  stopAll,
};
