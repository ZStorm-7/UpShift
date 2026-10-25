// Generates assets/sounds/breath_<pattern>.wav: a soft, warm pad whose loudness
// and pitch follow the breathing orb (swells on the in-breath, fades on the
// out-breath). It reads the SAME timeline the screen uses, so the sound can
// never drift from the animation. Plain sine partials only: no samples, no
// licensing, ~480 KB each.
//
//   npm run make:breath-sounds

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATTERN_IDS, compile, scaleAt, SCALE_MIN } from '../services/breaks/timeline';

const RATE = 16_000;
const SECONDS = 15;
const OUT = join(import.meta.dirname, '..', 'assets', 'sounds');

// A gentle open chord (G3, D4, G4) with a quiet octave above for air.
const PARTIALS: [freq: number, gain: number][] = [[196, 0.5], [293.66, 0.32], [392, 0.22], [784, 0.05]];

function wav(samples: Int16Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(s, i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(OUT, { recursive: true });
for (const id of PATTERN_IDS) {
  const c = compile(id);
  const n = RATE * SECONDS;
  const samples = new Int16Array(n);
  const phase = PARTIALS.map(() => 0);
  let smooth = 0;
  for (let i = 0; i < n; i++) {
    const ms = (i / RATE) * 1000;
    // 0 at rest, 1 at the fullest breath.
    const level = (scaleAt(c, ms) - SCALE_MIN) / (1 - SCALE_MIN);
    smooth += (level - smooth) * 0.0008; // soften any corner so there are no clicks
    const amp = 0.06 + 0.34 * smooth;
    // The pitch rises a little (about a semitone) as the lungs fill.
    const bend = 1 + 0.06 * smooth;
    let v = 0;
    PARTIALS.forEach(([f, g], k) => {
      phase[k] += (2 * Math.PI * f * bend) / RATE;
      v += Math.sin(phase[k]) * g;
    });
    // Slow shimmer, and a short fade at both ends.
    const shimmer = 1 + 0.04 * Math.sin((2 * Math.PI * 0.35 * i) / RATE);
    const t = i / RATE;
    const fade = Math.min(1, t / 0.4, (SECONDS - t) / 0.6);
    samples[i] = Math.round(Math.max(-1, Math.min(1, v * amp * shimmer * fade * 0.8)) * 32767);
  }
  writeFileSync(join(OUT, `breath_${id}.wav`), wav(samples));
  console.log(`breath_${id}.wav  ${(samples.length * 2 / 1024).toFixed(0)} KB`);
}
