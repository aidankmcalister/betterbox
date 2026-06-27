import { escapeHtml } from "@/lib/email/serialize";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Plain snippet text → muted-chip HTML (blue = auto-fill, orange = fill-in;
 *  the cursor marker is dropped). Escapes everything else. Shared by the
 *  settings snippet list and the composer's / menu. */
export function snippetTokenChips(plain: string): string {
  return escapeHtml(plain).replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor") return "";
    const cls = VARIABLE_KEYS.has(k)
      ? "border-label-blue/25 bg-label-blue/[0.08] text-label-blue/80"
      : "border-primary/25 bg-primary/[0.08] text-primary/80";
    return `<span class="inline-block rounded border ${cls} px-1 font-mono text-[0.85em] leading-[1.45] align-middle">${escapeHtml(raw)}</span>`;
  });
}

/** Strip a snippet's HTML to one line, then render its tokens as muted chips. */
export function snippetRowPreview(html: string): string {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Empty snippet";
  return snippetTokenChips(plain);
}
