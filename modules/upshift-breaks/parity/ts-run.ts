// Parity check, TypeScript side. Generates randomized scenarios (written to
// scenarios.txt) and the TS policy's answer for each (expected.txt). The Kotlin
// side (Main.kt) reads the same scenarios and must produce an identical answer.
//
//   node --import ./tests/register.mjs modules/upshift-breaks/parity/ts-run.ts <outDir> [count]

import { writeFileSync } from 'node:fs';
import { decide, complete, widgetState, INITIAL_TRACKER } from '../../../services/breaks/policy';
import type { Policy } from '../../../services/breaks/policy';
import type { TrackerState } from '../../../services/breaks/usageTracker';

const outDir = process.argv[2] ?? '.';
const count = Number(process.argv[3] ?? 300);

// mulberry32: tiny seeded PRNG so every run produces the same scenarios.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW0 = 1_000_000;
const STEP = 2000;
type Seg = { dur: number; watched: boolean; screen: boolean; switches: number; call: boolean; nav: boolean; work: boolean };
type Scenario = {
  policy: Policy; startDow: number; startMod: number; breaks0: number; segs: Seg[];
};

function makeScenario(r: () => number): Scenario {
  const pick = (n: number) => Math.floor(r() * n);
  const days: number[] = [];
  for (let d = 0; d < 7; d++) if (r() < 0.6) days.push(d);
  const total = (20 + pick(160)) * 60_000;
  const segs: Seg[] = [];
  let used = 0;
  while (used < total) {
    const dur = (1 + pick(25)) * 60_000;
    segs.push({ dur, watched: r() < 0.75, screen: r() < 0.9, switches: pick(20), call: r() < 0.08, nav: r() < 0.06, work: r() < 0.06 });
    used += dur;
  }
  const policy: Policy = {
    enabled: r() < 0.93,
    intervalMin: 5 + pick(56),
    schedule: { enabled: r() < 0.5, days, startMin: pick(1440), endMin: pick(1440) },
    dailyCap: r() < 0.5 ? 0 : 1 + pick(4),
    adaptive: r() < 0.5,
    windDown: { enabled: r() < 0.35, startMin: r() < 0.7 ? 22 * 60 + pick(60) : pick(1440), endMin: r() < 0.7 ? 5 * 60 + pick(180) : pick(1440) },
    exceptions: { calls: r() < 0.8, navigation: r() < 0.8, workouts: r() < 0.8 },
    pausedUntil: r() < 0.3 ? NOW0 + pick(60) * 60_000 : 0,
    strictUntil: r() < 0.3 ? NOW0 + pick(90) * 60_000 : 0,
  };
  // Make a few schedules exactly whole-day or overnight, which are the tricky ones.
  if (r() < 0.15) policy.schedule.endMin = policy.schedule.startMin;
  if (r() < 0.2) { policy.schedule.startMin = 22 * 60 + pick(60); policy.schedule.endMin = pick(7 * 60); }
  return { policy, startDow: pick(7), startMod: pick(1440), breaks0: r() < 0.3 ? pick(4) : 0, segs };
}

function run(s: Scenario): { actions: string; widget: string } {
  const total = s.segs.reduce((n, g) => n + g.dur, 0);
  let state: TrackerState = INITIAL_TRACKER;
  let breaks = s.breaks0;
  const out: string[] = [];
  const wid: string[] = [];
  for (let elapsed = 0; elapsed < total; elapsed += STEP) {
    let acc = 0, seg = s.segs[0];
    for (const g of s.segs) { seg = g; if (elapsed < acc + g.dur) break; acc += g.dur; }
    const totalMin = s.startMod + Math.floor(elapsed / 60_000);
    const local = { dayOfWeek: (s.startDow + Math.floor(totalMin / 1440)) % 7, minutesOfDay: totalMin % 1440 };
    const sample = {
      now: NOW0 + elapsed, watchedInForeground: seg.watched, screenOn: seg.screen,
      local, switchesLast5Min: seg.switches, breaksToday: breaks,
      inCall: seg.call, navigating: seg.nav, workout: seg.work,
    };
    const r = decide(state, sample, s.policy);
    state = r.state;
    if (elapsed % 20_000 === 0) { const w = widgetState(state, sample, s.policy); wid.push(`${elapsed}:${w.kind.toUpperCase()}:${w.minutes}`); }
    if (r.action !== 'none') {
      out.push(`${elapsed}:${r.action.toUpperCase()}`);
      if (r.action === 'break') { state = complete(state); breaks++; }
    }
  }
  return { actions: out.join(','), widget: wid.join(',') };
}

const r = rng(20261025);
const scenarios: string[] = [];
const expected: string[] = [];
let withActions = 0;
const kinds = { break: 0, strict: 0 };
let exempt = 0, windDowns = 0;
for (let i = 0; i < count; i++) {
  const s = makeScenario(r);
  const p = s.policy;
  scenarios.push(`C ${i}`);
  scenarios.push(`P ${p.enabled ? 1 : 0} ${p.intervalMin} ${p.schedule.enabled ? 1 : 0} ${p.schedule.days.length ? p.schedule.days.join(',') : '-'} ${p.schedule.startMin} ${p.schedule.endMin} ${p.dailyCap} ${p.adaptive ? 1 : 0} ${p.pausedUntil} ${p.strictUntil} ${p.windDown.enabled ? 1 : 0} ${p.windDown.startMin} ${p.windDown.endMin} ${p.exceptions.calls ? 1 : 0} ${p.exceptions.navigation ? 1 : 0} ${p.exceptions.workouts ? 1 : 0}`);
  scenarios.push(`L ${s.startDow} ${s.startMod} ${s.breaks0}`);
  for (const g of s.segs) scenarios.push(`G ${g.dur} ${g.watched ? 1 : 0} ${g.screen ? 1 : 0} ${g.switches} ${g.call ? 1 : 0} ${g.nav ? 1 : 0} ${g.work ? 1 : 0}`);
  const { actions: res, widget } = run(s);
  if (s.policy.windDown.enabled) windDowns++;
  if (s.segs.some(g => g.call || g.nav || g.work)) exempt++;
  if (res) withActions++;
  kinds.break += (res.match(/BREAK/g) ?? []).length;
  kinds.strict += (res.match(/STRICT/g) ?? []).length;
  expected.push(`R ${i} ${res}`);
  expected.push(`W ${i} ${widget}`);
}
writeFileSync(`${outDir}/scenarios.txt`, scenarios.join('\n') + '\n');
writeFileSync(`${outDir}/expected.txt`, expected.join('\n') + '\n');
console.log(`scenarios=${count} withActions=${withActions} breaks=${kinds.break} strict=${kinds.strict} withWindDown=${windDowns} withExceptionSegments=${exempt}`);
