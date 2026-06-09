/** Compact counts for badges: 999 → "999", 1300 → "1.3k", 20649 → "20.6k". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const compact = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded >= 100 ? Math.round(rounded) : rounded);
  };
  if (n < 1_000_000) return `${compact(n / 1000)}k`;
  return `${compact(n / 1_000_000)}m`;
}
