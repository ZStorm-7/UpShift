// Soft ambient sound for the break. Off = haptics only. It honors the phone's
// silent switch (expo-audio's default) and mixes with, rather than interrupts,
// whatever else is playing. Guarded like services/sound.ts, so a missing audio
// module just means a silent break.

import type { PatternId } from './timeline';

const SOURCES: Record<PatternId, unknown> = {
  calm: require('../../assets/sounds/breath_calm.wav'),
  sigh: require('../../assets/sounds/breath_sigh.wav'),
  box: require('../../assets/sounds/breath_box.wav'),
  long: require('../../assets/sounds/breath_long.wav'),
};

type Player = { play: () => void | Promise<void>; pause: () => void; remove: () => void; volume: number; seekTo: (s: number) => Promise<void> | void };
let player: Player | null = null;

export function startBreathSound(pattern: PatternId): void {
  stopBreathSound();
  try {
    const audio = require('expo-audio') as { createAudioPlayer: (src: unknown) => Player };
    player = audio.createAudioPlayer(SOURCES[pattern]);
    player.volume = 0.8;
    // On the web, browsers refuse to play until the user has touched the page; that
    // rejection must not escape as an unhandled error. A silent break is fine.
    const started = player.play();
    if (started && typeof (started as Promise<void>).catch === 'function') (started as Promise<void>).catch(() => {});
  } catch {
    player = null;
  }
}

export function stopBreathSound(): void {
  try { player?.pause(); player?.remove(); } catch { /* ignore */ }
  player = null;
}
