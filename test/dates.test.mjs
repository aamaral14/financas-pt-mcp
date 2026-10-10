import test from 'node:test';
import assert from 'node:assert/strict';
import { lastBusinessDayPT, twelveMonthWindows, easterSunday, ymd } from '../src/dates.mjs';
import { payloadHash } from '../src/portal.mjs';

test('easter', () => {
  assert.equal(ymd(easterSunday(2026)), '2026-04-05');
  assert.equal(ymd(easterSunday(2029)), '2029-04-01');
});

test('last business day 2026', () => {
  const got = Array.from({ length: 12 }, (_, i) => lastBusinessDayPT(2026, i + 1));
  assert.deepEqual(got, ['2026-01-30', '2026-02-27', '2026-03-31', '2026-04-30', '2026-05-29', '2026-06-30',
    '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-30', '2026-11-30', '2026-12-31']);
});

test('last business day skips Good Friday and Corpus Christi', () => {
  assert.equal(lastBusinessDayPT(2029, 3), '2029-03-29'); // 30 Mar 2029 = Good Friday
  assert.equal(lastBusinessDayPT(2029, 5), '2029-05-30'); // 31 May 2029 = Corpus Christi
});

test('12-month windows', () => {
  assert.deepEqual(twelveMonthWindows('2025-01-01', '2025-06-30'), [['2025-01-01', '2025-06-30']]);
  assert.deepEqual(twelveMonthWindows('2024-01-01', '2026-03-15'), [
    ['2024-01-01', '2024-12-31'], ['2025-01-01', '2025-12-31'], ['2026-01-01', '2026-03-15']]);
  assert.throws(() => twelveMonthWindows('2026-02-01', '2026-01-01'));
});

test('payload hash ignores isToValidate only', () => {
  assert.equal(payloadHash({ a: 1, isToValidate: true }), payloadHash({ a: 1, isToValidate: false }));
  assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
});
