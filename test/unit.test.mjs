import test from 'node:test';
import assert from 'node:assert/strict';
import { lastBusinessDayPT, twelveMonthWindows, easterSunday, ymd } from '../src/dates.mjs';
import { payloadHash } from '../src/portal.mjs';

test('easter sunday', () => {
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

import { normalizeNewSpec } from '../src/portal.mjs';

test('normalizeNewSpec accepts a valid spec with defaults', () => {
  const s = normalizeNewSpec({ transactionDate: '2026-01-30', clientNif: '123456789', lines: [{ description: 'Dev', quantity: 1, unitPrice: 200, vatRate: 0, exemptionCode: '133' }] });
  assert.equal(s.irsRegime, 'none');
  assert.deepEqual(s.lines[0], { kind: 'S', unit: 'N/A', quantity: 1, unitPrice: 200, vatRate: 0, exemptionCode: '133', description: 'Dev', reference: 'Dev' });
});

test('normalizeNewSpec rejects bad input with all reasons', () => {
  assert.throws(() => normalizeNewSpec({ clientNif: '12', lines: [{ description: '', quantity: 0.0001, unitPrice: 1.234, vatRate: 0 }], irsRegime: 'on_100' }),
    (e) => /9-digit/.test(e.message) && /quantity/.test(e.message) && /unitPrice/.test(e.message) && /exemptionCode is required/.test(e.message) && /irsRate is required/.test(e.message));
  assert.throws(() => normalizeNewSpec({ clientNif: '123456789', lines: [{ description: 'x', quantity: 1, unitPrice: 1, vatRate: 23, exemptionCode: '133' }] }), /only applies when vatRate is 0/);
});
