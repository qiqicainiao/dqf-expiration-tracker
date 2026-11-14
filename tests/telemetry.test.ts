import { describe, expect, it } from 'vitest';
import {
  driverCountBucket,
  driverIndexBucket,
  dwellSecondsBucket,
  fieldsCountBucket,
  nextDueWindow,
  overdueCountBucket,
} from '../src/lib/telemetry';

describe('telemetry buckets', () => {
  it('driver_count_bucket: 1 / 2 / 3_5', () => {
    expect(driverCountBucket(1)).toBe('1');
    expect(driverCountBucket(2)).toBe('2');
    expect(driverCountBucket(3)).toBe('3_5');
    expect(driverCountBucket(5)).toBe('3_5');
  });

  it('overdue_count_bucket: 0 / 1 / 2_plus', () => {
    expect(overdueCountBucket(0)).toBe('0');
    expect(overdueCountBucket(1)).toBe('1');
    expect(overdueCountBucket(4)).toBe('2_plus');
  });

  it('driver_index_bucket: first / second / third_plus', () => {
    expect(driverIndexBucket(1)).toBe('first');
    expect(driverIndexBucket(2)).toBe('second');
    expect(driverIndexBucket(5)).toBe('third_plus');
  });

  it('fields_count_bucket: 1 / 2 / 3_plus', () => {
    expect(fieldsCountBucket(1)).toBe('1');
    expect(fieldsCountBucket(2)).toBe('2');
    expect(fieldsCountBucket(6)).toBe('3_plus');
  });

  it('next_due_window follows the 30/60 day boundaries', () => {
    expect(nextDueWindow(-1)).toBe('overdue');
    expect(nextDueWindow(0)).toBe('0_30');
    expect(nextDueWindow(30)).toBe('0_30');
    expect(nextDueWindow(31)).toBe('31_60');
    expect(nextDueWindow(60)).toBe('31_60');
    expect(nextDueWindow(61)).toBe('61_plus');
    expect(nextDueWindow(null)).toBe('none');
  });

  it('dwell_seconds_bucket: 0_15 / 16_60 / 61_180 / 181_plus', () => {
    expect(dwellSecondsBucket(5)).toBe('0_15');
    expect(dwellSecondsBucket(16)).toBe('16_60');
    expect(dwellSecondsBucket(120)).toBe('61_180');
    expect(dwellSecondsBucket(600)).toBe('181_plus');
  });
});
