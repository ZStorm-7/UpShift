// Picks a fitting emoji for a food by matching keywords in its name, since
// there's no live AI image generation available for search results that
// come from the (huge, unpredictable) USDA database. Falls back to a
// category-level emoji, then a generic plate if nothing matches.
//
// Order matters: more specific keywords are checked before generic ones
// (e.g. "sweet potato" before "potato") so the best match wins.
const KEYWORD_EMOJI: [string, string][] = [
  // Specific proteins
  ['chicken', '🍗'], ['turkey', '🦃'], ['bacon', '🥓'], ['pork', '🥓'],
  ['beef', '🥩'], ['steak', '🥩'], ['lamb', '🥩'], ['salmon', '🐟'],
  ['tuna', '🐟'], ['shrimp', '🦐'], ['prawn', '🦐'], ['fish', '🐟'],
  ['egg', '🥚'], ['tofu', '🧈'], ['tempeh', '🧈'],

  // Grains / carbs
  ['sweet potato', '🍠'], ['potato', '🥔'], ['rice', '🍚'],
  ['bread', '🍞'], ['bagel', '🥯'], ['tortilla', '🫓'], ['pasta', '🍝'],
  ['noodle', '🍜'], ['oat', '🥣'], ['cereal', '🥣'], ['granola', '🥣'],
  ['quinoa', '🌾'], ['couscous', '🌾'], ['corn', '🌽'],

  // Fruits
  ['banana', '🍌'], ['apple', '🍎'], ['orange', '🍊'], ['strawberr', '🍓'],
  ['blueberr', '🫐'], ['grape', '🍇'], ['pineapple', '🍍'], ['mango', '🥭'],
  ['watermelon', '🍉'], ['avocado', '🥑'], ['peach', '🍑'], ['pear', '🍐'],
  ['papaya', '🥭'], ['kiwi', '🥝'], ['coconut', '🥥'], ['lemon', '🍋'],
  ['lime', '🍋'], ['cherry', '🍒'], ['fig', '🌱'],

  // Vegetables
  ['broccoli', '🥦'], ['spinach', '🥬'], ['lettuce', '🥬'], ['kale', '🥬'],
  ['carrot', '🥕'], ['pepper', '🫑'], ['tomato', '🍅'], ['cucumber', '🥒'],
  ['zucchini', '🥒'], ['salad', '🥗'], ['cauliflower', '🥦'],
  ['asparagus', '🌱'], ['mushroom', '🍄'], ['onion', '🧅'], ['garlic', '🧄'],
  ['kimchi', '🥬'],

  // Dairy
  ['yogurt', '🥣'], ['milk', '🥛'], ['cottage cheese', '🧀'],
  ['cheddar', '🧀'], ['mozzarella', '🧀'], ['cheese', '🧀'],
  ['butter', '🧈'], ['cream cheese', '🧈'],

  // Nuts / fats / legumes
  ['almond', '🌰'], ['peanut', '🥜'], ['walnut', '🌰'], ['cashew', '🌰'],
  ['olive oil', '🫒'], ['olive', '🫒'], ['chia', '🌱'], ['seed', '🌱'],
  ['bean', '🫘'], ['chickpea', '🫘'], ['lentil', '🫘'], ['edamame', '🫛'],
  ['hummus', '🫘'], ['falafel', '🧆'],

  // Snacks / sweets
  ['chocolate', '🍫'], ['popcorn', '🍿'], ['chip', '🥔'], ['cookie', '🍪'],
  ['jerky', '🥩'], ['pretzel', '🥨'], ['trail mix', '🥜'], ['candy', '🍬'],
  ['donut', '🍩'], ['cake', '🍰'], ['ice cream', '🍨'], ['pie', '🥧'],
  ['waffle', '🧇'], ['pancake', '🥞'], ['honey', '🍯'],

  // Drinks
  ['coffee', '☕'], ['latte', '☕'], ['tea', '🍵'], ['juice', '🧃'],
  ['smoothie', '🥤'], ['soda', '🥤'], ['beer', '🍺'], ['wine', '🍷'],

  // Meals / cuisines
  ['pizza', '🍕'], ['burger', '🍔'], ['sandwich', '🥪'], ['burrito', '🌯'],
  ['taco', '🌮'], ['sushi', '🍣'], ['curry', '🍛'], ['dumpling', '🥟'],
  ['ramen', '🍜'], ['soup', '🍲'], ['stew', '🍲'], ['pad thai', '🍜'],
  ['fried rice', '🍚'], ['bowl', '🥗'],

  // Protein shakes / bars
  ['protein shake', '🥤'], ['protein bar', '🍫'], ['protein cookie', '🍪'],
];

const CATEGORY_EMOJI: Record<string, string> = {
  Protein: '🍗',
  Carbs: '🍞',
  Fruits: '🍎',
  Vegetables: '🥦',
  Dairy: '🥛',
  'Nuts & Fats': '🥜',
  Legumes: '🫘',
  Snacks: '🍿',
  Drinks: '🥤',
  Meals: '🍽️',
  Combo: '🧑‍🍳',
};

const DEFAULT_EMOJI = '🍽️';

export function getFoodEmoji(name: string, category?: string): string {
  const lowerName = name.toLowerCase();
  for (const [keyword, emoji] of KEYWORD_EMOJI) {
    if (lowerName.includes(keyword)) return emoji;
  }
  if (category && CATEGORY_EMOJI[category]) return CATEGORY_EMOJI[category];
  return DEFAULT_EMOJI;
}
