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

/** Coarse "time ago" for timestamps: 90s → "1m ago", 7200s → "2h ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const [value, unit] =
    seconds < 60
      ? [seconds, "s"]
      : seconds < 3600
        ? [Math.floor(seconds / 60), "m"]
        : seconds < 86400
          ? [Math.floor(seconds / 3600), "h"]
          : [Math.floor(seconds / 86400), "d"];
  return `${value}${unit} ago`;
}
