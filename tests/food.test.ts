import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGtin, normalizeBarcode, parseOffProduct, scaleFood, lookupBarcode } from '../services/food/barcode';
import { cleanFoodItem, cleanSavedMeal, recentFoods, mealTotals, MAX_ITEMS_PER_MEAL } from '../services/food/library';

test('gtin check digits', () => {
  for (const ok of ['3017620422003', '737628064502', '96385074', '5449000000996', '0 12345 67890 5'.replace(/ /g, '')]) assert.ok(isValidGtin(ok), ok);
  for (const bad of ['3017620422004', '123', '', 'abcdefghijklm', '30176204220031', '737628064503']) assert.ok(!isValidGtin(bad), bad);
  assert.equal(normalizeBarcode(' 3017 6204-22003 '), '3017620422003');
});

const nutella = { status: 1, product: { product_name: 'Nutella', brands: 'Ferrero,Other', serving_size: '15 g', nutriments: { 'energy-kcal_serving': 80, proteins_serving: 0.9, carbohydrates_serving: 8.6, fat_serving: 4.6, 'energy-kcal_100g': 539 } } };
test('open food facts: per serving when the label has it', () => {
  assert.deepEqual(parseOffProduct(nutella), { name: 'Nutella', brand: 'Ferrero', basis: 'serving', servingLabel: '15 g', calories: 80, protein: 0.9, carbs: 8.6, fat: 4.6 });
});
test('open food facts: falls back to 100 g, then to kilojoules', () => {
  const per100 = { status: 1, product: { product_name: 'Oats', nutriments: { 'energy-kcal_100g': '372,5', proteins_100g: 13.5, carbohydrates_100g: 60, fat_100g: 7 } } };
  assert.deepEqual(parseOffProduct(per100), { name: 'Oats', brand: '', basis: 'per100g', servingLabel: '100 g', calories: 373, protein: 13.5, carbs: 60, fat: 7 });
  const kj = { status: 1, product: { product_name: 'Bar', nutriments: { energy_100g: 1000 } } };
  assert.equal(parseOffProduct(kj)!.calories, 239);
});
test('open food facts: missing or unusable products are null', () => {
  assert.equal(parseOffProduct(null), null); assert.equal(parseOffProduct({ status: 0 }), null);
  assert.equal(parseOffProduct({ status: 1, product: { product_name: '', nutriments: { 'energy-kcal_100g': 5 } } }), null);
  assert.equal(parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: {} } }), null);
  assert.equal(parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: { 'energy-kcal_100g': -4 } } }), null);
  assert.equal(parseOffProduct({ status: 1, product: { product_name: 'X', nutriments: { 'energy-kcal_100g': 99999 } } }), null);
});
test('scaling by servings is clamped', () => {
  const f = parseOffProduct(nutella)!;
  assert.deepEqual(scaleFood(f, 2), { name: 'Nutella (Ferrero)', calories: 160, protein: 1.8, carbs: 17.2, fat: 9.2 });
  assert.equal(scaleFood(f, 0).calories, 20); assert.equal(scaleFood(f, 1e6).calories, 1600);
});
test('brand is not repeated when the name already has it', () => {
  const f = { name: 'Nutella', brand: 'Nutella', basis: 'per100g' as const, servingLabel: '100 g', calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9 };
  assert.equal(scaleFood(f, 1).name, 'Nutella');
  assert.equal(scaleFood({ ...f, name: 'Cola Zero', brand: 'Coca-Cola' }, 1).name, 'Cola Zero (Coca-Cola)');
});
test('lookup: validates first, maps responses, never throws', async () => {
  const mk = (status: number, body?: any) => (async () => ({ status, ok: status >= 200 && status < 300, json: async () => body })) as any;
  assert.deepEqual(await lookupBarcode('123', mk(200)), { ok: false, error: 'invalid' });
  assert.deepEqual(await lookupBarcode('3017620422003', mk(200, nutella)), { ok: true, food: parseOffProduct(nutella)! });
  assert.deepEqual(await lookupBarcode('3017620422003', mk(404)), { ok: false, error: 'notfound' });
  assert.deepEqual(await lookupBarcode('3017620422003', mk(200, { status: 0 })), { ok: false, error: 'notfound' });
  assert.deepEqual(await lookupBarcode('3017620422003', mk(500)), { ok: false, error: 'network' });
  assert.deepEqual(await lookupBarcode('3017620422003', (async () => { throw new Error('offline'); }) as any), { ok: false, error: 'network' });
  assert.deepEqual(await lookupBarcode('3017620422003', mk(200, { status: 1, product: { product_name: 'X', nutriments: {} } })), { ok: false, error: 'nonutrition' });
});

test('food items and saved meals are cleaned', () => {
  assert.equal(cleanFoodItem({ name: '', calories: 5 }), null);
  assert.deepEqual(cleanFoodItem({ name: ' Egg<b> ', calories: '78', protein: 6.04, carbs: -3, fat: 'x' }), { name: 'Eggb', calories: 78, protein: 6, carbs: 0, fat: 0 });
  assert.equal(cleanFoodItem({ name: 'x', calories: 1e9 })!.calories, 5000);
  assert.equal(cleanSavedMeal({ name: '', items: [{ name: 'a' }] }, 'i'), null);
  assert.equal(cleanSavedMeal({ name: 'Breakfast', items: [] }, 'i'), null);
  assert.equal(cleanSavedMeal({ name: 'B', items: Array.from({ length: 50 }, (_, i) => ({ name: 'f' + i })) }, 'i')!.items.length, MAX_ITEMS_PER_MEAL);
  assert.deepEqual(mealTotals([{ name: 'a', calories: 100, protein: 5, carbs: 10, fat: 2 }, { name: 'b', calories: 50, protein: 1, carbs: 2, fat: 3 }]), { calories: 150, protein: 6, carbs: 12, fat: 5 });
});
test('recent foods: newest first, duplicates collapsed, limited', () => {
  const egg = { name: 'Egg', calories: 78, protein: 6, carbs: 0.6, fat: 5 };
  const toast = { name: 'Toast', calories: 80, protein: 3, carbs: 14, fat: 1 };
  const r = recentFoods([[toast, egg], [egg, { ...egg, calories: 90 }]], 12);
  assert.deepEqual(r.map(f => `${f.name}:${f.calories}`), ['Egg:78', 'Toast:80', 'Egg:90']);
  assert.equal(recentFoods([Array.from({ length: 30 }, (_, i) => ({ name: 'f' + i, calories: i, protein: 0, carbs: 0, fat: 0 }))], 5).length, 5);
  assert.deepEqual(recentFoods([], 5), []); assert.deepEqual(recentFoods([[{ name: '', calories: 1, protein: 0, carbs: 0, fat: 0 }]], 5), []);
});
