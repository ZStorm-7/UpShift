// Same idea as data/foodEmoji.ts — matches keywords in a quest's title to
// pick a fitting emoji, so the quest pool (firebase/quests.ts) can keep
// growing without needing a hand-picked icon added every time.
//
// Order matters: more specific phrases are checked before generic ones
// (e.g. 'rest day' before 'rest', 'water goal' before 'water'), so the most
// meaningful match wins rather than whichever keyword happens to be first.
const KEYWORD_EMOJI: [string, string][] = [
  // Workouts — specific muscle groups first
  ['leg day', '🦵'], ['arm day', '💪'], ['chest day', '🫀'], ['back day', '🦍'],
  ['full-body', '🔥'], ['muscle group', '🏋️'], ['personal best', '🏅'],
  ['bodyweight', '🤸'], ['warmup', '🔥'], ['stretch', '🧘'],
  ['walk or jog', '🏃'], ['walk outside', '🚶'], ['workout', '💪'],
  ['exercise', '🏋️'], ['sets', '🔢'],

  // Nutrition
  ['calorie goal', '🎯'], ['protein goal', '🍗'], ['combo meal', '🧑‍🍳'],
  ['homemade meal', '🍲'], ['added sugar', '🚫'], ['sugary drink', '🚫'],
  ['fruit or vegetable', '🥦'], ['fruits or vegetables', '🥦'],
  ['breakfast', '🍳'], ['snack', '🍿'], ['macros', '⚖️'],
  ['restaurant', '🍽️'], ['cook', '🧑‍🍳'], ['carbs', '🍞'],
  ['new food', '🆕'], ['meal', '🍽️'], ['food', '🍎'],

  // Hydration
  ['water goal', '💧'], ['glass of water', '🥛'], ['water', '💧'],

  // Sleep
  ['nap', '😴'], ['caffeine', '☕'], ['screens', '📵'],
  ['go to bed', '🛏️'], ['wake up', '⏰'], ['sleep', '😴'],

  // Consistency / streaks
  ['streak', '🔥'], ['daily quests', '✅'], ['every goal', '🏆'],
  ['open the app', '📱'], ['dashboard', '📊'], ['weight', '⚖️'],

  // Milestones
  ['reach level', '⭐'], ['earn 100 xp', '💯'], ['xp', '⭐'],
  ['rank', '👑'],

  // Mindfulness
  ['breathing', '🌬️'], ['proud of', '💭'], ['rest day', '🛌'],
  ['away from your phone', '📵'], ['plan tomorrow', '📝'],
  ['set a goal', '🎯'],

  // Variety / app actions
  ['avatar', '🙂'], ['settings', '⚙️'],
  ['share your rank', '🤝'], ['friend', '🤝'], ['weekend', '📅'],
];

const DEFAULT_EMOJI = '⭐';

export function getQuestEmoji(title: string): string {
  const lower = title.toLowerCase();
  for (const [keyword, emoji] of KEYWORD_EMOJI) {
    if (lower.includes(keyword)) return emoji;
  }
  return DEFAULT_EMOJI;
}
