// How-to cards for the exercises in data/workoutPlans.ts: one cue to do it well and the
// mistake people make most. Short on purpose, and general technique advice, not medical
// advice. Names are English like the exercise names themselves.

export type ExerciseGuide = {
  muscles: string;
  cue: string;
  mistake: string;
};

const G = (muscles: string, cue: string, mistake: string): ExerciseGuide => ({ muscles, cue, mistake });

// Keys are normalised names (see normalizeExerciseName).
const GUIDES: Record<string, ExerciseGuide> = {
  'back squat': G('quads, glutes', 'Bar on your upper back, brace, sit between your hips, drive the floor away.', 'Letting the knees cave in or the heels lift off the floor.'),
  'front squat': G('quads, core', 'Elbows high, bar on your shoulders, stay tall as you sit down.', 'Elbows dropping, which pulls the chest forward and the bar rolls.'),
  'goblet squat': G('quads, glutes', 'Hold the weight at your chest, elbows inside your knees at the bottom.', 'Rounding forward instead of keeping your chest up.'),
  'bodyweight squat': G('quads, glutes', 'Feet shoulder-width, sit back and down, knees follow your toes.', 'Heels coming up or knees collapsing inward.'),
  'hack squat': G('quads', 'Feet shoulder-width on the plate, lower under control, press through the whole foot.', 'Bouncing out of the bottom or lifting your hips off the pad.'),
  'bulgarian split squat': G('quads, glutes', 'Back foot on a bench, torso tall, lower straight down.', 'Standing too close to the bench so the front knee shoots forward.'),
  'walking lunge': G('quads, glutes', 'Long step, drop the back knee toward the floor, push through the front heel.', 'Short steps and leaning forward from the waist.'),
  'leg press': G('quads, glutes', 'Feet shoulder-width, lower until your knees are around 90 degrees, press without locking out.', 'Letting the lower back round off the seat at the bottom.'),
  'leg curl': G('hamstrings', 'Hips pressed down, curl the pad with control, squeeze at the top.', 'Swinging the weight with momentum.'),
  'leg extension': G('quads', 'Pause for a second at the top, lower slowly.', 'Throwing the weight up and dropping it down.'),
  'nordic curl': G('hamstrings', 'Anchor your heels, keep hips and back in a straight line, lower as slowly as you can.', 'Folding at the hips instead of staying straight.'),
  'standing calf raise': G('calves', 'Rise to the top of your toes, pause, lower to a full stretch.', 'Short, bouncy reps that skip the stretch at the bottom.'),
  'seated calf raise': G('calves', 'Full stretch at the bottom, pause at the top.', 'Bouncing instead of pausing.'),
  'romanian deadlift': G('hamstrings, glutes', 'Soft knees, push your hips back, bar close to your legs, flat back.', 'Bending the knees too much so it turns into a squat.'),
  'snatch-grip romanian deadlift': G('hamstrings, back', 'Wide grip, hips back, keep the bar against your thighs.', 'Letting the bar drift away from your legs.'),
  'deadlift': G('back, glutes, hamstrings', 'Bar over mid-foot, brace, push the floor away, hips and shoulders rise together.', 'Jerking the bar off the floor with a rounded back.'),
  'trap bar deadlift': G('legs, back', 'Stand centred in the bar, chest up, push the floor away.', 'Hips shooting up first so the back does all the work.'),
  'deficit deadlift': G('back, hamstrings', 'Stand on a small plate, keep the same setup and tight back as a normal pull.', 'Starting with the hips too low so the back rounds.'),
  'barbell hip thrust': G('glutes', 'Upper back on the bench, chin tucked, drive hips up and squeeze.', 'Over-arching the lower back at the top.'),
  'hip thrust': G('glutes', 'Upper back on the bench, chin tucked, drive hips up and squeeze.', 'Over-arching the lower back at the top.'),
  'glute bridge': G('glutes', 'Feet flat, ribs down, press through your heels and squeeze at the top.', 'Pushing with the lower back instead of the glutes.'),
  'reverse hyper': G('glutes, lower back', 'Swing the legs up with control, pause, lower slowly.', 'Using momentum to swing the legs.'),
  'kettlebell swing': G('glutes, hamstrings', 'Hinge back, snap the hips forward, let the bell float.', 'Squatting the movement and lifting with the arms.'),
  'bench press': G('chest, triceps', 'Shoulder blades back and down, lower to mid-chest, press up and slightly back.', 'Flaring the elbows straight out and bouncing the bar off your chest.'),
  'barbell bench press': G('chest, triceps', 'Shoulder blades back and down, lower to mid-chest, press up and slightly back.', 'Flaring the elbows straight out and bouncing the bar off your chest.'),
  'dumbbell bench press': G('chest, triceps', 'Lower until elbows are just below the bench, press up and together.', 'Letting the dumbbells drift too wide.'),
  'incline dumbbell press': G('upper chest, shoulders', 'Bench at a low incline, lower to your upper chest, press without shrugging.', 'Setting the bench too steep so it becomes a shoulder press.'),
  'machine chest press': G('chest', 'Handles at chest height, press out without locking, control the way back.', 'Seat too low so the shoulders roll forward.'),
  'close-grip bench press': G('triceps, chest', 'Hands about shoulder-width, elbows tucked, lower to the lower chest.', 'Hands so close that the wrists bend painfully.'),
  'competition bench press': G('chest, triceps', 'Set a tight arch, pause the bar on your chest, press on command.', 'Losing tightness during the pause.'),
  'push-up': G('chest, triceps', 'Body in one line, elbows about 45 degrees, chest to the floor.', 'Hips sagging or piking up.'),
  'incline push-up': G('chest, triceps', 'Hands on a bench, body in one line, chest to the edge.', 'Dropping the hips.'),
  'dip': G('chest, triceps', 'Lean slightly forward, lower until shoulders are about elbow height.', 'Going so deep that the shoulders hurt.'),
  'overhead press': G('shoulders, triceps', 'Squeeze glutes, press straight up, move your head through at the top.', 'Leaning back and pressing with the lower back.'),
  'barbell overhead press': G('shoulders, triceps', 'Squeeze glutes, press straight up, move your head through at the top.', 'Leaning back and pressing with the lower back.'),
  'standing overhead press': G('shoulders, triceps', 'Squeeze glutes, press straight up, move your head through at the top.', 'Leaning back and pressing with the lower back.'),
  'dumbbell shoulder press': G('shoulders', 'Press up and slightly together, lower to ear height.', 'Arching the back to finish reps.'),
  'seated dumbbell press': G('shoulders', 'Back against the pad, press up and slightly together.', 'Letting the elbows flare behind the body.'),
  'machine shoulder press': G('shoulders', 'Seat so the handles start at shoulder height, press without shrugging.', 'Shrugging the shoulders up to the ears.'),
  'push press': G('shoulders, legs', 'A small dip and drive with the legs, then finish with the arms.', 'Dipping too deep so it becomes a squat.'),
  'dumbbell push press': G('shoulders, legs', 'A small dip and drive with the legs, then finish with the arms.', 'Dipping too deep so it becomes a squat.'),
  'clean & press': G('full body', 'Pull the weight to your shoulders in one smooth motion, then press overhead.', 'Curling the weight instead of using the hips.'),
  'power clean': G('full body', 'Jump and shrug, pull yourself under the bar, catch with elbows high.', 'Pulling with the arms too early.'),
  'lateral raise': G('side delts', 'Slight bend in the elbows, lift to shoulder height, lower slowly.', 'Swinging the weight with the body.'),
  'cable lateral raise': G('side delts', 'Lift out to the side to shoulder height, hold, lower slowly.', 'Shrugging as you lift.'),
  'face pull': G('rear delts, upper back', 'Pull the rope toward your face, elbows high, squeeze your shoulder blades.', 'Using too much weight and leaning back.'),
  'barbell row': G('back, biceps', 'Hinge to about 45 degrees, pull to your lower ribs, lower under control.', 'Standing up with each rep to heave the bar.'),
  'bent-over row': G('back, biceps', 'Flat back, pull the elbows behind you, squeeze at the top.', 'Rounding the back.'),
  'pendlay row': G('back', 'Bar starts on the floor each rep, flat back, explode to your lower chest.', 'Letting the torso rise as you pull.'),
  'dumbbell row': G('back, biceps', 'Pull the elbow toward your hip, squeeze your shoulder blade back.', 'Twisting the torso to swing the weight.'),
  'meadows row': G('back', 'Stagger your stance, pull the elbow toward your hip, control the way down.', 'Rotating the torso to cheat the rep.'),
  't-bar row': G('back', 'Chest up, pull the handle toward your chest, squeeze.', 'Rounding the back and jerking the weight.'),
  'chest-supported row': G('back', 'Chest on the pad, pull your elbows back, pause, lower slowly.', 'Lifting your chest off the pad.'),
  'seated cable row': G('back, biceps', 'Sit tall, pull the handle to your stomach, squeeze your shoulder blades.', 'Rocking the torso back and forth.'),
  'lat pulldown': G('lats, biceps', 'Pull the bar to your upper chest, elbows down, chest proud.', 'Leaning back far and pulling with momentum.'),
  'pull-up': G('lats, biceps', 'Start from a dead hang, pull your chest to the bar, lower fully.', 'Half reps that skip the hang.'),
  'chin-up': G('lats, biceps', 'Palms toward you, pull your chin over the bar, lower fully.', 'Kicking or swinging to get up.'),
  'weighted pull-up': G('lats, biceps', 'Same strict form as a pull-up with the weight hanging below you.', 'Letting the weight swing as you pull.'),
  'weighted chin-up': G('lats, biceps', 'Strict chin-up with the weight hanging below you.', 'Swinging the weight.'),
  'weighted dip': G('chest, triceps', 'Controlled lowering, lean slightly forward, press to straight arms.', 'Dropping fast into the bottom.'),
  'barbell shrug': G('traps', 'Straight up toward your ears, pause, lower. No rolling.', 'Rolling the shoulders in circles.'),
  'barbell curl': G('biceps', 'Elbows pinned to your sides, curl up, lower slowly.', 'Swinging the hips to lift the bar.'),
  'ez-bar curl': G('biceps', 'Elbows pinned to your sides, curl up, lower slowly.', 'Swinging the hips to lift the bar.'),
  'bicep curl': G('biceps', 'Elbows by your sides, curl without swinging, lower under control.', 'Using momentum from the back.'),
  'incline curl': G('biceps', 'Let the arms hang behind you for a deep stretch, curl up without moving the shoulders.', 'Letting the shoulders roll forward.'),
  'hammer curl': G('biceps, forearms', 'Palms face each other, curl up with the elbows still.', 'Swinging the weight.'),
  'tricep pushdown': G('triceps', 'Elbows tucked at your sides, push down to straight arms, control the return.', 'Letting the elbows drift forward.'),
  'cable tricep pushdown': G('triceps', 'Elbows tucked at your sides, push down to straight arms, control the return.', 'Letting the elbows drift forward.'),
  'rope pushdown': G('triceps', 'Spread the rope at the bottom, elbows tucked.', 'Leaning over the rope.'),
  'overhead tricep extension': G('triceps', 'Elbows pointing up, lower behind your head, extend fully.', 'Letting the elbows flare wide.'),
  'skullcrusher': G('triceps', 'Lower toward your forehead with still elbows, extend without locking.', 'Letting the elbows drift back so it becomes a press.'),
  'cable fly': G('chest', 'Slight elbow bend, hug an imaginary tree, squeeze in the middle.', 'Turning it into a press by bending the elbows too much.'),
  'plank': G('core', 'Forearms down, glutes and abs tight, one straight line from head to heels.', 'Hips sagging or piking.'),
  'dead bug': G('core', 'Lower back pressed into the floor, move opposite arm and leg slowly.', 'Letting the lower back arch off the floor.'),
  'hanging leg raise': G('core', 'Hang tall, lift your legs without swinging, lower slowly.', 'Swinging to get the legs up.'),
  'hanging toes-to-bar': G('core, grip', 'Pull the bar down slightly, lift the toes to the bar with control.', 'Kipping wildly instead of using the abs.'),
  "farmer's carry": G('grip, core', 'Stand tall, shoulders back, walk with short, steady steps.', 'Leaning to one side or shrugging.'),
};

// Names that are the same exercise as another entry, or a variation of it.
const ALIASES: Record<string, string> = {
  'push-up (knees ok)': 'push-up',
  'cable fly + rope pushdown': 'cable fly',
  'cable fly (superset with) rope pushdown': 'cable fly',
  'cable lateral raise (drop set on last)': 'cable lateral raise',
  'cable lateral raise (triple drop)': 'cable lateral raise',
  'ez-bar curl (superset) hammer curl': 'ez-bar curl',
  'incline curl (superset with) hammer curl': 'incline curl',
  'lateral raise (superset with) face pull': 'lateral raise',
  'leg extension (triple drop)': 'leg extension',
  'pause bench press': 'bench press',
  'pause front squat': 'front squat',
  'pause squat': 'back squat',
  'weighted walking lunge': 'walking lunge',
  'skullcrusher + close-grip press': 'skullcrusher',
  "farmer's carry (heavy)": "farmer's carry",
};

export function normalizeExerciseName(name: string): string {
  return String(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The guide for an exercise name, or null if there is none. */
export function guideFor(name: string): ExerciseGuide | null {
  const key = normalizeExerciseName(name);
  return GUIDES[key] ?? GUIDES[ALIASES[key] ?? ''] ?? null;
}

export const GUIDE_COUNT = Object.keys(GUIDES).length;
