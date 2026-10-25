// Guards against the mistakes that have already happened once: secrets shipped
// in the app bundle, and wildcard dependency versions that let a fresh install
// pull a different Expo SDK.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', '.expo', 'lib', 'dist', 'android', 'ios'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const sourceFiles = walk(root).filter(f => /\.(ts|tsx|js|json|md)$/.test(f) && !f.endsWith('package-lock.json'));

test('no dependency uses a "*" or "latest" version', () => {
  const bad = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter(([, v]) => v === '*' || v === 'latest');
  assert.deepEqual(bad, []);
});

test('no secret is read from an EXPO_PUBLIC_ variable (those ship inside the app)', () => {
  const hits: string[] = [];
  for (const f of sourceFiles) {
    // Docs may *mention* the variable (e.g. "remove it"); only code and config can leak it.
    if (f.includes('tests/repo-hygiene') || f.endsWith('.md')) continue;
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/EXPO_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/g)) hits.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('no API key or private key material is committed', () => {
  const patterns: [string, RegExp][] = [
    ['Google AI / Gemini key', /AIza[0-9A-Za-z_-]{35}/],
    ['Gemini OAuth-style key', /\bAQ\.[A-Za-z0-9_-]{40,}/],
    ['private key block', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
    ['RevenueCat secret key', /\bsk_[A-Za-z0-9]{20,}/],
  ];
  const hits: string[] = [];
  for (const f of sourceFiles) {
    const text = readFileSync(f, 'utf8');
    for (const [name, re] of patterns) {
      for (const m of text.matchAll(new RegExp(re, 'g'))) {
        // The Firebase web apiKey is public by design (identifies, doesn't authorize).
        if (f.endsWith('firebase/config.ts') && m[0].startsWith('AIza')) continue;
        hits.push(`${f}: ${name}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test('the privacy policy has no unfilled placeholder except the contact email', () => {
  const policy = readFileSync(join(root, 'PRIVACY_POLICY.md'), 'utf8');
  const placeholders = [...policy.matchAll(/\[[A-Z][A-Z ]+\]/g)].map(m => m[0]).filter(p => p !== '[YOUR EMAIL]');
  assert.deepEqual(placeholders, []);
});
