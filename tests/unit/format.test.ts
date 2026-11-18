import { describe, expect, it } from 'vitest';
import { formatAmount } from '../../src/content/format.ts';

describe('formatAmount', () => {
  it.each([
    [0, '0'],
    [0.2, '0.2'],
    [1.5, '1.5'],
    [15, '15'],
    [9999, '9,999'],
    [10_000, '1万'],
    [12_345, '1.23万'],
    [1_000_000, '100万'],
    [200_000_000, '2亿'],
    [20_000_000_000, '200亿'],
    [1e12, '1兆'],
  ])('%d → %s', (value, text) => {
    expect(formatAmount(value)).toBe(text);
  });

  it('never rounds a price up past its real value', () => {
    expect(formatAmount(19_999)).toBe('1.99万');
  });
});
