import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv, dailyCsv, buildExportJson, exportFileName } from '../services/export/dataExport';
import { summarizeDay } from '../services/insights/days';

test('csv cells are quoted and spreadsheet formulas are defused', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
});
test('daily csv is sorted and has a header', () => {
  const a = summarizeDay('2026-10-02', { waterTotal: 500 }), b = summarizeDay('2026-10-01', { sleepHours: 8, foodLog: [{ calories: 300, protein: 20 }] });
  const lines = dailyCsv([a, b]).trim().split('\r\n');
  assert.equal(lines[0], 'date,calories,protein_g,carbs_g,fat_g,meals,water_ml,sleep_hours,workouts,mindful_breaks');
  assert.equal(lines[1], '2026-10-01,300,20,0,0,1,0,8,0,0');
  assert.equal(lines[2].startsWith('2026-10-02'), true);
  assert.equal(toCsv(['a'], []), 'a\r\n');
});
test('the json export drops tokens and tidies odd values', () => {
  const out = JSON.parse(buildExportJson({ profile: { firstName: 'Sam', pushToken: 'secret' }, days: [{ n: NaN, t: { toDate: () => new Date(Date.UTC(2026, 0, 1)) } }], weights: [], workoutLogs: [], customWorkouts: [], records: {}, streak: {} }, new Date(Date.UTC(2026, 9, 26))));
  assert.equal(out.app, 'UpShift'); assert.equal(out.profile.pushToken, undefined); assert.equal(out.profile.firstName, 'Sam');
  assert.equal(out.days[0].n, null); assert.equal(out.days[0].t, '2026-01-01T00:00:00.000Z');
  assert.equal(out.exportedAt, '2026-10-26T00:00:00.000Z');
});
test('file names carry the date', () => {
  assert.equal(exportFileName('csv', new Date(2026, 9, 6)), 'upshift-daily-2026-10-06.csv');
  assert.equal(exportFileName('json', new Date(2026, 9, 26)), 'upshift-data-2026-10-26.json');
});
