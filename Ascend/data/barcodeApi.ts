import { FoodDatabaseItem } from './foods';

// Open Food Facts — a free, keyless, community-maintained database of
// packaged foods indexed by barcode (UPC/EAN), covering products from
// grocery-store shelves worldwide. Unlike USDA FoodData Central (searched by
// name in usdaFoodApi.ts), it's built specifically for "here's the barcode I
// just scanned, what is it" lookups, which is exactly this feature's need —
// no API key required.
const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';

// Returns null if the barcode isn't in the database or the request fails —
// callers should fall back to "not found, try search instead" rather than
// treating this as an error state.
export async function lookupBarcode(barcode: string): Promise<FoodDatabaseItem | null> {
  try {
    const response = await fetch(`${OFF_BASE}/${encodeURIComponent(barcode)}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const product = data.product;
    const nutriments = product.nutriments || {};
    const name: string = product.product_name || product.generic_name || '';
    if (!name.trim()) return null;

    // Prefer per-serving figures when the product declares them (that's what
    // someone scanning a granola bar actually wants — "1 bar", not "100g of
    // a bar that weighs 40g"); fall back to per-100g, which every product in
    // the database reports.
    const hasServing = product.serving_size && nutriments['energy-kcal_serving'] != null;
    const servingLabel = hasServing ? product.serving_size : '100g';
    const suffix = hasServing ? '_serving' : '_100g';

    return {
      id: `off-${barcode}`,
      name: product.brands ? `${name} (${product.brands})` : name,
      category: 'Scanned',
      servingLabel,
      calories: Math.round(nutriments[`energy-kcal${suffix}`] || 0),
      protein: Math.round(nutriments[`proteins${suffix}`] || 0),
      carbs: Math.round(nutriments[`carbohydrates${suffix}`] || 0),
      fat: Math.round(nutriments[`fat${suffix}`] || 0),
    };
  } catch (err) {
    console.error('Barcode lookup failed:', err);
    return null;
  }
}
