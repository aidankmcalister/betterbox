import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateShort, parseIsoDate, toIsoDate } from "@/lib/dates";

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
  // so it's fillable from the keyboard, not only by clicking the chip.
  useEffect(() => {
    if (nodeSelected && !value && editor.isEditable) setOpen(true);
  }, [nodeSelected, value, editor.isEditable]);
  const selected = value ? (parseIsoDate(value) ?? undefined) : undefined;
  const filled = !!selected;
  const label = filled ? formatDateShort(value) : "pick a date";

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={!editor.isEditable}
          // Don't let the click move the editor selection before the popover opens.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "mx-px inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-px align-baseline font-mono text-[0.85em] leading-snug transition-colors",
            filled
              ? "border-primary/35 bg-primary/[0.13] text-primary hover:bg-primary/20"
              : "border-dashed border-primary/50 bg-primary/[0.07] text-primary/90 hover:bg-primary/15",
          )}
        >
          <CalendarIcon className="size-3" />
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
