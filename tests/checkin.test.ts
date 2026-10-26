import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCheckin, shiftTime, nextFire, formatClock, handleCheckinResponse, DEFAULT_CHECKIN, CHECKIN_IDENTIFIER, CHECKIN_ACTION_LOG_WATER, CHECKIN_WATER_ML, type ResponseLike } from '../services/habits/checkin';

test('settings are cleaned and default to off', () => {
  assert.deepEqual(cleanCheckin(undefined), DEFAULT_CHECKIN); assert.equal(DEFAULT_CHECKIN.enabled, false);
  assert.deepEqual(cleanCheckin({ enabled: true, hour: 25, minute: -4 }), { enabled: true, hour: 23, minute: 0 });
  assert.deepEqual(cleanCheckin({ enabled: 'yes', hour: 'x', minute: 61 }), { enabled: false, hour: 19, minute: 59 });
});
test('the time can be nudged around the clock', () => {
  const s = { enabled: true, hour: 23, minute: 45 };
  assert.deepEqual(shiftTime(s, 15), { enabled: true, hour: 0, minute: 0 });
  assert.deepEqual(shiftTime({ ...s, hour: 0, minute: 0 }, -15), { enabled: true, hour: 23, minute: 45 });
  assert.deepEqual(shiftTime(s, 60 * 24 * 3 + 15), { enabled: true, hour: 0, minute: 0 });
});
test('next fire is today if still ahead, otherwise tomorrow', () => {
  const s = { enabled: true, hour: 19, minute: 30 };
  assert.equal(nextFire(new Date(2026, 9, 26, 10, 0), s).getDate(), 26);
  assert.equal(nextFire(new Date(2026, 9, 26, 19, 30), s).getDate(), 27);
  assert.equal(nextFire(new Date(2026, 9, 31, 20, 0), s).getMonth(), 10);
  assert.match(formatClock(19, 30, 'en-US'), /7:30\s?PM/);
});

const resp = (over: Partial<ResponseLike> & { date?: number; id?: string } = {}): ResponseLike => ({
  actionIdentifier: over.actionIdentifier ?? CHECKIN_ACTION_LOG_WATER,
  notification: { date: over.date ?? 1000, request: { identifier: over.id ?? CHECKIN_IDENTIFIER } },
});
test('the water button logs 250 ml once', async () => {
  const calls: string[] = [];
  const deps = { uid: 'u1', lastHandledAt: 0, addWater: async (u: string, ml: number) => { calls.push(`${u}:${ml}`); }, rememberHandled: async (u: string, at: number) => { calls.push(`seen:${at}`); } };
  assert.equal(await handleCheckinResponse(resp(), deps), 'logged');
  assert.deepEqual(calls, [`u1:${CHECKIN_WATER_ML}`, 'seen:1000']);
  assert.equal(await handleCheckinResponse(resp(), { ...deps, lastHandledAt: 1000 }), 'duplicate');
  assert.equal(await handleCheckinResponse(resp({ date: 999 }), { ...deps, lastHandledAt: 1000 }), 'duplicate');
  assert.equal(await handleCheckinResponse(resp({ date: 2000 }), { ...deps, lastHandledAt: 1000 }), 'logged');
});
test('other taps, other notifications and signed-out users are ignored', async () => {
  const deps = { uid: 'u1', lastHandledAt: 0, addWater: async () => { throw new Error('should not run'); }, rememberHandled: async () => {} };
  assert.equal(await handleCheckinResponse(resp({ actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' }), deps), 'ignored');
  assert.equal(await handleCheckinResponse(resp({ id: 'streak-risk-reminder' }), deps), 'ignored');
  assert.equal(await handleCheckinResponse(resp(), { ...deps, uid: null, addWater: async () => {} }), 'signed-out');
});
test('a failed write is reported and not remembered as handled', async () => {
  let remembered = false;
  const r = await handleCheckinResponse(resp(), { uid: 'u1', lastHandledAt: 0, addWater: async () => { throw new Error('offline'); }, rememberHandled: async () => { remembered = true; } });
  assert.equal(r, 'failed'); assert.equal(remembered, false);
});
