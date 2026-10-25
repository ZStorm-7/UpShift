import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanHistory, cleanMeal, cleanPlan, cleanAllergies, allergenHits, calorieMisses, cleanMealPlan, cleanFriends,
} from '../src/validate.ts';

test('history is trimmed, role-checked and starts/ends on a user turn', () => {
  const h = cleanHistory([
    { role: 'model', text: 'hi' }, { role: 'user', text: 'a' }, { role: 'system', text: 'evil' },
    { role: 'model', text: 'b' }, { role: 'user', text: 'c' },
  ]);
  assert.deepEqual(h.map(t => t.role), ['user', 'model', 'user']);
  assert.equal(cleanHistory('nope').length, 0);
});

test('history size is capped', () => {
  const big = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 'x'.repeat(1900) }));
  const h = cleanHistory(big);
  assert.ok(h.length <= 12);
  assert.ok(h.reduce((n, t) => n + t.text.length, 0) <= 8000 + 1900);
});

test('meal values are clamped and sanitized', () => {
  const m = cleanMeal({ name: 'x'.repeat(200), calories: -50, protein: 'abc', carbs: 99999, fat: 3.7 });
  assert.equal(m.name.length, 60);
  assert.equal(m.calories, 0);
  assert.equal(m.protein, 0);
  assert.equal(m.carbs, 800);
  assert.equal(m.fat, 4);
});

test('workout plan weekdays are forced to English names and values clamped', () => {
  const days = cleanPlan({ days: [{ day: 'lunes', focus: 'x', rest: false, exercises: [{ name: 'Squat', sets: 99, reps: '8', restSec: 9999 }] }] });
  assert.equal(days[0].day, 'monday');
  assert.equal(days[0].exercises[0].sets, 8);
  assert.equal(days[0].exercises[0].restSec, 300);
});

const plan = (names: string[], ingredients: string[] = []) => cleanMealPlan({ days: [{ day: 'Monday', meals: names.map(n => ({
  name: n, type: 'lunch', calories: 600, protein: 30, carbs: 60, fat: 20, ingredients: ingredients.map(i => ({ item: i, qty: 1, unit: 'cup', aisle: 'Other' })),
})) }] });

test('allergen screen catches direct and derived matches', () => {
  assert.ok(allergenHits(plan(['Pad thai'], ['peanut sauce']), ['peanut']).length > 0);
  assert.ok(allergenHits(plan(['Omelette'], ['cheddar cheese']), ['dairy']).length > 0);
  assert.ok(allergenHits(plan(['Pasta'], ['spaghetti', 'wheat flour']), ['gluten']).length > 0);
  assert.ok(allergenHits(plan(['Shrimp stir fry']), ['shellfish']).length > 0);
});

test('allergen screen passes safe plans', () => {
  assert.equal(allergenHits(plan(['Chicken and rice'], ['chicken breast', 'rice', 'broccoli']), ['peanut', 'dairy']).length, 0);
});

test('allergies input is normalized', () => {
  assert.deepEqual(cleanAllergies([' Peanut ', '', 5]), ['peanut', '5']);
  assert.deepEqual(cleanAllergies('x'), []);
});

test('calorie check flags days outside 15% of goal', () => {
  const d = cleanMealPlan({ days: [{ day: 'Mon', meals: [{ name: 'a', type: 'x', calories: 1000, ingredients: [] }] }] });
  assert.equal(calorieMisses(d, 2000).length, 1);
  assert.equal(calorieMisses(d, 1000).length, 0);
  assert.equal(calorieMisses(d, 0).length, 0);
});

test('friend rows are sanitized and capped', () => {
  const f = cleanFriends([{ uid: 'a', name: 'Sam', level: 3, totalXP: 100, streak: 2 }, { nope: 1 }, null]);
  assert.equal(f.length, 1);
  assert.equal(cleanFriends(Array.from({ length: 100 }, (_, i) => ({ uid: `u${i}` }))).length, 25);
});
