import { describe, it, assertEqual } from './harness.js';
import { rupiah, fmtDate, isSameLocalDay, todayIso } from '../js/format.js';

describe('rupiah', () => {
  it('formats integer rupiah with id-ID locale', () => {
    assertEqual(rupiah(25000), 'Rp 25.000');
    assertEqual(rupiah(0), 'Rp 0');
    assertEqual(rupiah(-5000), '-Rp 5.000');
  });
  it('rounds non-integer input to nearest integer', () => {
    assertEqual(rupiah(99.6), 'Rp 100');
  });
});

describe('fmtDate', () => {
  it('formats ISO into dd/mm/yyyy', () => {
    assertEqual(fmtDate('2026-05-14T08:30:00.000Z'), '14/05/2026');
  });
});

describe('isSameLocalDay', () => {
  it('returns true for same local day', () => {
    const a = new Date(2026, 4, 14, 7, 0).toISOString();
    const b = new Date(2026, 4, 14, 18, 30).toISOString();
    assertEqual(isSameLocalDay(a, b), true);
  });
  it('returns false for different local days', () => {
    const a = new Date(2026, 4, 14, 23, 0).toISOString();
    const b = new Date(2026, 4, 15, 1, 0).toISOString();
    assertEqual(isSameLocalDay(a, b), false);
  });
});

describe('todayIso', () => {
  it('returns an ISO string', () => {
    const v = todayIso();
    assertEqual(typeof v === 'string' && v.endsWith('Z'), true);
  });
});
