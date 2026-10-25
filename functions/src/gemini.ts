import { HttpsError } from 'firebase-functions/v2/https';
import { GEMINI_ENDPOINT } from './config.ts';

export type Part = Record<string, unknown>;
export type Content = { role: 'user' | 'model'; parts: Part[] };

// One POST to Gemini with a timeout and a single retry on 5xx. Network and
// upstream failures surface as `unavailable`, which the app treats as
// "offline" (and the server refunds the quota unit).
export async function generate(apiKey: string, body: Record<string, unknown>): Promise<any> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40_000);
    try {
      const res = await fetch(GEMINI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      lastStatus = res.status;
      if (res.status < 500 && res.status !== 429) break;
    } catch {
      lastStatus = 0;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new HttpsError('unavailable', `gemini-${lastStatus}`);
}

export const textOf = (data: any): string =>
  (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();

export function parseJson(data: any): any {
  try { return JSON.parse(textOf(data)); } catch { throw new HttpsError('unavailable', 'bad-json'); }
}

export const sourcesOf = (data: any): { title: string; uri: string }[] => {
  const seen = new Set<string>();
  const out: { title: string; uri: string }[] = [];
  for (const c of data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    const uri = c?.web?.uri;
    if (uri && !seen.has(uri)) { seen.add(uri); out.push({ uri, title: String(c.web.title || uri).slice(0, 120) }); }
  }
  return out;
};
