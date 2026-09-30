import { doc } from 'firebase/firestore';
import { db } from './config';

// The rest of the app (food log, water, sleep) resets at midnight, keyed by
// calendar date (see firebase/progress.ts). Quests are different: they reset
// at NOON. So a quest "day" doesn't line up with a calendar day — it runs
// from 12:00pm to the next 12:00pm. This function returns the key for
// whichever quest-day "right now" falls into.
//
// Example: it's 9am on Aug 15. Noon hasn't happened yet today, so we're
// still inside the quest-day that STARTED at noon on Aug 14. Key = "2026-08-14".
// It's 3pm on Aug 15: noon already passed today, so the quest-day started at
// noon today. Key = "2026-08-15".
export function getQuestCycleKey(): string {
  const now = new Date();
  const cycleDate = new Date(now);
  if (now.getHours() < 12) {
    cycleDate.setDate(cycleDate.getDate() - 1);
  }
  const yyyy = cycleDate.getFullYear();
  const mm = String(cycleDate.getMonth() + 1).padStart(2, '0');
  const dd = String(cycleDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Milliseconds until the next 12:00pm in the device's own local time. Used
// to drive the countdown timer — no timezone math needed here because
// `Date` and `getHours()` already use whatever timezone the device is set to.
export function getMsUntilNextNoon(): number {
  const now = new Date();
  const nextNoon = new Date(now);
  nextNoon.setHours(12, 0, 0, 0);
  if (nextNoon.getTime() <= now.getTime()) {
    nextNoon.setDate(nextNoon.getDate() + 1);
  }
  return nextNoon.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Difficulty ladder. XP scales with tier, so a quest's reward is never set
// by hand — it's derived from how hard the quest is (see buildQuest below).
// That means changing what a tier is worth updates every quest at that tier
// at once, and it's impossible for two Hard quests to accidentally pay
// different amounts.
export type QuestTier = 'Easy' | 'Medium' | 'Hard' | 'Extreme' | 'Ultra';

export const TIER_XP: Record<QuestTier, number> = {
  Easy: 10,
  Medium: 20,
  Hard: 35,
  Extreme: 50,
  Ultra: 75,
};

// Each tier gets its own badge color so difficulty is readable at a glance
// without having to compare XP numbers.
export const TIER_COLOR: Record<QuestTier, string> = {
  Easy: '#3DD68C',    // green
  Medium: '#4C8DF6',  // blue
  Hard: '#F5A524',    // amber
  Extreme: '#FF6B35', // orange-red
  Ultra: '#C084FC',   // violet — the "very hard" tier
};

export type Quest = {
  id: number;
  title: string;
  tier: QuestTier;
  xp: number;
  category: string;
  // How many days of prior logged history this quest needs before it's even
  // possible. 0 means "doable on your very first day".
  requiresHistoryDays: number;
};

// Some quests are impossible until you've used the app for a while — you
// can't "beat yesterday's total sets" on day one, because there is no
// yesterday. Listing the requirement here (rather than as a 4th item on every
// tuple below) keeps it in one readable place, and anything not listed
// defaults to 0 = available immediately.
//
// The numbers are "days of history needed", not "days the quest spans": a
// 3-day streak needs 2 prior days plus today, so it's 2.
export const QUEST_HISTORY_REQUIREMENTS: Record<number, number> = {
  9: 1,    // Beat yesterday's total sets
  15: 2,   // Log 3 workouts this week
  32: 2,   // Hit your protein goal 3 days in a row
  49: 2,   // Hit your water goal 3 days in a row
  56: 2,   // Get consistent sleep 3 nights in a row
  58: 6,   // Log your sleep every day this week
  61: 6,   // Open the app every day this week
  63: 2,   // Complete all 3 daily quests 3 days in a row
  66: 2,   // Keep a 3-day quest streak alive
  67: 6,   // Keep a 7-day quest streak alive
  71: 2,   // Reach Level 5 — needs ~400 XP, not realistic in one day
  72: 4,   // Reach Level 10
  75: 7,   // Beat last week's total XP
  94: 3,   // A workout for every muscle group this week
  95: 6,   // Hit your water goal every day this week
  96: 4,   // Hit your calorie goal 5 days this week
  97: 4,   // 7+ hours of sleep 5 nights this week
  98: 2,   // Log every meal for 3 days straight
  99: 4,   // Complete 5 workouts this week
  100: 4,  // Complete every daily quest for 5 days this week
};

// Raw definitions: [id, title, tier]. IDs are stable and intentionally have
// gaps (14, 18, 25, 26, 48 were cut) — reusing a retired ID for a different
// quest would silently rewrite history in any already-saved quest document.
type RawQuest = [number, string, QuestTier];

const RAW_QUESTS: { category: string; quests: RawQuest[] }[] = [
  {
    category: 'Workouts',
    quests: [
      [1, 'Log a workout', 'Easy'],
      [2, 'Complete a leg day', 'Medium'],
      [3, 'Complete an arm day', 'Medium'],
      [4, 'Complete a chest day', 'Medium'],
      [5, 'Complete a back day', 'Medium'],
      [6, 'Complete 2 workouts today', 'Hard'],
      [7, 'Do a full-body workout (all 4 muscle groups)', 'Extreme'],
      [8, 'Complete every set in a workout without skipping rest', 'Medium'],
      [9, "Beat yesterday's total sets", 'Medium'],
      [10, "Try a muscle group you haven't done this week", 'Easy'],
      [11, 'Do a 10-minute warmup before your workout', 'Easy'],
      [12, 'Stretch for 5 minutes after your workout', 'Easy'],
      [13, 'Complete a workout before noon', 'Medium'],
      [15, 'Log 3 workouts this week', 'Hard'],
      [16, 'Hit a new personal best on any exercise', 'Hard'],
      [17, 'Do a bodyweight-only workout (no equipment)', 'Easy'],
      [19, 'Complete a workout with a friend', 'Medium'],
      [20, 'Walk or jog for 20 minutes', 'Easy'],
    ],
  },
  {
    category: 'Nutrition',
    quests: [
      // Was 'Easy' (10 XP) — the single most requested rebalance: hitting
      // your calorie goal for the WHOLE day is the core discipline this app
      // tracks, and it was paying out less than "Hit your protein goal"
      // (Medium, below) despite being the harder target to actually land.
      // Bumped to an existing tier rather than a bespoke number so it stays
      // inside the tier system everything else uses — no separate economy
      // to keep in sync.
      [21, 'Hit your calorie goal', 'Hard'],
      [22, 'Hit your protein goal', 'Medium'],
      [23, 'Log every meal today', 'Medium'],
      [24, 'Log breakfast', 'Easy'],
      [27, 'Log a fruit or vegetable today', 'Easy'],
      [28, 'Log 3 different fruits or vegetables today', 'Medium'],
      [29, 'Build a custom combo meal', 'Medium'],
      [30, 'Log a homemade meal (not packaged/takeout)', 'Medium'],
      [31, 'Skip added sugar for the day', 'Hard'],
      [32, 'Hit your protein goal 3 days in a row', 'Hard'],
      [33, "Try a new food you've never logged before", 'Easy'],
      [34, 'Log a meal within an hour of your workout', 'Medium'],
      [35, 'Keep carbs under a set target today', 'Medium'],
      [36, 'Log every meal before 9pm', 'Medium'],
      [37, 'Cook instead of ordering out', 'Medium'],
      [38, 'Log a snack under 200 kcal', 'Easy'],
      [39, 'Balance a meal across all 3 macros', 'Medium'],
      [40, 'Log 4 meals today', 'Medium'],
    ],
  },
  {
    category: 'Hydration',
    quests: [
      [41, 'Drink your water goal', 'Easy'],
      [42, 'Drink water before noon', 'Easy'],
      [43, 'Hit 50% of your water goal before lunch', 'Medium'],
      [44, 'Drink a full glass of water first thing in the morning', 'Easy'],
      [45, 'Hit your water goal before 6pm', 'Medium'],
      [46, 'Log water 3 separate times today', 'Easy'],
      [47, 'Skip sugary drinks for the day', 'Medium'],
      [49, 'Hit your water goal 3 days in a row', 'Hard'],
      [50, 'Drink an extra 500ml beyond your goal', 'Medium'],
    ],
  },
  {
    category: 'Sleep',
    quests: [
      [51, 'Get 7+ hours of sleep', 'Medium'],
      [52, 'Get 8+ hours of sleep', 'Hard'],
      [53, 'Log your sleep using bedtime + wake time', 'Easy'],
      [54, 'Go to bed before 11pm', 'Medium'],
      [55, 'Wake up before 8am', 'Easy'],
      [56, 'Get consistent sleep 3 nights in a row', 'Hard'],
      [57, 'No screens 30 minutes before bed', 'Medium'],
      [58, 'Log your sleep every day this week', 'Hard'],
      [59, 'Take a 20-minute nap (and still hit your sleep goal)', 'Easy'],
      [60, 'Avoid caffeine after 2pm', 'Medium'],
    ],
  },
  {
    category: 'Consistency',
    quests: [
      [61, 'Open the app every day this week', 'Medium'],
      [62, 'Complete all 3 daily quests', 'Hard'],
      [63, 'Complete all 3 daily quests 3 days in a row', 'Extreme'],
      [64, 'Log something before 10am', 'Easy'],
      [65, 'Hit every goal today (calories, water, sleep, workout)', 'Extreme'],
      [66, 'Keep a 3-day quest streak alive', 'Medium'],
      [67, 'Keep a 7-day quest streak alive', 'Ultra'],
      [68, 'Log your weight for the week', 'Easy'],
      [69, 'Check your Dashboard before noon', 'Easy'],
      [70, 'Complete a quest before your first meal', 'Easy'],
    ],
  },
  {
    category: 'Milestones',
    quests: [
      [71, 'Reach Level 5 (Grinder rank)', 'Hard'],
      [72, 'Reach Level 10 (Athlete rank)', 'Extreme'],
      [73, 'Earn 100 XP in a single day', 'Extreme'],
      [74, 'Earn XP from 3 different quest categories in one day', 'Medium'],
      [75, "Beat last week's total XP", 'Hard'],
    ],
  },
  {
    category: 'Mindfulness',
    quests: [
      [76, 'Take 5 minutes to stretch, unrelated to a workout', 'Easy'],
      [77, 'Take a 10-minute walk outside', 'Easy'],
      [78, 'Do a breathing exercise for 5 minutes', 'Easy'],
      [79, "Write down one thing you're proud of today", 'Easy'],
      [80, 'Take a full rest day from workouts', 'Easy'],
      [81, 'Spend 10 minutes away from your phone', 'Medium'],
      [82, "Plan tomorrow's meals tonight", 'Medium'],
      [83, "Set a goal for tomorrow's workout", 'Easy'],
    ],
  },
  {
    category: 'Variety',
    quests: [
      [84, "Log a food you've never logged before", 'Easy'],
      [85, "Try a new exercise from a muscle group you haven't picked lately", 'Medium'],
      [86, 'Change your profile avatar', 'Easy'],
      [87, "Update your goal in Settings if it's changed", 'Easy'],
      [89, 'Build a combo meal with 3+ ingredients', 'Medium'],
      [90, 'Log a workout on a weekend', 'Easy'],
      [91, 'Complete a quest before anyone else in your house', 'Medium'],
      [92, 'Share your rank with a friend', 'Easy'],
      [93, 'Log food from a restaurant using the USDA search', 'Easy'],
    ],
  },
  {
    // Heads up: these span multiple days, but the quest system only tracks
    // completion within one noon-to-noon cycle. Since quests are completed
    // by tapping (honor system — nothing is auto-verified), they still work,
    // they just won't remember partial progress across cycles.
    category: 'Weekly',
    quests: [
      [94, 'Complete a workout for every muscle group this week', 'Ultra'],
      [95, 'Hit your water goal every day this week', 'Ultra'],
      [96, 'Hit your calorie goal 5 days this week', 'Ultra'],
      [97, 'Get 7+ hours of sleep 5 nights this week', 'Ultra'],
      [98, 'Log every meal for 3 days straight', 'Extreme'],
      [99, 'Complete 5 workouts this week', 'Ultra'],
      [100, 'Complete every daily quest for 5 days this week', 'Ultra'],
    ],
  },
];

// Flattens the grouped definitions above into the single list the app picks
// from, attaching each quest's category and its tier-derived XP value.
export const QUEST_POOL: Quest[] = RAW_QUESTS.flatMap(group =>
  group.quests.map(([id, title, tier]) => ({
    id,
    title,
    tier,
    xp: TIER_XP[tier],
    category: group.category,
    requiresHistoryDays: QUEST_HISTORY_REQUIREMENTS[id] || 0,
  }))
);

// Deterministic-feeling pick: uses the cycle key as a seed so everyone who
// looks at "today's" quests before the next noon sees the same list, but
// it's a fresh combination each cycle.
//
// `historyDays` is how many prior days the user has actually logged data for.
// Quests needing more history than that are excluded from the draw entirely —
// they aren't consumed or discarded, they just aren't eligible yet, so they
// come back into rotation automatically once the user has been around long
// enough. That's what stops a brand-new account from being handed
// "Keep a 7-day quest streak alive" on its first afternoon.
export function pickDailyQuests(cycleKey: string, count = 3, historyDays = 0): Quest[] {
  let seed = 0;
  for (let i = 0; i < cycleKey.length; i++) {
    seed = (seed * 31 + cycleKey.charCodeAt(i)) >>> 0;
  }
  const pool = QUEST_POOL.filter(q => q.requiresHistoryDays <= historyDays);
  const picked: Quest[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const index = seed % pool.length;
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

// Stores the currently-active quest list + which of them are done, tagged
// with the cycle key it belongs to. When the app notices the stored
// cycleKey no longer matches getQuestCycleKey(), it knows noon has passed
// and it's time to generate a new list.
export function questDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'quests');
}
