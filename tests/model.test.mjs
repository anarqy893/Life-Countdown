import test from 'node:test';
import assert from 'node:assert/strict';
import { countdownParts } from '../src/model.mjs';
import { defaults, addYears, dateValue, calculate, squareSegments, validateSchedule, countdown } from '../src/model.mjs';

function fixture() {
  const state = defaults();
  state.schedules = [{ id: 'a', start: '2026-01-01', hours: { sleep: 8, work: 40 } }];
  return state;
}
test('a full week partitions into sleep, work, and unallocated time', () => {
  const result = calculate(fixture(), { start: '2026-01-01', end: '2026-01-08' }, dateValue('2026-01-01'));
  assert.equal(result.total, 168);
  assert.equal(result.groups.find(g => g.id === 'sleep').hours, 56);
  assert.equal(result.groups.find(g => g.id === 'work').hours, 40);
  assert.equal(result.remaining, 72);
});
test('elapsed time is counted once and future schedules split at their dates', () => {
  const state = fixture();
  state.schedules.push({ id: 'b', start: '2026-01-15', hours: { sleep: 8, work: 0 } });
  const result = calculate(state, { start: '2026-01-01', end: '2026-01-22' }, dateValue('2026-01-08'));
  assert.equal(result.elapsed, 168);
  assert.equal(result.groups.find(g => g.id === 'work').hours, 40);
  assert.equal(result.groups.find(g => g.id === 'sleep').hours, 112);
  assert.equal(result.groups.reduce((sum, g) => sum + g.hours, 0), result.total);
});
test('custom categories work and overlapping allocations are rejected', () => {
  const state = fixture();
  state.categories.push({ id: 'travel', name: 'Commuting', color: '#ffffff', unit: 'week' });
  state.schedules[0].hours.travel = 10;
  const result = calculate(state, { start: '2026-01-01', end: '2026-01-08' }, dateValue('2026-01-01'));
  assert.equal(result.remaining, 62);
  state.schedules[0].hours.travel = 100;
  assert.throws(() => validateSchedule(state.categories, state.schedules[0]), /168/);
});
test('calendar math preserves leap days and clamps leap-day anniversaries', () => {
  assert.equal(addYears('2000-02-29', 90), '2090-02-28');
  assert.equal(addYears('2000-02-29', 4), '2004-02-29');
  assert.throws(() => dateValue('2026-02-30'), /valid date/);
  const result = calculate(fixture(), { start: '2028-02-28', end: '2028-03-01' }, dateValue('2028-02-28'));
  assert.equal(result.total, 48);
});
test('a future period is fully future and an ended period fully elapsed', () => {
  const period = { start: '2026-01-01', end: '2026-01-08' };
  assert.equal(calculate(fixture(), period, dateValue('2025-01-01')).elapsed, 0);
  const ended = calculate(fixture(), period, dateValue('2027-01-01'));
  assert.equal(ended.elapsed, 168); assert.equal(ended.future, 0);
  assert.deepEqual(countdown(period.end, dateValue('2027-01-01')), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});
test('partial squares conserve hours at category boundaries and final square', () => {
  const result = calculate(fixture(), { start: '2026-01-01', end: '2026-01-11' }, dateValue('2026-01-01') + 3600000);
  let represented = 0;
  for (let i = 0; i < Math.ceil(result.total / 168); i++) represented += squareSegments(result.groups, i, result.total).reduce((sum, segment) => sum + segment.fraction * 168, 0);
  assert.ok(Math.abs(represented - result.total) < 1e-8);
});
test('future changes do not rewrite hours projected for earlier portions', () => {
  const state = fixture();
  state.schedules.push({ id: 'b', start: '2026-01-08', hours: { sleep: 7, work: 20 } });
  state.schedules.push({ id: 'c', start: '2026-01-15', hours: { sleep: 9, work: 10 } });
  const result = calculate(state, { start: '2026-01-01', end: '2026-01-15' }, dateValue('2026-01-01'));
  assert.equal(result.groups.find(g => g.id === 'sleep').hours, 105);
  assert.equal(result.groups.find(g => g.id === 'work').hours, 60);
});

test('reopening after a week offline catches up from dates without stored timer ticks', () => {
  const state = fixture();
  state.schedules.push({ id: 'change', start: '2026-01-08', hours: { sleep: 8, work: 0 } });
  const period = { start: '2026-01-01', end: '2026-01-22' };
  const before = calculate(state, period, dateValue('2026-01-04'));
  const reopened = calculate(JSON.parse(JSON.stringify(state)), period, dateValue('2026-01-11'));
  assert.equal(reopened.elapsed - before.elapsed, 168);
  assert.equal(before.future - reopened.future, 168);
  assert.equal(reopened.groups.find(g => g.id === 'work').hours, 0);
  assert.equal(countdown(period.end, dateValue('2026-01-11')).days, 11);
});

test('calendar countdown uses real month lengths and leap-year anniversaries', () => {
  assert.deepEqual(countdownParts('2025-03-01', 'calendar', dateValue('2024-01-31')), [['years', 1], ['months', 1], ['days', 1]]);
  assert.deepEqual(countdownParts('2025-02-28', 'calendar', dateValue('2024-02-29')), [['years', 1], ['months', 0], ['days', 0]]);
  assert.deepEqual(countdownParts('2026-02-01', 'calendar', dateValue('2026-01-01') + 12 * 3600000), [['years', 0], ['months', 0], ['days', 30]]);
});
test('countdown formats agree on remaining time and stop at zero', () => {
  const now = dateValue('2026-01-01') + 3600000;
  assert.deepEqual(countdownParts('2026-01-16', 'weeks', now), [['weeks', 2], ['days', 0]]);
  assert.deepEqual(countdownParts('2026-01-16', 'hours', now), [['hours', 359]]);
  assert.deepEqual(countdownParts('2026-01-16', 'seconds', now), [['seconds', 1292400]]);
  assert.equal(countdownParts('2026-01-16', 'seconds', now + 1000)[0][1], 1292399);
  assert.deepEqual(countdownParts('2026-01-16', 'days', now), [['days', 14], ['hours', 23], ['minutes', 0], ['seconds', 0]]);
  for (const format of ['calendar', 'days', 'weeks', 'hours', 'seconds']) assert.ok(countdownParts('2025-01-01', format, now).every(([, value]) => value === 0));
});
