import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, dateValue } from '../src/model.mjs';
import { ageAt, timelineRows, CHAPTERS } from '../src/timeline.mjs';

test('52-column timeline preserves every day, including leap years', () => {
  const rows = timelineRows({ birthday: '2020-01-01' }, { start: '2020-01-01', end: '2022-01-01' }, dateValue('2020-03-01'));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.cells.length), [52, 52]);
  assert.deepEqual(rows.map(r => (r.cells.at(-1).end - r.cells.at(-1).start) / DAY), [9, 8]);
  const cells = rows.flatMap(r => r.cells);
  assert.equal(cells.reduce((sum, c) => sum + c.end - c.start, 0), 731 * DAY);
  assert.equal(cells.filter(c => c.current).length, 1);
  for (let i = 1; i < cells.length; i++) assert.equal(cells[i - 1].end, cells[i].start);
});
test('leap birthdays use the same anniversary rules as the life horizon', () => {
  assert.equal(ageAt('2000-02-29', dateValue('2025-02-27')), 24);
  assert.equal(ageAt('2000-02-29', dateValue('2025-02-28')), 25);
  const rows = timelineRows({ birthday: '2000-02-29' }, { start: '2000-02-29', end: '2004-02-29' });
  assert.deepEqual(rows.map(r => r.age), [0, 1, 2, 3]);
  assert.equal(rows.at(-1).to, dateValue('2004-02-29'));
});
test('custom periods keep exact start/end boundaries and shorter last rows', () => {
  const rows = timelineRows({ birthday: '1990-04-12' }, { start: '2026-10-17', end: '2028-01-05' }, dateValue('2026-10-17'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].age, 36);
  assert.equal(rows.at(-1).cells.at(-1).end, dateValue('2028-01-05'));
  assert.equal(rows[0].cells[0].current, true);
  assert.equal(ageAt('1990-04-12', dateValue('1989-01-01')), null);
});
test('illustrative chapter bands cover a whole life without gaps', () => {
  assert.equal(CHAPTERS[0].from, 0);
  for (let i = 1; i < CHAPTERS.length; i++) assert.equal(CHAPTERS[i].from, CHAPTERS[i - 1].to);
  assert.equal(CHAPTERS.at(-1).to, Infinity);
});
