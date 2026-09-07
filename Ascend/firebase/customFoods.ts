import { doc } from 'firebase/firestore';
import { db } from './config';

// A "combo" is a food the user built themselves out of other foods (e.g.
// chicken + pasta = "Nana's Pasta"). We keep the individual ingredients
// (name + how many servings of each) alongside the pre-computed totals, so
// the totals are fast to display without recalculating, but the recipe
// itself isn't lost either.
export type CustomFood = {
  id: string;
  name: string;
  servingLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: { name: string; quantity: number }[];
};

// One doc per user holding every combo they've ever saved — same pattern as
// the quests doc (a single small doc is simpler than a subcollection when
// the list is short and always read/written as a whole).
export function customFoodsDocRef(uid: string) {
  return doc(db, 'users', uid, 'meta', 'customFoods');
}
