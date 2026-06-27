import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor, JSONContent } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { toast } from "sonner";
import {
  escapeHtml,
  humanizeFillLabel,
  type EmailNode,
} from "@/lib/email/serialize";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";
import { FillFieldChip } from "@/components/editor/fill-field-chip";

/** Count unfilled tab-stops remaining (for the send guardrail); a `dateField`
 *  counts only while no date is picked. Pure walk over the TipTap JSON. */
export function countFillFields(node: EmailNode | null | undefined): number {
  if (!node) return 0;
  let total =
    node.type === "fillField" ||
    (node.type === "dateField" && !node.attrs?.value)
      ? 1
      : 0;
  for (const child of node.content ?? []) total += countFillFields(child);
  return total;
}

/**
 * Snippet fill-in fields + variables (Composer Phase 2 — BOX-22). `{{tokens}}`:
 * known variables (`{{first_name}}`) resolve from the To: contact, `{{cursor}}`
 * sets the post-expansion caret, anything else becomes a tab-stop "fill field"
 * (a highlighted chip you Tab through and type over). Fill fields are an inline
 * atom so the serializer can map them to plain-text labels and Tab selects them
 * as a unit.
 */
export const FillField = Node.create({
  name: "fillField",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    // Raw token rides in data-label so saved drafts round-trip; visible text is
    // the humanized label.
    return {
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? el.textContent ?? "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-fill-field]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = String(node.attrs.label ?? "");
    // Chip is always orange; tooltip explains why it's manual — an unresolved
    // recipient variable gets the "normally auto-fills" note, a custom field the basics.
    const isVar = VARIABLE_KEYS.has(label.toLowerCase());
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-fill-field": "",
        class: isVar ? "fill-field fill-field--var" : "fill-field",
        "data-tip": isVar
          ? "Needs manual entry. This normally auto-fills from the recipient's name — there isn't one yet, so add them to the To: line (and it fills itself) or type it here."
          : "Needs manual entry before you can send. Type your value, then Tab to the next field.",
      }),
      humanizeFillLabel(label),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => jumpFillField(this.editor, 1),
      "Shift-Tab": () => jumpFillField(this.editor, -1),
    };
  },

  // Display only — renderHTML above still drives serialization. The view adds
  // the field's icon in the snippet editor; the composer renders label-only.
  addNodeView() {
    return ReactNodeViewRenderer(FillFieldChip);
  },
});

/** A node still needing input before send: a fill-field, or a date-field with
 *  no date picked. Tab cycles through these. */
function isUnfilledField(node: { type: { name: string }; attrs: { value?: unknown } }): boolean {
  return (
    node.type.name === "fillField" ||
    (node.type.name === "dateField" && !node.attrs.value)
  );
}

/** Positions of every unfilled field in the document, in order. */
function fillFieldPositions(editor: Editor): number[] {
  const out: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (isUnfilledField(node)) out.push(pos);
  });
  return out;
}

/** Position of the first unfilled fill/date field, or null. */
export function firstUnfilledFieldPos(editor: Editor): number | null {
  return fillFieldPositions(editor)[0] ?? null;
}

/** Move the selection to the next/previous fill field, wrapping. Returns false
 *  when there are none, so Tab keeps its default behavior. */
function jumpFillField(editor: Editor, dir: 1 | -1): boolean {
  const positions = fillFieldPositions(editor);
  if (positions.length === 0) return false;
  const from = editor.state.selection.from;
  const target =
    dir === 1
      ? (positions.find((p) => p > from) ?? positions[0])
      : ([...positions].reverse().find((p) => p < from) ??
        positions[positions.length - 1]);
  editor.chain().focus().setNodeSelection(target).run();
  return true;
}

const TOKEN = /\{\{([^}]+)\}\}/;
const SPLIT = /(\{\{[^}]+\}\})/;

/** Turn a snippet string into editor content (known variables resolved, the
 *  rest emitted as fill-field nodes). Returns content + the `{{cursor}}` index (or -1). */
function snippetToContent(
  text: string,
  variables: Record<string, string>,
): { content: JSONContent[]; cursorIndex: number } {
  const content: JSONContent[] = [];
  let cursorIndex = -1;
  for (const seg of text.split(SPLIT)) {
    if (seg === "") continue;
    const m = seg.match(TOKEN);
    if (!m) {
      content.push({ type: "text", text: seg });
      continue;
    }
    const token = m[1].trim();
    const key = token.toLowerCase();
    if (key === "cursor") {
      cursorIndex = content.length;
      continue;
    }
    if (key === "date") {
      content.push({ type: "dateField", attrs: { value: "" } });
      continue;
    }
    const value = variables[key];
    if (value != null && value !== "") {
      content.push({ type: "text", text: value });
    } else {
      content.push({ type: "fillField", attrs: { label: token } });
    }
  }
  return { content, cursorIndex };
}

/** Select the first unfilled field at or after `start`, if any. */
function selectFirstFillField(editor: Editor, start: number): boolean {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target === -1 && pos >= start && isUnfilledField(node)) {
      target = pos;
    }
  });
  if (target < 0) return false;
  editor.chain().setNodeSelection(target).run();
  return true;
}

/**
 * Insert a snippet at `range`, resolving variables and fill fields, then land
 * the caret: on the first fill field if any, else at the `{{cursor}}` token,
 * else after the inserted text.
 */
export function insertSnippet(
  editor: Editor,
  range: { from: number; to: number },
  text: string,
  variables: Record<string, string>,
): void {
  // Rich snippets are HTML: expand tokens in the markup and let TipTap parse it
  // (fill-field spans round-trip into FillField nodes; formatting flows through
  // the email-safe serializer on send).
  if (/<[a-z][\s\S]*?>/i.test(text)) {
    const html = text.replace(/\{\{([^}]+)\}\}/g, (_m, raw: string) => {
      const token = raw.trim();
      const key = token.toLowerCase();
      if (key === "cursor") return "";
      if (key === "date") return `<span data-date-field data-value=""></span>`;
      const value = variables[key];
      if (value != null && value !== "") return escapeHtml(value);
      const label = escapeHtml(token).replace(/"/g, "&quot;");
      return `<span data-fill-field data-label="${label}"></span>`;
    });
    editor.chain().focus().deleteRange(range).insertContent(html).run();
    if (!selectFirstFillField(editor, range.from)) editor.chain().focus().run();
    return;
  }

  const { content, cursorIndex } = snippetToContent(text, variables);
  const isField = (c: JSONContent) =>
    c.type === "fillField" || c.type === "dateField";
  const hasField = content.some(isField);
  const start = range.from;

  if (hasField) {
    editor.chain().focus().deleteRange(range).insertContent(content).run();
    selectFirstFillField(editor, start);
    const count = content.filter(isField).length;
    // Tell the user what those highlighted chips are + how to fill them.
    toast("Fill in the highlighted fields", {
      description:
        count > 1
          ? "Type to replace the selected one, then Tab to the next."
          : "Type to replace it.",
    });
    return;
  }

  if (cursorIndex >= 0) {
    const before = content.slice(0, cursorIndex);
    const after = content.slice(cursorIndex);
    editor.chain().focus().deleteRange(range).insertContent(before).run();
    const caret = editor.state.selection.from;
    if (after.length > 0) editor.chain().insertContent(after).run();
    editor.chain().setTextSelection(caret).run();
    return;
  }

  // Plain snippet: keep the old behavior of a trailing space.
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([...content, { type: "text", text: " " }])
    .run();
}

const FIELD_TOKEN_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g;

/** The editor node a `{{token}}` becomes: `{{date}}` is the date picker,
 *  everything else (including `{{cursor}}`) is a fill-field chip. */
export function tokenNode(token: string): JSONContent | string {
  const key = token.toLowerCase();
  if (key === "date") return { type: "dateField", attrs: { value: "" } };
  return { type: "fillField", attrs: { label: key } };
}

/** Stored `{{token}}` text → chip-node HTML, for loading a snippet into the
 *  editor. The reverse of fieldHtmlToTokens. */
export function tokensToFieldHtml(html: string): string {
  return html.replace(FIELD_TOKEN_RE, (_m, raw: string) => {
    const key = raw.toLowerCase();
    if (key === "date") return '<span data-date-field data-value=""></span>';
    return `<span data-fill-field data-label="${escapeHtml(key)}"></span>`;
  });
}

/** The editor's chip-node HTML → `{{token}}` text, for saving the snippet. */
export function fieldHtmlToTokens(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const el of doc.querySelectorAll("[data-fill-field]")) {
    el.replaceWith(`{{${el.getAttribute("data-label") ?? ""}}}`);
  }
  for (const el of doc.querySelectorAll("[data-date-field]")) {
    el.replaceWith("{{date}}");
  }
  return doc.body.innerHTML;
}
