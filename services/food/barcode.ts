// Barcode lookups through Open Food Facts (free, community data). Pure parsing is separate from
// the network call so it can be tested with saved examples.

export type ScannedFood = {
  name: string; brand: string; basis: 'serving' | 'per100g'; servingLabel: string;
  calories: number; protein: number; carbs: number; fat: number;
};
export type LookupError = 'invalid' | 'notfound' | 'network' | 'nonutrition';
export type LookupResult = { ok: true; food: ScannedFood } | { ok: false; error: LookupError };

/** Digits only, 8 to 14 of them (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function normalizeBarcode(input: string): string {
  return String(input ?? '').replace(/[\s-]/g, '');
}

/** GTIN check digit: the weighted sum of the digits must end in zero. */
export function isValidGtin(input: string): boolean {
  const code = normalizeBarcode(input);
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : null;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Turns an Open Food Facts product into one food entry, per serving when the label has it. */
export function parseOffProduct(json: any): ScannedFood | null {
  if (!json || json.status === 0 || !json.product) return null;
  const p = json.product, n = p.nutriments ?? {};
  const name = String(p.product_name ?? p.product_name_en ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) return null;
  const brand = String(p.brands ?? '').split(',')[0].trim().slice(0, 40);
  const fromServing = (k: string) => num(n[`${k}_serving`]);
  const from100 = (k: string) => num(n[`${k}_100g`]);
  const kcalS = fromServing('energy-kcal');
  const useServing = kcalS !== null;
  const pick = (k: string) => (useServing ? fromServing(k) : from100(k));
  let kcal = useServing ? kcalS : from100('energy-kcal');
  if (kcal === null) { // some products only report kilojoules
    const kj = useServing ? fromServing('energy') : from100('energy');
    kcal = kj !== null ? Math.round(kj / 4.184) : null;
  }
  if (kcal === null) return null;
  const servingLabel = useServing ? String(p.serving_size ?? '1 serving').slice(0, 30) : '100 g';
  return {
    name, brand, basis: useServing ? 'serving' : 'per100g', servingLabel,
    calories: Math.round(kcal), protein: round1(pick('proteins') ?? 0), carbs: round1(pick('carbohydrates') ?? 0), fat: round1(pick('fat') ?? 0),
  };
}

/** Scales a scanned food by the number of servings eaten. */
export function scaleFood(f: ScannedFood, servings: number) {
  const k = Math.min(Math.max(servings, 0.25), 20);
  const showBrand = f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) && !f.brand.toLowerCase().includes(f.name.toLowerCase());
  return { name: showBrand ? `${f.name} (${f.brand})` : f.name, calories: Math.round(f.calories * k), protein: round1(f.protein * k), carbs: round1(f.carbs * k), fat: round1(f.fat * k) };
}

export async function lookupBarcode(input: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<LookupResult> {
  const code = normalizeBarcode(input);
  if (!isValidGtin(code)) return { ok: false, error: 'invalid' };
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,serving_size,nutriments`, ctl ? { signal: ctl.signal } : undefined);
    if (res.status === 404) return { ok: false, error: 'notfound' };
    if (!res.ok) return { ok: false, error: 'network' };
    const json = await res.json();
    if (!json?.product || json.status === 0) return { ok: false, error: 'notfound' };
    const food = parseOffProduct(json);
    return food ? { ok: true, food } : { ok: false, error: 'nonutrition' };
  } catch {
    return { ok: false, error: 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
