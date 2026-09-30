import { FoodDatabaseItem } from './foods';

// Get a free key at https://fdc.nal.usda.gov/api-key-signup.html (no credit
// card, takes ~2 minutes, arrives by email) and put it in .env as
// EXPO_PUBLIC_USDA_API_KEY — see .env.example. Previously hardcoded here
// directly, which meant it was committed to git history; moved out for the
// same reason every other API key in this app (Gemini, Cloudinary) lives in
// .env instead of source.
export const USDA_API_KEY: string = process.env.EXPO_PUBLIC_USDA_API_KEY ?? '';

const NUTRIENT_IDS = {
  calories: 1008, // Energy (kcal)
  protein: 1003,
  carbs: 1005, // Carbohydrate, by difference
  fat: 1004, // Total lipid (fat)
};

function getNutrientValue(foodNutrients: any[], nutrientId: number): number {
  const match = foodNutrients?.find((n) => n.nutrientId === nutrientId);
  return match ? Math.round(match.value) : 0;
}

// USDA's Branded Foods come back in ALL CAPS ("ICE CREAM", "GREAT VALUE") —
// every other food name in this app is title case, and shouting looks like
// a bug. Small words stay lowercase mid-string (matching normal title-case
// convention) but always capitalize the first word.
function titleCase(text: string): string {
  const smallWords = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'or', 'with']);
  return text
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && smallWords.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

// A LOT of USDA's "duplicate" results aren't duplicates at all — they're
// distinct real products (a store's own ice cream vs. Blue Bunny's vs.
// Edy's) that all happen to share USDA's generic `description` field
// ("ICE CREAM"). The brand lives in a separate field USDA doesn't fold into
// the name. Appending it here is what makes 23 "ICE CREAM" results actually
// look and BE different, instead of requiring a name-based dedupe that
// would silently throw away 22 real, distinct foods to hide the "spam".
//
// `brandName` (e.g. "GREAT VALUE") is the retail brand printed on the
// package — prefer it. `brandOwner` (e.g. "Wal-Mart Stores, Inc.") is the
// legal corporate entity and is only a fallback for the branded items that
// don't set brandName at all.
function brandedName(description: string, brandName?: string, brandOwner?: string): string {
  const brand = (brandName || brandOwner || '').trim();
  const base = titleCase(description);
  if (!brand) return base;
  return `${base} (${titleCase(brand)})`;
}

// Searches the USDA FoodData Central database (hundreds of thousands of
// foods, including generic/exotic ingredients — not just US packaged
// products). Returns [] on any failure rather than throwing, so a bad
// network or a missing API key just means "no extra results," not a crash.
export async function searchUSDAFoods(query: string): Promise<FoodDatabaseItem[]> {
  if (!USDA_API_KEY) {
    return [];
  }
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=25`;
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('USDA API error:', response.status, body);
      return [];
    }
    const data = await response.json();
    const foods = data.foods || [];

    return foods.map((food: any): FoodDatabaseItem => {
      const servingLabel =
        food.servingSize && food.servingSizeUnit
          ? `${food.servingSize}${food.servingSizeUnit}`
          : '100g';
      return {
        id: `usda-${food.fdcId}`,
        name: brandedName(food.description, food.brandName, food.brandOwner),
        category: 'USDA',
        servingLabel,
        calories: getNutrientValue(food.foodNutrients, NUTRIENT_IDS.calories),
        protein: getNutrientValue(food.foodNutrients, NUTRIENT_IDS.protein),
        carbs: getNutrientValue(food.foodNutrients, NUTRIENT_IDS.carbs),
        fat: getNutrientValue(food.foodNutrients, NUTRIENT_IDS.fat),
      };
    });
  } catch (err) {
    console.error('USDA API request failed:', err);
    return [];
  }
}
