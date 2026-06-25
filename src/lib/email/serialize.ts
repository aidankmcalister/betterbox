/**
 * Email-safe HTML serializer (Composer Phase 0 — BOX-20).
 *
 * The composer edits in TipTap, but TipTap assumes a browser and email is not a
 * browser. Piping `editor.getHTML()` straight to the Gmail API is a latent
 * Outlook bug: flexbox/grid, `border-radius`, `float`/`position` and `<div>`
 * borders all render unpredictably in Word's engine. This layer takes the
 * editor's *document model* (ProseMirror/TipTap JSON) and rebuilds it into the
 * narrow set of primitives that render the same everywhere: inline-styled spans,
 * `<a>` tags, and table-based layout with inline CSS.
 *
 * It is a real transform to the email-safe node set, NOT a pass-through of
 * editor HTML — every rich composer feature is expected to serialize through
 * here, which is why it's the foundation the rest of the overhaul builds on.
 */

/** A TipTap/ProseMirror mark (bold, italic, link, …). */
export type EmailMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

/** A TipTap/ProseMirror JSON node — the shape `editor.getJSON()` returns. */
export type EmailNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EmailNode[];
  marks?: EmailMark[];
  text?: string;
};

// Reliable primitives only. Fonts fall back to system stacks; colors are inline.
const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
const TEXT = "#1a1a1a";
const MUTED = "#57606a";
const LINK = "#2563eb";
const BORDER = "#d0d7de";
const CODE_BG = "#f6f8fa";

const HEADING_SIZE: Record<number, number> = { 1: 24, 2: 20, 3: 16 };

/** Escape text for HTML body content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value destined for a double-quoted attribute. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Only http(s) and mailto links survive — `javascript:`/`data:` are dropped so a
 * crafted link can't ride along. A bare domain is promoted to https.
 */
export function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}([/?#]|$)/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function openMark(mark: EmailMark): string {
  switch (mark.type) {
    case "bold":
      return '<strong style="font-weight:700;">';
    case "italic":
      return "<em>";
    case "strike":
      return '<span style="text-decoration:line-through;">';
    case "code":
      return `<code style="font-family:${MONO_STACK};font-size:0.9em;background:${CODE_BG};padding:1px 4px;">`;
    case "link": {
      const href = safeHref(mark.attrs?.href);
      if (!href) return "<span>";
      return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:${LINK};text-decoration:underline;">`;
    }
    default:
      return "<span>";
  }
}

function closeMark(mark: EmailMark): string {
  switch (mark.type) {
    case "bold":
      return "</strong>";
    case "italic":
      return "</em>";
    case "code":
      return "</code>";
    case "link":
      return safeHref(mark.attrs?.href) ? "</a>" : "</span>";
    default:
      return "</span>";
  }
}

/** A text leaf with its marks applied (first mark outermost). */
function renderText(node: EmailNode): string {
  let html = escapeHtml(node.text ?? "");
  const marks = node.marks ?? [];
  for (let i = marks.length - 1; i >= 0; i--) {
    html = openMark(marks[i]) + html + closeMark(marks[i]);
  }
  return html;
}

/** Inline children of a block, concatenated. */
function renderInline(node: EmailNode): string {
  return (node.content ?? []).map(renderNode).join("");
}

function clampLevel(level: unknown): number {
  return level === 1 || level === 2 || level === 3 ? level : 2;
}

/** List-item content with its paragraphs unwrapped, so bullets stay tight. */
function renderListItem(node: EmailNode): string {
  return (node.content ?? [])
    .map((child) =>
      child.type === "paragraph" ? renderInline(child) : renderNode(child),
    )
    .join("");
}

/**
 * Blockquote as a 2-cell table: a 3px colored left cell is the "border" Outlook
 * will actually paint (a `border-left` on a `<div>`/`<blockquote>` is not).
 */
function renderBlockquote(node: EmailNode): string {
  const inner = (node.content ?? [])
    .map((child) =>
      child.type === "paragraph"
        ? `<p style="margin:0 0 8px;">${renderInline(child)}</p>`
        : renderNode(child),
    )
    .join("");
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;border-collapse:collapse;"><tr>` +
    `<td width="3" style="width:3px;background:${BORDER};font-size:0;line-height:0;">&nbsp;</td>` +
    `<td style="padding:0 0 0 12px;color:${MUTED};">${inner}</td>` +
    `</tr></table>`
  );
}

/**
 * Code block as a `bgcolor` table wrapper with inline-styled monospace text and
 * `white-space:pre-wrap` (Phase 1 adds syntax highlighting on top of this).
 */
function renderCodeBlock(node: EmailNode): string {
  const code = (node.content ?? [])
    .map((child) => escapeHtml(child.text ?? ""))
    .join("");
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${CODE_BG}" style="margin:0 0 16px;background:${CODE_BG};border-collapse:collapse;">` +
    `<tr><td style="padding:12px 14px;font-family:${MONO_STACK};font-size:13px;line-height:1.45;color:${TEXT};white-space:pre-wrap;word-break:break-word;">${code || "&nbsp;"}</td></tr></table>`
  );
}

/** Horizontal rule as a table row with a top border (a bare `<hr>` varies). */
function renderHr(): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;border-collapse:collapse;">` +
    `<tr><td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
  );
}

function renderNode(node: EmailNode): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "hardBreak":
      return "<br>";
    case "paragraph": {
      const inner = renderInline(node);
      return `<p style="margin:0 0 16px;">${inner || "&nbsp;"}</p>`;
    }
    case "heading": {
      const level = clampLevel(node.attrs?.level);
      return `<p style="margin:24px 0 12px;font-size:${HEADING_SIZE[level]}px;font-weight:700;line-height:1.25;">${renderInline(node)}</p>`;
    }
    case "bulletList":
      return `<ul style="margin:0 0 16px;padding-left:24px;">${renderInline(node)}</ul>`;
    case "orderedList":
      return `<ol style="margin:0 0 16px;padding-left:24px;">${renderInline(node)}</ol>`;
    case "listItem":
      return `<li style="margin:0 0 4px;">${renderListItem(node)}</li>`;
    case "blockquote":
      return renderBlockquote(node);
    case "codeBlock":
      return renderCodeBlock(node);
    case "horizontalRule":
      return renderHr();
    case "doc":
      return renderInline(node);
    default:
      // Unknown node (an extension we don't email-map yet): keep the text, drop
      // the unknown wrapper — degrade, never crash or emit unsafe markup.
      return renderInline(node);
  }
}

/**
 * Serialize a TipTap/ProseMirror document to a self-contained, email-safe HTML
 * fragment: the content wrapped in a single base-font table cell. This is the
 * string that should be sent to the Gmail API — never `editor.getHTML()`.
 */
export function serializeEmailHtml(doc: EmailNode): string {
  const body = renderNode(doc);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    `<tr><td style="font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${TEXT};">` +
    body +
    `</td></tr></table>`
  );
}
