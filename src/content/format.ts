const UNITS: ReadonlyArray<readonly [number, string]> = [
  [1e20, '万亿亿'],
  [1e16, '亿亿'],
  [1e12, '万亿'],
  [1e8, '亿'],
  [1e4, '万'],
];

function trimmed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return digits > 0 ? text.replace(/\.?0+$/, '') : text;
}

/** Chinese large-number display: 9,999 → 9,999; 12,300 → 1.23万; 2e8 → 2亿; 3e15 → 3000万亿. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const abs = Math.abs(value);
  if (abs < 10) return trimmed(value, abs < 1 && abs > 0 ? 2 : 1);
  if (abs < 10_000) return Math.floor(value).toLocaleString('en-US');
  for (const [size, unit] of UNITS) {
    if (abs >= size) {
      const scaled = value / size;
      const digits = Math.abs(scaled) >= 1000 ? 0 : Math.abs(scaled) >= 100 ? 1 : 2;
      // Rounding down keeps a price from displaying as affordable before it is.
      const factor = 10 ** digits;
      return `${trimmed(Math.floor(scaled * factor) / factor, digits)}${unit}`;
    }
  }
  return String(Math.floor(value));
}
