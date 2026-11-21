// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  formatDateOnly,
  formatHumanDate,
  isValidDateOnly,
  parseDateOnly,
} from '../src/lib/calc/date';

describe('date-only validation', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidDateOnly('2026-11-13')).toBe(true);
    expect(isValidDateOnly('2024-02-29')).toBe(true);
    expect(isValidDateOnly('2026-02-29')).toBe(false);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-04-31')).toBe(false);
    expect(isValidDateOnly('2026-1-1')).toBe(false);
    expect(isValidDateOnly('')).toBe(false);
  });

  it('rejects dates outside 1900–2100', () => {
    expect(isValidDateOnly('1899-12-31')).toBe(false);
    expect(isValidDateOnly('1900-01-01')).toBe(true);
    expect(isValidDateOnly('2100-12-31')).toBe(true);
    expect(isValidDateOnly('2101-01-01')).toBe(false);
  });
});

describe('addMonths month-end clamping', () => {
  it('clamps January 31 to the last day of February', () => {
    expect(formatDateOnly(addMonths(parseDateOnly('2026-01-31'), 1))).toBe('2026-02-28');
    expect(formatDateOnly(addMonths(parseDateOnly('2024-01-31'), 1))).toBe('2024-02-29');
  });

  it('handles leap-day anchors and year rollover', () => {
    expect(formatDateOnly(addMonths(parseDateOnly('2024-02-29'), 12))).toBe('2025-02-28');
    expect(formatDateOnly(addMonths(parseDateOnly('2024-02-29'), 24))).toBe('2026-02-28');
    expect(formatDateOnly(addMonths(parseDateOnly('2026-08-31'), 6))).toBe('2027-02-28');
    expect(formatDateOnly(addMonths(parseDateOnly('2026-12-31'), 2))).toBe('2027-02-28');
  });

  it('keeps the day when the target month is long enough', () => {
    expect(formatDateOnly(addMonths(parseDateOnly('2026-03-31'), 1))).toBe('2026-04-30');
    expect(formatDateOnly(addMonths(parseDateOnly('2026-01-15'), 12))).toBe('2027-01-15');
  });
});

describe('diffDays', () => {
  it('counts calendar days across a leap year', () => {
    expect(diffDays(parseDateOnly('2024-02-28'), parseDateOnly('2024-03-01'))).toBe(2);
    expect(diffDays(parseDateOnly('2025-02-28'), parseDateOnly('2025-03-01'))).toBe(1);
  });

  it('returns negative values for past dates', () => {
    expect(diffDays(parseDateOnly('2026-11-13'), parseDateOnly('2026-11-12'))).toBe(-1);
    expect(diffDays(parseDateOnly('2026-11-13'), parseDateOnly('2026-11-13'))).toBe(0);
    expect(diffDays(parseDateOnly('2026-11-13'), parseDateOnly('2026-12-13'))).toBe(30);
  });

  it('addDays and diffDays agree across a DST boundary', () => {
    const start = parseDateOnly('2026-03-07');
    const end = addDays(start, 3);
    expect(formatDateOnly(end)).toBe('2026-03-10');
    expect(diffDays(start, end)).toBe(3);
  });
});

describe('formatting', () => {
  it('formats date-only values in UTC', () => {
    expect(formatHumanDate('2026-11-13')).toBe('Nov 13, 2026');
    expect(formatHumanDate('2024-02-29')).toBe('Feb 29, 2024');
  });
});
