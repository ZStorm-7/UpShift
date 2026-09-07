// Workout template engine — the app-side substitute for a real workout
// programming service.
//
// Four difficulty tiers:
//   beginner       — total volume ~15 sets, no cardio-intensive supersets
//   intermediate   — ~22 sets, supersets appear, more compound lifts
//   advanced       — ~28 sets, drop sets and tempo variations
//   pro            — ~35 sets, heavy compound emphasis, long sessions
//
// Each tier has a rotation of 6 templates covering an upper/lower/push/
// pull/legs/full-body split. The user's Dashboard picks TODAY's template by
// hashing (dayIndex + rotationOffset) into the tier's array — so day-to-day
// they see different workouts but the rotation is stable and predictable.
//
// Progression rules:
//   * Every workout the user completes at "full effort" (marked done, all
//     sets logged) bumps their `progressPoints` by 1.
//   * At 6 progression points, reps within the current tier bump by 2
//     (roughly a week of adherence at 6 workouts/week).
//   * At 24 progression points AND 80% adherence over the last 3 weeks,
//     the user levels up a tier.
//   * Skipping >= 3 days in a row DECREMENTS by 1 (mild "detraining"),
//     never below zero.
//
// A user's tier is stored on their profile. Onboarding sets it based on
// self-report (fitness experience question).

export type WorkoutTier = 'beginner' | 'intermediate' | 'advanced' | 'pro';

export type Exercise = {
  name: string;
  sets: number;
  reps: string;       // e.g. "8-10", "AMRAP", "30s"
  restSec: number;
  // Human-readable form cue. Kept short — this appears under the exercise
  // name in the workout list.
  cue?: string;
};

export type WorkoutTemplate = {
  id: string;
  title: string;              // e.g. "Upper Body — Push Focus"
  focus: string;              // e.g. "chest, shoulders, triceps"
  durationMin: number;        // rough estimate
  exercises: Exercise[];
  tier: WorkoutTier;
};

// ---- BEGINNER ----
// 6 templates. Compound lifts kept simple, no supersets, generous rest.

const BEGINNER: WorkoutTemplate[] = [
  {
    id: 'b-full-1', title: 'Full Body — Foundations', focus: 'whole body', durationMin: 30, tier: 'beginner',
    exercises: [
      { name: 'Goblet Squat',       sets: 3, reps: '10-12', restSec: 90, cue: 'chest up, knees tracking toes' },
      { name: 'Push-Up (Knees OK)', sets: 3, reps: '8-10',  restSec: 90, cue: 'body in one line, elbows ~45°' },
      { name: 'Dumbbell Row',       sets: 3, reps: '10-12', restSec: 75, cue: 'squeeze shoulder blade back' },
      { name: 'Plank',              sets: 3, reps: '20-30s',restSec: 60, cue: 'brace like you\'re about to be punched' },
    ],
  },
  {
    id: 'b-upper-1', title: 'Upper Body — Basics', focus: 'chest, back, arms', durationMin: 30, tier: 'beginner',
    exercises: [
      { name: 'Dumbbell Bench Press',       sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Seated Cable Row',           sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Dumbbell Shoulder Press',    sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Bicep Curl',                 sets: 2, reps: '12',    restSec: 60 },
      { name: 'Tricep Pushdown',            sets: 2, reps: '12',    restSec: 60 },
    ],
  },
  {
    id: 'b-lower-1', title: 'Lower Body — Basics', focus: 'quads, glutes, hamstrings', durationMin: 30, tier: 'beginner',
    exercises: [
      { name: 'Leg Press',        sets: 3, reps: '10-12', restSec: 120 },
      { name: 'Leg Curl',         sets: 3, reps: '10-12', restSec: 75 },
      { name: 'Leg Extension',    sets: 3, reps: '10-12', restSec: 75 },
      { name: 'Standing Calf Raise', sets: 3, reps: '15', restSec: 60 },
    ],
  },
  {
    id: 'b-push-1', title: 'Push Day — Beginner', focus: 'chest, shoulders, triceps', durationMin: 35, tier: 'beginner',
    exercises: [
      { name: 'Machine Chest Press', sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Machine Shoulder Press', sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Lateral Raise', sets: 3, reps: '12', restSec: 60 },
      { name: 'Cable Tricep Pushdown', sets: 3, reps: '12', restSec: 60 },
    ],
  },
  {
    id: 'b-pull-1', title: 'Pull Day — Beginner', focus: 'back, biceps', durationMin: 35, tier: 'beginner',
    exercises: [
      { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Seated Cable Row', sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Face Pull', sets: 3, reps: '12-15', restSec: 60 },
      { name: 'Bicep Curl', sets: 3, reps: '12', restSec: 60 },
    ],
  },
  {
    id: 'b-full-2', title: 'Full Body — Circuit', focus: 'whole body, light cardio', durationMin: 25, tier: 'beginner',
    exercises: [
      { name: 'Bodyweight Squat',   sets: 3, reps: '12-15', restSec: 60 },
      { name: 'Incline Push-Up',    sets: 3, reps: '8-10',  restSec: 60 },
      { name: 'Bent-Over Row',      sets: 3, reps: '10-12', restSec: 60 },
      { name: 'Glute Bridge',       sets: 3, reps: '12',    restSec: 60 },
      { name: 'Dead Bug',           sets: 3, reps: '8/side',restSec: 45 },
    ],
  },
];

// ---- INTERMEDIATE ----

const INTERMEDIATE: WorkoutTemplate[] = [
  {
    id: 'i-upper-1', title: 'Upper Body — Strength', focus: 'chest, back, shoulders', durationMin: 50, tier: 'intermediate',
    exercises: [
      { name: 'Barbell Bench Press',      sets: 4, reps: '6-8',   restSec: 150 },
      { name: 'Pull-Up',                  sets: 4, reps: '6-8',   restSec: 150 },
      { name: 'Overhead Press',           sets: 3, reps: '8-10',  restSec: 120 },
      { name: 'Barbell Row',              sets: 3, reps: '8-10',  restSec: 120 },
      { name: 'Lateral Raise (superset with) Face Pull', sets: 3, reps: '12+12', restSec: 60 },
    ],
  },
  {
    id: 'i-lower-1', title: 'Lower Body — Strength', focus: 'squat pattern', durationMin: 50, tier: 'intermediate',
    exercises: [
      { name: 'Back Squat',           sets: 4, reps: '6-8',   restSec: 180 },
      { name: 'Romanian Deadlift',    sets: 3, reps: '8-10',  restSec: 120 },
      { name: 'Walking Lunge',        sets: 3, reps: '10/side',restSec: 90 },
      { name: 'Leg Curl',             sets: 3, reps: '10-12', restSec: 75 },
      { name: 'Standing Calf Raise',  sets: 4, reps: '10-12', restSec: 60 },
    ],
  },
  {
    id: 'i-push-1', title: 'Push Day', focus: 'chest, shoulders, triceps', durationMin: 55, tier: 'intermediate',
    exercises: [
      { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10', restSec: 120 },
      { name: 'Barbell Overhead Press', sets: 4, reps: '6-8',  restSec: 150 },
      { name: 'Dip', sets: 3, reps: '8-10', restSec: 90 },
      { name: 'Cable Lateral Raise', sets: 3, reps: '12-15', restSec: 60 },
      { name: 'Overhead Tricep Extension', sets: 3, reps: '10-12', restSec: 60 },
    ],
  },
  {
    id: 'i-pull-1', title: 'Pull Day', focus: 'back, biceps, rear delts', durationMin: 55, tier: 'intermediate',
    exercises: [
      { name: 'Deadlift', sets: 3, reps: '5', restSec: 180 },
      { name: 'Pull-Up', sets: 4, reps: '6-10', restSec: 120 },
      { name: 'Chest-Supported Row', sets: 3, reps: '8-10', restSec: 90 },
      { name: 'Face Pull', sets: 3, reps: '12-15', restSec: 60 },
      { name: 'Barbell Curl', sets: 3, reps: '10', restSec: 75 },
    ],
  },
  {
    id: 'i-legs-1', title: 'Leg Day', focus: 'quads, hamstrings, glutes', durationMin: 55, tier: 'intermediate',
    exercises: [
      { name: 'Front Squat', sets: 4, reps: '6-8', restSec: 150 },
      { name: 'Bulgarian Split Squat', sets: 3, reps: '8/side', restSec: 90 },
      { name: 'Hip Thrust', sets: 3, reps: '10-12', restSec: 90 },
      { name: 'Leg Extension', sets: 3, reps: '12', restSec: 60 },
      { name: 'Seated Calf Raise', sets: 4, reps: '12-15', restSec: 60 },
    ],
  },
  {
    id: 'i-full-1', title: 'Full Body — Athletic', focus: 'whole body, explosive', durationMin: 45, tier: 'intermediate',
    exercises: [
      { name: 'Trap Bar Deadlift', sets: 4, reps: '5-6', restSec: 150 },
      { name: 'Dumbbell Push Press', sets: 3, reps: '6-8', restSec: 120 },
      { name: 'Chin-Up', sets: 3, reps: '6-8', restSec: 90 },
      { name: 'Kettlebell Swing', sets: 3, reps: '15', restSec: 60 },
      { name: 'Hanging Leg Raise', sets: 3, reps: '10', restSec: 60 },
    ],
  },
];

// ---- ADVANCED ----

const ADVANCED: WorkoutTemplate[] = [
  {
    id: 'a-push-1', title: 'Push — High Volume', focus: 'chest, shoulders, triceps', durationMin: 65, tier: 'advanced',
    exercises: [
      { name: 'Barbell Bench Press', sets: 5, reps: '5', restSec: 180, cue: 'pause 1s on chest' },
      { name: 'Incline Dumbbell Press', sets: 4, reps: '8-10', restSec: 120 },
      { name: 'Weighted Dip', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Seated Dumbbell Press', sets: 4, reps: '8-10', restSec: 90 },
      { name: 'Cable Lateral Raise (drop set on last)', sets: 4, reps: '12/8/8', restSec: 60 },
      { name: 'Skullcrusher', sets: 4, reps: '10', restSec: 60 },
    ],
  },
  {
    id: 'a-pull-1', title: 'Pull — Heavy', focus: 'back, biceps', durationMin: 65, tier: 'advanced',
    exercises: [
      { name: 'Deadlift', sets: 5, reps: '3-5', restSec: 210 },
      { name: 'Weighted Pull-Up', sets: 4, reps: '5-7', restSec: 150 },
      { name: 'T-Bar Row', sets: 4, reps: '8-10', restSec: 90 },
      { name: 'Meadows Row', sets: 3, reps: '10/side', restSec: 75 },
      { name: 'Incline Curl (superset with) Hammer Curl', sets: 3, reps: '10+10', restSec: 60 },
    ],
  },
  {
    id: 'a-legs-1', title: 'Legs — Squat Focus', focus: 'quads, glutes', durationMin: 70, tier: 'advanced',
    exercises: [
      { name: 'Back Squat', sets: 5, reps: '5', restSec: 210 },
      { name: 'Pause Squat', sets: 3, reps: '5', restSec: 180, cue: '3s pause at bottom' },
      { name: 'Hack Squat', sets: 3, reps: '10-12', restSec: 120 },
      { name: 'Leg Curl', sets: 4, reps: '10-12', restSec: 75 },
      { name: 'Walking Lunge', sets: 3, reps: '12/side', restSec: 90 },
    ],
  },
  {
    id: 'a-upper-1', title: 'Upper — Power', focus: 'strength + hypertrophy', durationMin: 65, tier: 'advanced',
    exercises: [
      { name: 'Push Press', sets: 5, reps: '3-5', restSec: 180 },
      { name: 'Weighted Pull-Up', sets: 4, reps: '5-7', restSec: 150 },
      { name: 'Close-Grip Bench Press', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Pendlay Row', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Cable Fly (superset with) Rope Pushdown', sets: 3, reps: '12+12', restSec: 60 },
    ],
  },
  {
    id: 'a-lower-1', title: 'Lower — Posterior Chain', focus: 'hamstrings, glutes', durationMin: 65, tier: 'advanced',
    exercises: [
      { name: 'Romanian Deadlift', sets: 5, reps: '6-8', restSec: 150 },
      { name: 'Barbell Hip Thrust', sets: 4, reps: '8-10', restSec: 120 },
      { name: 'Nordic Curl', sets: 3, reps: '6-8', restSec: 90 },
      { name: 'Reverse Hyper', sets: 3, reps: '12-15', restSec: 75 },
      { name: 'Standing Calf Raise', sets: 5, reps: '10', restSec: 60 },
    ],
  },
  {
    id: 'a-full-1', title: 'Full Body — Density', focus: 'whole body', durationMin: 60, tier: 'advanced',
    exercises: [
      { name: 'Clean & Press', sets: 5, reps: '3', restSec: 150 },
      { name: 'Front Squat', sets: 4, reps: '6', restSec: 150 },
      { name: 'Weighted Chin-Up', sets: 4, reps: '5-7', restSec: 120 },
      { name: 'Farmer\'s Carry', sets: 3, reps: '40s',  restSec: 90 },
      { name: 'Hanging Leg Raise', sets: 4, reps: '12', restSec: 60 },
    ],
  },
];

// ---- PRO ----

const PRO: WorkoutTemplate[] = [
  {
    id: 'p-push-1', title: 'Push — Max Effort', focus: 'chest, shoulders, triceps', durationMin: 80, tier: 'pro',
    exercises: [
      { name: 'Competition Bench Press', sets: 6, reps: '3', restSec: 240 },
      { name: 'Pause Bench Press', sets: 4, reps: '5', restSec: 180 },
      { name: 'Weighted Dip', sets: 5, reps: '6-8', restSec: 150 },
      { name: 'Standing Overhead Press', sets: 5, reps: '5', restSec: 180 },
      { name: 'Cable Lateral Raise (triple drop)', sets: 4, reps: '10/8/6/6', restSec: 75 },
      { name: 'Skullcrusher + Close-Grip Press', sets: 4, reps: '8+6', restSec: 90 },
    ],
  },
  {
    id: 'p-pull-1', title: 'Pull — Heavy Deadlift', focus: 'back, hips, biceps', durationMin: 80, tier: 'pro',
    exercises: [
      { name: 'Deadlift', sets: 6, reps: '2-3', restSec: 240 },
      { name: 'Deficit Deadlift', sets: 3, reps: '5', restSec: 180 },
      { name: 'Weighted Pull-Up', sets: 5, reps: '5', restSec: 150 },
      { name: 'T-Bar Row', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Barbell Shrug', sets: 4, reps: '8-10', restSec: 90 },
      { name: 'EZ-Bar Curl (superset) Hammer Curl', sets: 4, reps: '10+10', restSec: 60 },
    ],
  },
  {
    id: 'p-legs-1', title: 'Legs — Squat Max', focus: 'quads, glutes', durationMin: 85, tier: 'pro',
    exercises: [
      { name: 'Back Squat', sets: 6, reps: '3', restSec: 240 },
      { name: 'Pause Front Squat', sets: 4, reps: '5', restSec: 180, cue: '3s pause' },
      { name: 'Hack Squat', sets: 4, reps: '8-10', restSec: 120 },
      { name: 'Leg Extension (triple drop)', sets: 4, reps: '12/10/8', restSec: 75 },
      { name: 'Weighted Walking Lunge', sets: 4, reps: '12/side', restSec: 90 },
    ],
  },
  {
    id: 'p-legs-2', title: 'Legs — Deadlift Max', focus: 'hamstrings, glutes, low back', durationMin: 80, tier: 'pro',
    exercises: [
      { name: 'Deadlift', sets: 6, reps: '2', restSec: 240 },
      { name: 'Snatch-Grip Romanian Deadlift', sets: 4, reps: '6', restSec: 180 },
      { name: 'Barbell Hip Thrust', sets: 5, reps: '5', restSec: 150 },
      { name: 'Nordic Curl', sets: 4, reps: '6-8', restSec: 90 },
      { name: 'Standing Calf Raise', sets: 6, reps: '8', restSec: 75 },
    ],
  },
  {
    id: 'p-upper-1', title: 'Upper — Strength + Hypertrophy', focus: 'chest, back, arms', durationMin: 80, tier: 'pro',
    exercises: [
      { name: 'Bench Press', sets: 5, reps: '5', restSec: 180 },
      { name: 'Weighted Pull-Up', sets: 5, reps: '5', restSec: 150 },
      { name: 'Close-Grip Bench Press', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Pendlay Row', sets: 4, reps: '6-8', restSec: 120 },
      { name: 'Meadows Row', sets: 3, reps: '10/side', restSec: 90 },
      { name: 'Cable Fly + Rope Pushdown', sets: 4, reps: '12+12', restSec: 60 },
    ],
  },
  {
    id: 'p-full-1', title: 'Full Body — Density Peak', focus: 'whole body, conditioning', durationMin: 70, tier: 'pro',
    exercises: [
      { name: 'Power Clean', sets: 5, reps: '3', restSec: 180 },
      { name: 'Front Squat', sets: 5, reps: '5', restSec: 180 },
      { name: 'Weighted Chin-Up', sets: 5, reps: '5', restSec: 150 },
      { name: 'Push Press', sets: 4, reps: '5', restSec: 150 },
      { name: 'Farmer\'s Carry (heavy)', sets: 4, reps: '30s', restSec: 90 },
      { name: 'Hanging Toes-to-Bar', sets: 4, reps: '10', restSec: 60 },
    ],
  },
];

const TEMPLATES_BY_TIER: Record<WorkoutTier, WorkoutTemplate[]> = {
  beginner: BEGINNER,
  intermediate: INTERMEDIATE,
  advanced: ADVANCED,
  pro: PRO,
};

// ---- Progression ----
// Every completed workout adds 1 progression point. At 6 points, reps
// within a tier bump by 2 (see `applyProgression`). At 24 points, the
// user levels up a tier.
//
// Skipping 3+ days in a row detriments by 1.

export type ProgressionState = {
  tier: WorkoutTier;
  progressPoints: number;      // 0..24
  lastWorkoutDate: string | null;  // YYYY-MM-DD
  rotationOffset: number;      // shifts the template rotation so a fresh
                               // tier doesn't always start on template 0
};

export const EMPTY_PROGRESSION: ProgressionState = {
  tier: 'beginner',
  progressPoints: 0,
  lastWorkoutDate: null,
  rotationOffset: 0,
};

const TIER_ORDER: WorkoutTier[] = ['beginner', 'intermediate', 'advanced', 'pro'];

export function pickTodaysWorkout(state: ProgressionState, dayIndex: number): WorkoutTemplate {
  const bucket = TEMPLATES_BY_TIER[state.tier];
  const idx = (dayIndex + state.rotationOffset) % bucket.length;
  const base = bucket[idx];
  return applyProgression(base, state.progressPoints);
}

// Rep progression: every 6 points, add +2 reps to each set that has a
// numeric rep count. Ranges like "6-8" become "8-10". Time-based sets like
// "30s" or "AMRAP" are left alone.
function applyProgression(template: WorkoutTemplate, points: number): WorkoutTemplate {
  const bumps = Math.floor(points / 6);
  if (bumps === 0) return template;
  const delta = bumps * 2;
  return {
    ...template,
    exercises: template.exercises.map(ex => {
      const m = ex.reps.match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return ex;
      const lo = parseInt(m[1], 10) + delta;
      const hi = m[2] ? parseInt(m[2], 10) + delta : null;
      return { ...ex, reps: hi === null ? String(lo) : `${lo}-${hi}` };
    }),
  };
}

export function recordCompletedWorkout(
  state: ProgressionState,
  todayKey: string
): ProgressionState {
  // A completed workout adds 1 point AND checks for a tier level-up.
  const newPoints = state.progressPoints + 1;
  if (newPoints >= 24) {
    const currentIndex = TIER_ORDER.indexOf(state.tier);
    const nextTier = currentIndex < TIER_ORDER.length - 1
      ? TIER_ORDER[currentIndex + 1]
      : state.tier; // already pro — cap out
    return {
      tier: nextTier,
      progressPoints: nextTier === state.tier ? 24 : 0,
      lastWorkoutDate: todayKey,
      // Randomize offset on tier-up so the first workout of a new tier
      // isn't always the same one.
      rotationOffset: (state.rotationOffset + Math.floor(Math.random() * 6)) % 6,
    };
  }
  return {
    ...state,
    progressPoints: newPoints,
    lastWorkoutDate: todayKey,
  };
}

// Called by the Dashboard on load. If the user's last workout was 3+ days
// ago, gently detriment by 1 (never below 0). Doesn't skip tiers backwards
// — leveling down isn't part of this system.
export function decayForInactivity(state: ProgressionState, todayKey: string): ProgressionState {
  if (!state.lastWorkoutDate) return state;
  const [ly, lm, ld] = state.lastWorkoutDate.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const last = new Date(ly, lm - 1, ld).getTime();
  const today = new Date(ty, tm - 1, td).getTime();
  const days = Math.floor((today - last) / (24 * 60 * 60 * 1000));
  if (days < 3) return state;
  const dec = Math.min(state.progressPoints, days - 2);
  return { ...state, progressPoints: state.progressPoints - dec };
}

export const WORKOUT_TIER_LABELS: Record<WorkoutTier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  pro: 'Pro',
};

// ---- Rest day schedule ----
//
// A simple work-N/rest-1 cycle: 5 workout days, then 1 rest day, repeating
// forever. Anchored to `daysSinceStart` (days since the ACCOUNT was
// created, not the calendar year) so day 0 — the very first day anyone
// ever opens the workout screen — always lands on a work day, and the
// first rest day can only appear after a full run of workout days, never
// during the opening days of a fresh plan.
export const WORKOUT_DAYS_PER_CYCLE = 5;
const REST_CYCLE_LENGTH = WORKOUT_DAYS_PER_CYCLE + 1;

export function isRestDay(daysSinceStart: number): boolean {
  if (daysSinceStart < 0) return false;
  return daysSinceStart % REST_CYCLE_LENGTH === WORKOUT_DAYS_PER_CYCLE;
}

export function tierFromOnboardingAnswer(answer: string): WorkoutTier {
  switch (answer) {
    case 'never':        return 'beginner';
    case 'sometimes':    return 'beginner';
    case 'regular':      return 'intermediate';
    case 'experienced':  return 'advanced';
    case 'competitive':  return 'pro';
    default:             return 'beginner';
  }
}
