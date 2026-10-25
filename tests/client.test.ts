import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroceryList, groceryToText } from '../services/grocery.ts';
import { COACH_TIPS, tipForDay } from '../data/coachTips.ts';

test('grocery list sums same item+unit across meals and days', () => {
  const list = buildGroceryList([
    { meals: [{ ingredients: [{ item: 'Rice', qty: 1, unit: 'cup', aisle: 'Grains' }, { item: 'chicken breast', qty: 200, unit: 'g', aisle: 'Protein' }] }] },
    { meals: [{ ingredients: [{ item: ' rice ', qty: 0.5, unit: 'Cup', aisle: 'Grains' }, { item: 'Rice', qty: 100, unit: 'g', aisle: 'Grains' }] }] },
  ]);
  const grains = list.find(s => s.aisle === 'Grains')!;
  assert.equal(grains.items.find(i => i.unit === 'cup')!.qty, 1.5);
  assert.equal(grains.items.find(i => i.unit === 'g')!.qty, 100);
});

test('grocery list groups by aisle with Other last, skips blanks', () => {
  const list = buildGroceryList([{ meals: [{ ingredients: [
    { item: 'Salt', qty: 1, unit: 'tsp', aisle: 'Other' }, { item: 'Apple', qty: 2, unit: '', aisle: 'Produce' }, { item: '  ', qty: 1, unit: '', aisle: 'Produce' },
  ] }] }]);
  assert.deepEqual(list.map(s => s.aisle), ['Produce', 'Other']);
  assert.equal(list[0].items.length, 1);
});

test('grocery text export is readable', () => {
  const text = groceryToText([{ aisle: 'Produce', items: [{ item: 'Apple', qty: 2, unit: '' }] }], 'List');
  assert.equal(text, 'List\n\nPRODUCE\n- Apple: 2');
});

test('every language has the same number of tips', () => {
  const n = COACH_TIPS.en.length;
  for (const l of Object.keys(COACH_TIPS)) assert.equal((COACH_TIPS as any)[l].length, n, l);
});

test('tip is stable within a day and falls back to English', () => {
  const d = new Date('2026-01-01T10:00:00Z');
  assert.equal(tipForDay('en', d), tipForDay('en', new Date('2026-01-01T20:00:00Z')));
  assert.equal(tipForDay('xx', d), tipForDay('en', d));
});
