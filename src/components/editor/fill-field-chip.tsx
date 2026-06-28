import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { VARIABLE_KEYS } from "@/lib/snippet-tokens";
import { humanizeFillLabel } from "@/lib/email/serialize";
import { tokenChipClass, tokenIcon } from "@/components/editor/token-chip";

const VAR_TIP = "Auto-fills with the recipient's name, or type your own here.";
const FIELD_TIP = "Type your value, then Tab to the next field.";

/** In-editor rendering of a fill-field chip — the same chip in the snippet
 *  editor and every composer. renderHTML still drives serialization. */
export function FillFieldChip({ node, editor, selected }: NodeViewProps) {
  const label = String(node.attrs.label ?? "");
  const key = label.toLowerCase();
  const isCursor = key === "cursor";
  // Tooltip only in the composer, where an unfilled field blocks send.
  const snippet = editor.view.dom.classList.contains("tiptap--snippet");
  const tip =
    snippet || isCursor
      ? undefined
      : VARIABLE_KEYS.has(key)
        ? VAR_TIP
        : FIELD_TIP;
  const Icon = tokenIcon(key);
  return (
    <NodeViewWrapper
      as="span"
      data-fill-field=""
      data-tip={tip}
      contentEditable={false}
      className={tokenChipClass(key, selected)}
    >
      <Icon />
      {humanizeFillLabel(label)}
    </NodeViewWrapper>
  );
}
