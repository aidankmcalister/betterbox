import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor, JSONContent } from "@tiptap/core";
import { toast } from "sonner";
import {
  escapeHtml,
  humanizeFillLabel,
  type EmailNode,
} from "@/lib/email/serialize";

/** Count unfilled fill-field tab-stops remaining in a document (for the send
 *  guardrail). A `dateField` counts only while it has no date picked. Pure walk
 *  over the TipTap JSON. */
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
 * Snippet fill-in fields + variables (Composer Phase 2 — BOX-22).
 *
 * Snippet text can carry `{{tokens}}`:
 *   - `{{first_name}}` / known variables → replaced inline from the To: contact.
 *   - `{{cursor}}` → where the caret lands after expansion.
 *   - `{{anything else}}` → a tab-stop "fill field": a highlighted chip you Tab
 *     through and type over. This is the single biggest composer UX upgrade.
 *
 * Fill fields are an inline atom node, so the serializer can map them (to their
 * label as plain text) and Tab can select them as a unit.
 */
export const FillField = Node.create({
  name: "fillField",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    // The raw token rides in data-label so a saved draft round-trips; the
    // visible text is the humanized label.
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
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-fill-field": "",
        class: "fill-field",
        title: "Type to fill this in · Tab jumps to the next field",
      }),
      humanizeFillLabel(String(node.attrs.label ?? "")),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => jumpFillField(this.editor, 1),
      "Shift-Tab": () => jumpFillField(this.editor, -1),
    };
  },
});

/** Positions of every fill field in the document, in order. */
function fillFieldPositions(editor: Editor): number[] {
  const out: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "fillField") out.push(pos);
  });
  return out;
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

/** Turn a snippet string into editor content, resolving known variables and
 *  emitting fill-field nodes for the rest. Returns the content plus the index
 *  of a `{{cursor}}` token (or -1). */
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

/** Select the first fill field at or after `start`, if any. */
function selectFirstFillField(editor: Editor, start: number): boolean {
  let target = -1;
  editor.state.doc.descendants((node, pos) => {
    if (target === -1 && pos >= start && node.type.name === "fillField") {
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
  // Rich snippets are stored as HTML — expand the tokens inside the markup and
  // let TipTap parse it (the fill-field spans round-trip into FillField nodes,
  // and the formatting flows through the email-safe serializer on send).
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
  const hasField = content.some((c) => c.type === "fillField");
  const start = range.from;

  if (hasField) {
    editor.chain().focus().deleteRange(range).insertContent(content).run();
    selectFirstFillField(editor, start);
    const count = content.filter((c) => c.type === "fillField").length;
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
