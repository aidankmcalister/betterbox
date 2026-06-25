import { Node } from "@tiptap/core";
import type { Editor, JSONContent } from "@tiptap/core";

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
    return { label: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "span[data-fill-field]" }];
  },

  renderHTML({ node }) {
    return [
      "span",
      { "data-fill-field": "", class: "fill-field" },
      `${node.attrs.label}`,
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
  const { content, cursorIndex } = snippetToContent(text, variables);
  const hasField = content.some((c) => c.type === "fillField");
  const start = range.from;

  if (hasField) {
    editor.chain().focus().deleteRange(range).insertContent(content).run();
    if (!selectFirstFillField(editor, start)) {
      editor.chain().focus().run();
    }
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
