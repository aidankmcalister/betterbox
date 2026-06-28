import DOMPurify from "dompurify";

/** Read-only render of the body as the recipient sees it. Same prose styles as the editor, sanitized
 *  (our own TipTap output, but a pasted/typed link could carry a javascript: href). */
export function PreviewBody({
  html,
  minHeight,
}: {
  html: string;
  minHeight: number;
}) {
  if (!html) {
    return (
      <div
        className="px-3.5 py-3 text-[13px] text-muted-foreground/60"
        style={{ minHeight }}
      >
        Nothing to preview yet. Write a message first.
      </div>
    );
  }
  const clean = typeof window === "undefined" ? "" : DOMPurify.sanitize(html);
  // The serialized email carries email-oriented colors (dark text for white bg). Render on a light "paper"
  // canvas as the recipient sees it, so text reads right instead of dim against the dark composer.
  return (
    <div className="p-3" style={{ minHeight }}>
      <div
        className="tiptap prose-email max-w-none rounded-lg border border-black/10 bg-white px-4 py-3.5 text-[13px] leading-[1.6] text-[#1a1a1a] scheme-light"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: `clean` is DOMPurify-sanitized one line above; this renders the composer's own preview.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </div>
  );
}
