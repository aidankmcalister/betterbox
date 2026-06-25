/** Date helpers for the `{{date}}` snippet field — stored as a date-only ISO
 *  string (YYYY-MM-DD) to dodge timezone drift. */

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "Tuesday, July 1" — what gets written into the sent email. */
export function formatDateLong(iso: string): string {
  const d = parseIsoDate(iso);
  return d
    ? d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "";
}

/** "Tue, Jul 1" — the compact label shown in the editor chip. */
export function formatDateShort(iso: string): string {
  const d = parseIsoDate(iso);
  return d
    ? d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";
}
