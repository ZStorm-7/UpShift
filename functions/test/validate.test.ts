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

// ---- break statistics for the coach ----
import { summarizeBreakDays, cleanStyleSuggestion, BREATHING_STYLES } from '../src/validate.ts';

test('break stats fold the per-day counters into what the coach can say', () => {
  const s = summarizeBreakDays([
    { date: '2026-10-23', data: { done: 3, stay: 2, exit: 1, moodSum: 9, moodN: 2, intent: { unwind: 2, unsure: 1 }, hours: { h21: 2, h9: 1 } } },
    { date: '2026-10-24', data: { done: 2, stay: 0, exit: 2, passes: 1, strict: 1, moodSum: 3, moodN: 1, hours: { h21: 2 } } },
    { date: '2026-10-25', data: undefined },
  ]);
  assert.equal(s.breaksCompleted, 5);
  assert.equal(s.daysWithData, 2);
  assert.equal(s.stayedInApp, 2);
  assert.equal(s.leftApp, 3);
  assert.equal(s.leftAppPercent, 60);
  assert.deepEqual(s.whyOpened, { unwind: 2, unsure: 1 });
  assert.equal(s.averageMoodAfterBreak, 4);
  assert.deepEqual(s.busiestHours[0], { hour: 21, breaks: 4 });
  assert.equal(s.busiestHours.length, 2);
  assert.equal(s.emergencyPassesUsed, 1);
  assert.equal(s.strictSessions, 1);
  assert.equal(s.perDay.length, 3);
});

test('break stats are safe with nothing, and with junk', () => {
  const empty = summarizeBreakDays([{ date: '2026-10-25', data: undefined }]);
  assert.equal(empty.breaksCompleted, 0);
  assert.equal(empty.leftAppPercent, null);
  assert.equal(empty.averageMoodAfterBreak, null);
  assert.deepEqual(empty.busiestHours, []);
  const junk = summarizeBreakDays([{ date: 'x', data: { done: -5, stay: 'a', exit: 1e12, hours: { h99: 4, h3: 'z' }, intent: { evil: 3 } } }]);
  assert.equal(junk.breaksCompleted, 0);
  assert.equal(junk.leftApp, 10_000);
  assert.deepEqual(junk.busiestHours, []);
  assert.deepEqual(junk.whyOpened, {});
});

test('the coach can only suggest one of the four real breathing styles', () => {
  assert.deepEqual(BREATHING_STYLES, ['calm', 'sigh', 'box', 'long']);
  assert.deepEqual(cleanStyleSuggestion({ pattern: 'Box', reason: 'for focus' }), { pattern: 'box', reason: 'for focus' });
  assert.equal(cleanStyleSuggestion({ pattern: 'rainbow', reason: 'x' }), null);
  assert.equal(cleanStyleSuggestion({ reason: 'x' }), null);
  assert.equal(cleanStyleSuggestion(undefined), null);
  assert.equal(cleanStyleSuggestion({ pattern: 'calm', reason: 'x'.repeat(999) })!.reason.length, 200);
});
