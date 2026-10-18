import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateOccasions, occasionResultMarkup } from '../src/moments.mjs';
import { dateValue } from '../src/model.mjs';

test('counts future occasions from now with calendar anniversaries and flexible frequencies', () => {
  const now = dateValue('2026-06-15'), birthday = '1986-06-15';
  assert.equal(estimateOccasions(birthday, 80, { times: 1, years: 1 }, now), 40);
  assert.equal(estimateOccasions(birthday, 80, { times: 1, years: 2 }, now), 20);
  assert.equal(estimateOccasions(birthday, 80, { times: 4, years: 1 }, now), 160);
  assert.equal(estimateOccasions(birthday, 80, { times: 1, years: 1 }, dateValue('2026-12-15')), 39);
  assert.equal(estimateOccasions(birthday, 80, { times: 1, years: 1 }, dateValue('2066-06-15')), 0);
});
test('handles leap birthdays, expired horizons, and invalid frequencies', () => {
  assert.equal(estimateOccasions('2000-02-29', 80, { times: 1, years: 1 }, dateValue('2040-02-29')), 40);
  assert.equal(estimateOccasions('2000-02-29', 80, { times: 1, years: 1 }, dateValue('2081-03-01')), 0);
  for (const frequency of [{times: 0, years: 1}, {times: 1, years: 0}, {times: 1.5, years: 2}, {times: 366, years: 1}, {times: 1, years: Infinity}]) {
    assert.throws(() => estimateOccasions('1986-06-15', 80, frequency), /whole numbers/);
  }
});
test('limits dot rendering while keeping one dot per occasion and escapes user text', () => {
  const markup = occasionResultMarkup({birthday: '2000-01-01', lifespan: 130}, {name:'<script>ocean</script>', times:365, years:1});
  assert.equal((markup.match(/<i><\/i>/g) || []).length, 120);
  assert.match(markup, /more beyond these dots/);
  assert.ok(!markup.includes('<script>'));
  assert.match(markup, /&lt;script&gt;/);
});

test('activity end ages override the default and stay fixed when the reference age changes', () => {
  const now = dateValue('2026-06-15'), birthday = '1986-06-15';
  const skiing = { times: 1, years: 1, untilAge: 65 };
  assert.equal(estimateOccasions(birthday, 80, skiing, now), 25);
  assert.equal(estimateOccasions(birthday, 100, skiing, now), 25);
  assert.equal(estimateOccasions(birthday, 80, { ...skiing, untilAge: null }, now), 40);
  assert.equal(estimateOccasions(birthday, 100, { ...skiing, untilAge: null }, now), 60);
  assert.equal(estimateOccasions(birthday, 80, { ...skiing, untilAge: 35 }, now), 0);
  assert.equal(estimateOccasions('2000-02-29', 90, { ...skiing, untilAge: 65 }, dateValue('2040-02-29')), 25);
  for (const untilAge of [0, 131, 65.5, '', NaN, Infinity]) {
    assert.throws(() => estimateOccasions(birthday, 80, { ...skiing, untilAge }, now), /until age/);
  }
});
