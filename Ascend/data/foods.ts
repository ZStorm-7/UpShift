export type FoodDatabaseItem = {
  id: string;
  name: string;
  category: string;
  servingLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// Nutrition values are approximate, per the stated serving. Quantities are
// scaled by the user in the app (e.g. 1.5x), so these are meant as sensible
// per-serving baselines rather than exact figures for any specific brand.
export const FOOD_DATABASE: FoodDatabaseItem[] = [
  // Protein
  { id: 'chicken-breast', name: 'Chicken Breast (grilled)', category: 'Protein', servingLabel: '100g', calories: 165, protein: 31, carbs: 0, fat: 4 },
  { id: 'chicken-thigh', name: 'Chicken Thigh (grilled)', category: 'Protein', servingLabel: '100g', calories: 209, protein: 26, carbs: 0, fat: 11 },
  { id: 'ground-beef-90', name: 'Ground Beef (90% lean)', category: 'Protein', servingLabel: '100g', calories: 176, protein: 20, carbs: 0, fat: 10 },
  { id: 'ground-turkey', name: 'Ground Turkey (93% lean)', category: 'Protein', servingLabel: '100g', calories: 150, protein: 20, carbs: 0, fat: 7 },
  { id: 'salmon', name: 'Salmon (baked)', category: 'Protein', servingLabel: '100g', calories: 208, protein: 20, carbs: 0, fat: 13 },
  { id: 'tuna-canned', name: 'Tuna (canned, in water)', category: 'Protein', servingLabel: '100g', calories: 116, protein: 26, carbs: 0, fat: 1 },
  { id: 'shrimp', name: 'Shrimp (cooked)', category: 'Protein', servingLabel: '100g', calories: 99, protein: 24, carbs: 0, fat: 1 },
  { id: 'egg', name: 'Egg (large)', category: 'Protein', servingLabel: '1 egg', calories: 78, protein: 6, carbs: 1, fat: 5 },
  { id: 'egg-whites', name: 'Egg Whites', category: 'Protein', servingLabel: '100g', calories: 52, protein: 11, carbs: 1, fat: 0 },
  { id: 'tofu', name: 'Tofu (firm)', category: 'Protein', servingLabel: '100g', calories: 144, protein: 15, carbs: 3, fat: 9 },
  { id: 'tempeh', name: 'Tempeh', category: 'Protein', servingLabel: '100g', calories: 195, protein: 20, carbs: 8, fat: 11 },
  { id: 'pork-chop', name: 'Pork Chop (grilled)', category: 'Protein', servingLabel: '100g', calories: 231, protein: 25, carbs: 0, fat: 14 },
  { id: 'bacon', name: 'Bacon', category: 'Protein', servingLabel: '2 slices', calories: 90, protein: 6, carbs: 0, fat: 7 },
  { id: 'protein-shake', name: 'Whey Protein Shake', category: 'Protein', servingLabel: '1 scoop', calories: 120, protein: 24, carbs: 3, fat: 1 },
  { id: 'steak-sirloin', name: 'Sirloin Steak', category: 'Protein', servingLabel: '100g', calories: 183, protein: 27, carbs: 0, fat: 8 },

  // Carbs / Grains
  { id: 'white-rice', name: 'White Rice (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 205, protein: 4, carbs: 45, fat: 0 },
  { id: 'brown-rice', name: 'Brown Rice (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 216, protein: 5, carbs: 45, fat: 2 },
  { id: 'quinoa', name: 'Quinoa (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 222, protein: 8, carbs: 39, fat: 4 },
  { id: 'oatmeal', name: 'Oatmeal (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 158, protein: 6, carbs: 27, fat: 3 },
  { id: 'white-bread', name: 'White Bread', category: 'Carbs', servingLabel: '1 slice', calories: 75, protein: 3, carbs: 14, fat: 1 },
  { id: 'whole-wheat-bread', name: 'Whole Wheat Bread', category: 'Carbs', servingLabel: '1 slice', calories: 81, protein: 4, carbs: 14, fat: 1 },
  { id: 'pasta', name: 'Pasta (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 221, protein: 8, carbs: 43, fat: 1 },
  { id: 'potato', name: 'Potato (baked, with skin)', category: 'Carbs', servingLabel: '1 medium', calories: 161, protein: 4, carbs: 37, fat: 0 },
  { id: 'sweet-potato', name: 'Sweet Potato (baked)', category: 'Carbs', servingLabel: '1 medium', calories: 103, protein: 2, carbs: 24, fat: 0 },
  { id: 'tortilla-flour', name: 'Flour Tortilla', category: 'Carbs', servingLabel: '1 tortilla', calories: 146, protein: 4, carbs: 24, fat: 4 },
  { id: 'bagel', name: 'Bagel (plain)', category: 'Carbs', servingLabel: '1 bagel', calories: 289, protein: 11, carbs: 56, fat: 2 },
  { id: 'cereal', name: 'Cereal (bran flakes)', category: 'Carbs', servingLabel: '1 cup', calories: 127, protein: 4, carbs: 31, fat: 1 },
  { id: 'granola', name: 'Granola', category: 'Carbs', servingLabel: '1/2 cup', calories: 298, protein: 8, carbs: 32, fat: 15 },
  { id: 'corn', name: 'Corn (kernels)', category: 'Carbs', servingLabel: '1 cup', calories: 143, protein: 5, carbs: 31, fat: 2 },
  { id: 'couscous', name: 'Couscous (cooked)', category: 'Carbs', servingLabel: '1 cup', calories: 176, protein: 6, carbs: 36, fat: 0 },

  // Fruits
  { id: 'banana', name: 'Banana', category: 'Fruits', servingLabel: '1 medium', calories: 105, protein: 1, carbs: 27, fat: 0 },
  { id: 'apple', name: 'Apple', category: 'Fruits', servingLabel: '1 medium', calories: 95, protein: 0, carbs: 25, fat: 0 },
  { id: 'orange', name: 'Orange', category: 'Fruits', servingLabel: '1 medium', calories: 62, protein: 1, carbs: 15, fat: 0 },
  { id: 'strawberries', name: 'Strawberries', category: 'Fruits', servingLabel: '1 cup', calories: 49, protein: 1, carbs: 12, fat: 0 },
  { id: 'blueberries', name: 'Blueberries', category: 'Fruits', servingLabel: '1 cup', calories: 84, protein: 1, carbs: 21, fat: 0 },
  { id: 'grapes', name: 'Grapes', category: 'Fruits', servingLabel: '1 cup', calories: 104, protein: 1, carbs: 27, fat: 0 },
  { id: 'pineapple', name: 'Pineapple', category: 'Fruits', servingLabel: '1 cup', calories: 82, protein: 1, carbs: 22, fat: 0 },
  { id: 'mango', name: 'Mango', category: 'Fruits', servingLabel: '1 cup', calories: 99, protein: 1, carbs: 25, fat: 1 },
  { id: 'watermelon', name: 'Watermelon', category: 'Fruits', servingLabel: '1 cup', calories: 46, protein: 1, carbs: 12, fat: 0 },
  { id: 'avocado', name: 'Avocado', category: 'Fruits', servingLabel: '1/2 avocado', calories: 161, protein: 2, carbs: 9, fat: 15 },
  { id: 'peach', name: 'Peach', category: 'Fruits', servingLabel: '1 medium', calories: 59, protein: 1, carbs: 14, fat: 0 },
  { id: 'pear', name: 'Pear', category: 'Fruits', servingLabel: '1 medium', calories: 101, protein: 1, carbs: 27, fat: 0 },

  // Vegetables
  { id: 'broccoli', name: 'Broccoli (steamed)', category: 'Vegetables', servingLabel: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 1 },
  { id: 'spinach', name: 'Spinach (raw)', category: 'Vegetables', servingLabel: '2 cups', calories: 14, protein: 2, carbs: 2, fat: 0 },
  { id: 'carrots', name: 'Carrots (raw)', category: 'Vegetables', servingLabel: '1 cup', calories: 52, protein: 1, carbs: 12, fat: 0 },
  { id: 'green-beans', name: 'Green Beans (steamed)', category: 'Vegetables', servingLabel: '1 cup', calories: 44, protein: 2, carbs: 10, fat: 0 },
  { id: 'bell-pepper', name: 'Bell Pepper', category: 'Vegetables', servingLabel: '1 medium', calories: 24, protein: 1, carbs: 6, fat: 0 },
  { id: 'tomato', name: 'Tomato', category: 'Vegetables', servingLabel: '1 medium', calories: 22, protein: 1, carbs: 5, fat: 0 },
  { id: 'cucumber', name: 'Cucumber', category: 'Vegetables', servingLabel: '1 cup', calories: 16, protein: 1, carbs: 4, fat: 0 },
  { id: 'zucchini', name: 'Zucchini (cooked)', category: 'Vegetables', servingLabel: '1 cup', calories: 27, protein: 2, carbs: 5, fat: 0 },
  { id: 'mixed-salad', name: 'Mixed Green Salad (no dressing)', category: 'Vegetables', servingLabel: '2 cups', calories: 20, protein: 2, carbs: 4, fat: 0 },
  { id: 'cauliflower', name: 'Cauliflower (steamed)', category: 'Vegetables', servingLabel: '1 cup', calories: 29, protein: 2, carbs: 5, fat: 0 },
  { id: 'asparagus', name: 'Asparagus (steamed)', category: 'Vegetables', servingLabel: '1 cup', calories: 40, protein: 4, carbs: 7, fat: 0 },

  // Dairy
  { id: 'greek-yogurt', name: 'Greek Yogurt (plain, nonfat)', category: 'Dairy', servingLabel: '1 cup', calories: 133, protein: 23, carbs: 9, fat: 0 },
  { id: 'yogurt', name: 'Yogurt (plain, low-fat)', category: 'Dairy', servingLabel: '1 cup', calories: 154, protein: 13, carbs: 17, fat: 4 },
  { id: 'milk-whole', name: 'Milk (whole)', category: 'Dairy', servingLabel: '1 cup', calories: 149, protein: 8, carbs: 12, fat: 8 },
  { id: 'milk-skim', name: 'Milk (skim)', category: 'Dairy', servingLabel: '1 cup', calories: 83, protein: 8, carbs: 12, fat: 0 },
  { id: 'cottage-cheese', name: 'Cottage Cheese (low-fat)', category: 'Dairy', servingLabel: '1 cup', calories: 163, protein: 28, carbs: 6, fat: 2 },
  { id: 'cheddar-cheese', name: 'Cheddar Cheese', category: 'Dairy', servingLabel: '1 oz (28g)', calories: 113, protein: 7, carbs: 0, fat: 9 },
  { id: 'mozzarella', name: 'Mozzarella Cheese', category: 'Dairy', servingLabel: '1 oz (28g)', calories: 85, protein: 6, carbs: 1, fat: 6 },
  { id: 'butter', name: 'Butter', category: 'Dairy', servingLabel: '1 tbsp', calories: 102, protein: 0, carbs: 0, fat: 12 },
  { id: 'cream-cheese', name: 'Cream Cheese', category: 'Dairy', servingLabel: '1 tbsp', calories: 51, protein: 1, carbs: 1, fat: 5 },

  // Nuts, Seeds & Fats
  { id: 'almonds', name: 'Almonds', category: 'Nuts & Fats', servingLabel: '1 oz (23 nuts)', calories: 164, protein: 6, carbs: 6, fat: 14 },
  { id: 'peanut-butter', name: 'Peanut Butter', category: 'Nuts & Fats', servingLabel: '2 tbsp', calories: 188, protein: 8, carbs: 7, fat: 16 },
  { id: 'walnuts', name: 'Walnuts', category: 'Nuts & Fats', servingLabel: '1 oz (14 halves)', calories: 185, protein: 4, carbs: 4, fat: 18 },
  { id: 'cashews', name: 'Cashews', category: 'Nuts & Fats', servingLabel: '1 oz (18 nuts)', calories: 157, protein: 5, carbs: 9, fat: 12 },
  { id: 'olive-oil', name: 'Olive Oil', category: 'Nuts & Fats', servingLabel: '1 tbsp', calories: 119, protein: 0, carbs: 0, fat: 14 },
  { id: 'chia-seeds', name: 'Chia Seeds', category: 'Nuts & Fats', servingLabel: '1 oz (28g)', calories: 138, protein: 5, carbs: 12, fat: 9 },
  { id: 'almond-butter', name: 'Almond Butter', category: 'Nuts & Fats', servingLabel: '2 tbsp', calories: 196, protein: 7, carbs: 6, fat: 18 },

  // Legumes
  { id: 'black-beans', name: 'Black Beans (cooked)', category: 'Legumes', servingLabel: '1 cup', calories: 227, protein: 15, carbs: 41, fat: 1 },
  { id: 'chickpeas', name: 'Chickpeas (cooked)', category: 'Legumes', servingLabel: '1 cup', calories: 269, protein: 15, carbs: 45, fat: 4 },
  { id: 'lentils', name: 'Lentils (cooked)', category: 'Legumes', servingLabel: '1 cup', calories: 230, protein: 18, carbs: 40, fat: 1 },
  { id: 'kidney-beans', name: 'Kidney Beans (cooked)', category: 'Legumes', servingLabel: '1 cup', calories: 225, protein: 15, carbs: 40, fat: 1 },
  { id: 'edamame', name: 'Edamame', category: 'Legumes', servingLabel: '1 cup', calories: 189, protein: 17, carbs: 16, fat: 8 },

  // Snacks & Other
  { id: 'protein-bar', name: 'Protein Bar', category: 'Snacks', servingLabel: '1 bar', calories: 200, protein: 20, carbs: 22, fat: 7 },
  { id: 'dark-chocolate', name: 'Dark Chocolate (70%)', category: 'Snacks', servingLabel: '1 oz (28g)', calories: 170, protein: 2, carbs: 13, fat: 12 },
  { id: 'popcorn', name: 'Popcorn (air-popped)', category: 'Snacks', servingLabel: '3 cups', calories: 93, protein: 3, carbs: 19, fat: 1 },
  { id: 'potato-chips', name: 'Potato Chips', category: 'Snacks', servingLabel: '1 oz (28g)', calories: 152, protein: 2, carbs: 15, fat: 10 },
  { id: 'rice-cakes', name: 'Rice Cakes', category: 'Snacks', servingLabel: '2 cakes', calories: 70, protein: 1, carbs: 15, fat: 0 },
  { id: 'trail-mix', name: 'Trail Mix', category: 'Snacks', servingLabel: '1/4 cup', calories: 173, protein: 5, carbs: 17, fat: 11 },
  { id: 'hummus', name: 'Hummus', category: 'Snacks', servingLabel: '2 tbsp', calories: 70, protein: 2, carbs: 6, fat: 5 },
  { id: 'protein-cookie', name: 'Protein Cookie', category: 'Snacks', servingLabel: '1 cookie', calories: 180, protein: 15, carbs: 20, fat: 6 },
  { id: 'jerky', name: 'Beef Jerky', category: 'Snacks', servingLabel: '1 oz (28g)', calories: 116, protein: 9, carbs: 3, fat: 7 },
  { id: 'pretzels', name: 'Pretzels', category: 'Snacks', servingLabel: '1 oz (28g)', calories: 108, protein: 3, carbs: 22, fat: 1 },

  // Drinks
  { id: 'orange-juice', name: 'Orange Juice', category: 'Drinks', servingLabel: '1 cup', calories: 111, protein: 2, carbs: 26, fat: 0 },
  { id: 'protein-smoothie', name: 'Protein Smoothie', category: 'Drinks', servingLabel: '1 serving (16oz)', calories: 280, protein: 25, carbs: 35, fat: 4 },
  { id: 'black-coffee', name: 'Coffee (black)', category: 'Drinks', servingLabel: '1 cup', calories: 2, protein: 0, carbs: 0, fat: 0 },
  { id: 'latte', name: 'Latte (whole milk)', category: 'Drinks', servingLabel: '12 oz', calories: 170, protein: 9, carbs: 13, fat: 9 },

  // Common meals / fast food
  { id: 'pizza-slice', name: 'Pizza (cheese, 1 slice)', category: 'Meals', servingLabel: '1 slice', calories: 285, protein: 12, carbs: 36, fat: 10 },
  { id: 'burger', name: 'Hamburger (fast food)', category: 'Meals', servingLabel: '1 burger', calories: 354, protein: 20, carbs: 33, fat: 17 },
  { id: 'chicken-sandwich', name: 'Grilled Chicken Sandwich', category: 'Meals', servingLabel: '1 sandwich', calories: 350, protein: 34, carbs: 35, fat: 8 },
  { id: 'burrito', name: 'Chicken Burrito', category: 'Meals', servingLabel: '1 burrito', calories: 550, protein: 30, carbs: 65, fat: 18 },
  { id: 'caesar-salad', name: 'Caesar Salad (with chicken)', category: 'Meals', servingLabel: '1 bowl', calories: 470, protein: 32, carbs: 15, fat: 30 },
  { id: 'sushi-roll', name: 'Sushi Roll (California)', category: 'Meals', servingLabel: '8 pieces', calories: 255, protein: 9, carbs: 38, fat: 7 },
  { id: 'pad-thai', name: 'Pad Thai', category: 'Meals', servingLabel: '1 plate', calories: 500, protein: 20, carbs: 60, fat: 20 },
  { id: 'fried-rice', name: 'Fried Rice', category: 'Meals', servingLabel: '1 cup', calories: 333, protein: 8, carbs: 41, fat: 15 },
  { id: 'tacos-chicken', name: 'Chicken Tacos (2)', category: 'Meals', servingLabel: '2 tacos', calories: 340, protein: 25, carbs: 30, fat: 13 },
  { id: 'oatmeal-bowl', name: 'Oatmeal Bowl (with fruit & nuts)', category: 'Meals', servingLabel: '1 bowl', calories: 350, protein: 10, carbs: 55, fat: 11 },
];
