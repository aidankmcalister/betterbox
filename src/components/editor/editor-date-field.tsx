import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateShort, parseIsoDate, toIsoDate } from "@/lib/dates";
import { tokenChipClass } from "@/components/editor/token-chip";

/**
 * `{{date}}` snippet field — an inline atom that, when clicked, opens a
 * datepicker. Empty until you pick; the chosen date renders inline and
 * serializes to a friendly long date on send. Unfilled date fields block send
 * like the other fill fields.
 */
function DateFieldView({
  node,
  updateAttributes,
  editor,
  selected: nodeSelected,
}: NodeViewProps) {
  const value = String(node.attrs.value ?? "");
  const [open, setOpen] = useState(false);
  // Tab/expansion lands the selection on an empty date field — open the picker
  // so it's fillable from the keyboard, not only by clicking the chip. Guard on
  // a real NodeSelection of THIS node: a range like select-all also marks the
  // node "selected", and opening then would steal focus into the calendar and
  // break select-all-delete.
  useEffect(() => {
    if (
      nodeSelected &&
      !value &&
      editor.isEditable &&
      editor.state.selection instanceof NodeSelection
    )
      setOpen(true);
  }, [nodeSelected, value, editor.isEditable, editor.state.selection]);
  const selected = value ? (parseIsoDate(value) ?? undefined) : undefined;
  const label = selected ? formatDateShort(value) : "Pick a date";

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={!editor.isEditable}
          // Don't let the click move the editor selection before the popover opens.
          onMouseDown={(e) => e.preventDefault()}
          className={tokenChipClass("date", nodeSelected)}
        >
          <CalendarIcon />
          {label}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <Calendar
            selected={selected}
            onSelect={(d) => {
              updateAttributes({ value: toIsoDate(d) });
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

export const DateField = Node.create({
  name: "dateField",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-value") ?? "",
        renderHTML: (attrs) => ({ "data-value": attrs.value }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-date-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-date-field": "",
        class: "date-field",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DateFieldView);
  },
});
