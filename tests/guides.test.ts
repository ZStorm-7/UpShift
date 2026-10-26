import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_TEMPLATES } from '../data/workoutPlans';
import { guideFor, GUIDE_COUNT } from '../data/exerciseGuides';

test('every exercise in every template has a how-to card', () => {
  const missing = new Set<string>();
  for (const t of ALL_TEMPLATES()) for (const e of t.exercises) if (!guideFor(e.name)) missing.add(e.name);
  assert.deepEqual([...missing], []);
});
test('cards have a cue, a common mistake and muscles, all short enough to read mid-set', () => {
  for (const t of ALL_TEMPLATES()) for (const e of t.exercises) {
    const g = guideFor(e.name)!;
    assert.ok(g.cue.length >= 15 && g.cue.length <= 130, `${e.name} cue length ${g.cue.length}`);
    assert.ok(g.mistake.length >= 10 && g.mistake.length <= 110, `${e.name} mistake length ${g.mistake.length}`);
    assert.ok(g.muscles.length > 2, e.name);
  }
  assert.ok(GUIDE_COUNT >= 60);
});
test('lookup ignores case and spacing, and unknown names return null', () => {
  assert.ok(guideFor('  back   SQUAT '));
  assert.equal(guideFor('Moonwalk'), null);
  assert.equal(guideFor(''), null);
});
