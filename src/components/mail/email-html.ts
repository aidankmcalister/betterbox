import type { FullEmail } from "@/lib/mail-queries";

/** True for HTML with no visual styling (no images/tables/colors/links): renders
 *  natively in the dark reader instead of the sandboxed white iframe. */
export function isBareHtml(html: string): boolean {
  return (
    !/<(a|img|table|style|video|audio|iframe|svg|picture|source|hr|blockquote)\b/i.test(
      html,
    ) &&
    !/(?:style|bgcolor|background)\s*=/i.test(html) &&
    !/background(?:-color)?\s*:/i.test(html)
  );
}

/** Bare HTML → plain text (block tags become newlines, basic entities decode);
 *  used only when a bare-HTML email has no separate plain-text body. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Human-readable attachment size. */
export function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function parseAddress(from: string): { name: string; address: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim() || match[2], address: match[2] };
  return { name: from, address: from };
}

/** Split a header address list into bare addresses, respecting commas inside a quoted display name. */
export function splitAddresses(list: string): string[] {
  if (!list) return [];
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  for (const ch of list) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((part) => parseAddress(part).address).filter(Boolean);
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Quoted-reply body (blank line, attribution, original in a blockquote) as HTML to seed the rich editor. */
export function quotedReplyHtml(message: FullEmail): string {
  const who = parseAddress(message.from);
  const attribution = `On ${escapeHtml(message.date)}, ${escapeHtml(
    who.name,
  )} &lt;${escapeHtml(who.address)}&gt; wrote:`;
  const original = escapeHtml(message.body || message.snippet || "")
    .split("\n")
    .join("<br>");
  return `<p></p><p>${attribution}</p><blockquote>${original}</blockquote>`;
}

export const isoDate = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

/** Clock-aware time only, e.g. "10:16" / "10:16 AM". */
export const timeOnly = (raw: string, hour12: boolean) => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleTimeString([], {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  });
};

/** Compact relative age ("2h ago", "3d ago"); falls back to a short date past a week. */
export const relativeTime = (raw: string) => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const secs = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};
