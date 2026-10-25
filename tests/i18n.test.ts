// Guards the translations: a key used in code but missing from the dictionary
// shows up to users as the raw key ("breakStrictTitle"), and a translation that
// drops a {placeholder} shows up as a sentence with a hole in it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TRANSLATIONS, LANGUAGES } from '../i18n/translations.ts';

const root = join(import.meta.dirname, '..');
const en = TRANSLATIONS.en as Record<string, string>;
const codes = LANGUAGES.map(l => l.code);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.expo', 'functions', 'tests', 'modules', 'android', 'ios', 'docs'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name) && !p.endsWith('translations.ts')) out.push(p);
  }
  return out;
}
const files = walk(root);

test('every language defines every key that English defines', () => {
  const missing: string[] = [];
  for (const code of codes) {
    if (code === 'en') continue;
    const table = TRANSLATIONS[code] as Record<string, string>;
    for (const k of Object.keys(en)) if (!table[k]) missing.push(`${code}:${k}`);
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} missing, e.g. ${missing.slice(0, 5).join(', ')}`);
});

test('no language defines a key English does not (a typo that would never show)', () => {
  const extra: string[] = [];
  for (const code of codes) for (const k of Object.keys(TRANSLATIONS[code])) if (!(k in en)) extra.push(`${code}:${k}`);
  assert.deepEqual(extra, []);
});

test('every {placeholder} in English appears in every translation', () => {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(en)) {
    const ph = [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const code of codes) {
      if (code === 'en') continue;
      const tv = (TRANSLATIONS[code] as Record<string, string>)[k] ?? '';
      const got = [...tv.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
      if (JSON.stringify(ph) !== JSON.stringify(got)) bad.push(`${code}:${k} wants {${ph}} has {${got}}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every t("key") literal in the app exists in the dictionary', () => {
  const missing: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) if (!(m[1] in en)) missing.push(`${f.replace(root, '')}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('keys named in lookup tables exist too (patterns, phases, intents, tones)', () => {
  const PREFIX = /^(break|breaks|coach|pattern|intent|ins)[A-Z][A-Za-z0-9]*$/;
  // Firestore collection and document names that merely share a prefix.
  const NOT_KEYS = new Set(['breakDays', 'coachMessages', 'coachPlan', 'coachFeedback', 'coachUsage']);
  const missing = new Set<string>();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) if (PREFIX.test(m[1]) && !NOT_KEYS.has(m[1]) && !(m[1] in en)) missing.add(`${f.replace(root, '')}: ${m[1]}`);
  }
  // dynamic keys built as `coachSore${n}` are checked here by hand
  for (let n = 0; n <= 3; n++) assert.ok(`coachSore${n}` in en, `coachSore${n}`);
  assert.deepEqual([...missing], []);
});

test('no translation is empty or still English by accident (except short identical words)', () => {
  const same: string[] = [];
  for (const code of codes) {
    if (code === 'en') continue;
    for (const [k, v] of Object.entries(TRANSLATIONS[code] as Record<string, string>)) {
      if (v === en[k] && v.length > 24) same.push(`${code}:${k}`);
    }
  }
  assert.deepEqual(same, []);
});
