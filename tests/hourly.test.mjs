import test from 'node:test';
import assert from 'node:assert/strict';
import { isHourlyBoundary } from '../src/hourly.mjs';

test('an hour boundary plays once, including midnight', () => {
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 13, 59, 59), new Date(2026, 9, 16, 14, 0, 1)), true);
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 14, 0, 1), new Date(2026, 9, 16, 14, 0, 2)), false);
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 23, 59, 59), new Date(2026, 9, 17, 0, 0, 0)), true);
});
test('missed hours after sleep, startup, or a clock change do not replay', () => {
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 12, 59, 59), new Date(2026, 9, 16, 14, 0, 1)), false);
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 14, 0, 1), new Date(2026, 9, 16, 14, 0, 1)), false);
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 14, 59, 59), new Date(2026, 9, 16, 14, 0, 0)), false);
  assert.equal(isHourlyBoundary(new Date(2026, 9, 16, 13, 59, 59), new Date(2026, 9, 16, 14, 0, 10)), false);
});
