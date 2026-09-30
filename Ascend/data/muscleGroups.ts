// Workout templates (data/workoutPlans.ts) describe their focus as free text
// — "chest, shoulders, triceps", "quads, hamstrings, glutes", "whole body" —
// written for a human reading the workout list, not for code to parse. This
// file is the one place that turns that text into the fixed set of muscle
// groups the recovery view (components/MuscleRecovery.tsx) actually tracks,
// so the mapping only has to be gotten right once.
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const;
export type MuscleGroup = typeof MUSCLE_GROUPS[number];

// Longest/most-specific keywords first within each group so a phrase like
// "rear delts" matches Shoulders before some future shorter keyword could
// steal it — not load-bearing today (no keyword here is a substring of
// another across groups) but cheap insurance against it becoming true later.
const KEYWORD_TO_GROUP: [string, MuscleGroup][] = [
  ['chest', 'Chest'],
  ['back', 'Back'],
  ['lats', 'Back'],
  ['low back', 'Back'],
  ['shoulders', 'Shoulders'],
  ['delts', 'Shoulders'],
  ['biceps', 'Arms'],
  ['triceps', 'Arms'],
  ['arms', 'Arms'],
  ['quads', 'Legs'],
  ['hamstrings', 'Legs'],
  ['glutes', 'Legs'],
  ['hips', 'Legs'],
  ['squat', 'Legs'],
  ['legs', 'Legs'],
  ['core', 'Core'],
  ['abs', 'Core'],
];

// A template's `focus` string is a comma-separated mix of real muscle
// keywords ("chest, shoulders, triceps") and non-muscle descriptors
// ("explosive", "conditioning", "strength + hypertrophy") that this
// deliberately ignores rather than mis-bucketing. "whole body" is the one
// phrase that means all six groups at once instead of any single keyword
// match.
export function musclesTrainedFor(focus: string): MuscleGroup[] {
  const lower = focus.toLowerCase();
  if (lower.includes('whole body')) return [...MUSCLE_GROUPS];

  const matched = new Set<MuscleGroup>();
  for (const [keyword, group] of KEYWORD_TO_GROUP) {
    if (lower.includes(keyword)) matched.add(group);
  }
  return Array.from(matched);
}
