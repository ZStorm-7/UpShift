import { FoodDatabaseItem } from './foods';

// Get a free key at https://fdc.nal.usda.gov/api-key-signup.html (no credit
// card, takes ~2 minutes, arrives by email). Paste it below.
// Annotated as `string` on purpose. Without it, TypeScript infers the exact
// key as a *literal* type, and the placeholder guard further down
// (`USDA_API_KEY === 'YOUR_USDA_API_KEY_HERE'`) becomes a compile error —
// TS sees two string literals that can never be equal and flags the
// comparison as unintentional (TS2367).
export const USDA_API_KEY: string = 'SdkmLrf4rbhPkveKqLZJp7T0f98WaI2iPfuxuyT7';

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

// Searches the USDA FoodData Central database (hundreds of thousands of
// foods, including generic/exotic ingredients — not just US packaged
// products). Returns [] on any failure rather than throwing, so a bad
// network or a missing API key just means "no extra results," not a crash.
export async function searchUSDAFoods(query: string): Promise<FoodDatabaseItem[]> {
  if (!USDA_API_KEY || USDA_API_KEY === 'YOUR_USDA_API_KEY_HERE') {
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
        name: food.description,
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
