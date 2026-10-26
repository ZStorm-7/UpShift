// Cheers: a tap of encouragement from one friend to another. One per kind per sender per day,
// so a cheer is a nice surprise and never a flood. Pure logic here; Firestore lives in firebase/cheers.ts.

export const CHEER_KINDS = ['fire', 'clap', 'muscle'] as const;
export type CheerKind = typeof CHEER_KINDS[number];
export const CHEER_EMOJI: Record<CheerKind, string> = { fire: '🔥', clap: '👏', muscle: '💪' };

export type Cheer = { id: string; fromUid: string; fromName: string; kind: CheerKind; day: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isCheerKind = (k: unknown): k is CheerKind => typeof k === 'string' && (CHEER_KINDS as readonly string[]).includes(k);

// The document id doubles as the daily limit: sending the same cheer twice writes the same id,
// and the rules only allow a create, so the second one is refused.
export function cheerId(fromUid: string, day: string, kind: CheerKind): string {
  return `${fromUid}_${day}_${kind}`;
}

const cleanName = (n: unknown) => (typeof n === 'string' ? n.replace(/[<>&"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '');

export function cleanCheer(id: string, raw: any): Cheer | null {
  if (!raw || !isCheerKind(raw.kind) || typeof raw.fromUid !== 'string' || !raw.fromUid || typeof raw.day !== 'string' || !DAY.test(raw.day)) return null;
  return { id, fromUid: raw.fromUid.slice(0, 128), fromName: cleanName(raw.fromName) || '?', kind: raw.kind, day: raw.day };
}

export type CheerSummary = { total: number; byKind: Record<CheerKind, number>; senders: string[] };

// Today's cheers, newest sender names first, de-duplicated by person.
export function summarizeCheers(cheers: Cheer[], day: string): CheerSummary {
  const out: CheerSummary = { total: 0, byKind: { fire: 0, clap: 0, muscle: 0 }, senders: [] };
  for (const c of cheers) {
    if (c.day !== day) continue;
    out.total++; out.byKind[c.kind]++;
    if (!out.senders.includes(c.fromName)) out.senders.push(c.fromName);
  }
  return out;
}

// Which kinds this person already sent to one friend today (to grey the button out).
// `sent` holds "<friendUid>:<cheerId>" entries, as kept by firebase/cheers.ts.
export function sentKinds(sent: string[], friendUid: string, fromUid: string, day: string): Set<CheerKind> {
  const set = new Set<CheerKind>();
  for (const kind of CHEER_KINDS) if (sent.includes(`${friendUid}:${cheerId(fromUid, day, kind)}`)) set.add(kind);
  return set;
}
