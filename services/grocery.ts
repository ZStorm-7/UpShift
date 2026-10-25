// Turns a meal plan into one shopping list: same item + unit are summed,
// grouped by aisle. Pure, so it's unit tested without the app.

export type GroceryIngredient = { item: string; qty: number; unit: string; aisle: string };
export type GroceryMeal = { ingredients: GroceryIngredient[] };
export type GroceryDay = { meals: GroceryMeal[] };
export type GrocerySection = { aisle: string; items: { item: string; qty: number; unit: string }[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildGroceryList(days: GroceryDay[]): GrocerySection[] {
  const map = new Map<string, { item: string; qty: number; unit: string; aisle: string }>();
  for (const d of days) for (const m of d.meals) for (const g of m.ingredients) {
    if (!g.item?.trim()) continue;
    const key = `${norm(g.item)}|${norm(g.unit || '')}`;
    const cur = map.get(key);
    if (cur) cur.qty += Number(g.qty) || 0;
    else map.set(key, { item: cap(norm(g.item)), qty: Number(g.qty) || 0, unit: norm(g.unit || ''), aisle: g.aisle?.trim() || 'Other' });
  }
  const byAisle = new Map<string, GrocerySection>();
  for (const v of map.values()) {
    const sec = byAisle.get(v.aisle) ?? { aisle: v.aisle, items: [] };
    sec.items.push({ item: v.item, qty: Math.round(v.qty * 100) / 100, unit: v.unit });
    byAisle.set(v.aisle, sec);
  }
  return [...byAisle.values()]
    .map(s => ({ ...s, items: s.items.sort((a, b) => a.item.localeCompare(b.item)) }))
    .sort((a, b) => (a.aisle === 'Other' ? 1 : b.aisle === 'Other' ? -1 : a.aisle.localeCompare(b.aisle)));
}

export function groceryToText(sections: GrocerySection[], title = 'Grocery list'): string {
  const lines = [title, ''];
  for (const s of sections) {
    lines.push(s.aisle.toUpperCase());
    for (const i of s.items) lines.push(`- ${i.item}: ${i.qty}${i.unit ? ' ' + i.unit : ''}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
