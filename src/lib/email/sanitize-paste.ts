/**
 * Paste sanitizer (Composer Phase 0 — BOX-20).
 *
 * Google Docs / Word / Outlook pastes carry cruft: `mso-` declarations,
 * `<o:p>` and other Office-namespace tags, MS conditional comments, MsoNormal
 * classes, embedded `<style>`. Runs as TipTap's `transformPastedHTML` hook
 * (before ProseMirror parses) so only clean markup reaches the allowed node set.
 *
 * Keeps schema-understood formatting (`font-weight`/`font-style`, `<b>`/`<strong>`/
 * `<a href>`/`<ul>`…) and strips only junk. Node-level filtering (tables, images)
 * is left to ProseMirror's schema, which discards what it doesn't recognize.
 */

/** Drop any `mso-*` declarations from a style attribute body, keep the rest. */
function stripMsoDeclarations(style: string): string {
  return style
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl) => {
      if (!decl) return false;
      const prop = decl.split(":")[0]?.trim().toLowerCase() ?? "";
      return !prop.startsWith("mso-");
    })
    .join(";");
}

export function sanitizePastedHtml(html: string): string {
  if (!html) return html;
  let out = html;

  // 1. MS conditional comments: <!--[if gte mso 9]>…<![endif]--> and the bare
  //    "downlevel-revealed" forms <![if !supportLists]>…<![endif]>.
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  out = out.replace(/<!\[if[\s\S]*?\]>/gi, "").replace(/<!\[endif\]>/gi, "");

  // 2. Whole junk blocks (with their content) + void metadata tags.
  out = out.replace(/<(style|script|title|xml)\b[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(meta|link|style|script|xml)\b[^>]*\/?>/gi, "");

  // 3. Office-namespace tags: <o:p>, <w:sdt>, <m:…>, <v:…> (open/close/self-close).
  out = out.replace(/<\/?[a-z][\w-]*:[^>]*>/gi, "");

  // 4. Foreign class / lang attributes (MsoNormal et al.).
  out = out.replace(/\s(?:class|lang)="[^"]*"/gi, "");
  out = out.replace(/\s(?:class|lang)='[^']*'/gi, "");

  // 5. mso- declarations inside style attributes; drop an emptied style entirely.
  out = out.replace(/\sstyle="([^"]*)"/gi, (_match, body: string) => {
    const cleaned = stripMsoDeclarations(body);
    return cleaned ? ` style="${cleaned}"` : "";
  });

  // 6. Any remaining HTML comments.
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  return out.trim();
}
