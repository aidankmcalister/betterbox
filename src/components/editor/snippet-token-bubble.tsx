import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  CalendarIcon,
  ChevronDownIcon,
  CircleUserRound,
  MailIcon,
  Pencil,
  SparklesIcon,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VARIABLE_KEYS } from "@/lib/snippet-tokens";
import { humanizeFillLabel } from "@/lib/email/serialize";
import { tokenNode } from "@/components/editor/editor-fill-fields";
import { suggestVariable, type VariableSuggestion } from "@/lib/variable-detect";

type Bubble =
  | { mode: "convert"; left: number; top: number; from: number; to: number; suggestion: VariableSuggestion }
  | { mode: "token"; left: number; top: number; from: number; to: number; token: string };

type Option = {
  kind: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Token name, or null for "Custom fill-in…" which prompts for one. */
  name: string | null;
};

const OPTIONS: Option[] = [
  { kind: "first_name", label: "First name", icon: CircleUserRound, name: "first_name" },
  { kind: "last_name", label: "Last name", icon: CircleUserRound, name: "last_name" },
  { kind: "name", label: "Full name", icon: CircleUserRound, name: "name" },
  { kind: "email", label: "Email", icon: MailIcon, name: "email" },
  { kind: "date", label: "Date", icon: CalendarIcon, name: "date" },
  { kind: "custom", label: "Custom fill-in field…", icon: Pencil, name: null },
];

function promptName(fallback: string): string | null {
  const input = window.prompt("Fill-in field name", fallback);
  const slug = input?.trim().toLowerCase().replace(/\s+/g, "_");
  return slug || null;
}

/** Floating menu over the snippet editor's selection: convert a text run into a
 *  token chip, or edit an existing chip. Settings-modal only. */
export function SnippetTokenBubble({ editor }: { editor: Editor }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      if (menuOpenRef.current) return;
      if (!editor.isFocused) return setBubble(null);
      const box = document
        .querySelector('[data-slot="dialog-content"]')
        ?.getBoundingClientRect();
      const ox = box?.left ?? 0;
      const oy = box?.top ?? 0;
      const sel = editor.state.selection;

      if (sel instanceof NodeSelection && sel.node.type.name === "fillField") {
        const a = editor.view.coordsAtPos(sel.from);
        const b = editor.view.coordsAtPos(sel.to);
        return setBubble({
          mode: "token",
          left: (a.left + b.right) / 2 - ox,
          top: a.top - oy,
          from: sel.from,
          to: sel.to,
          token: String(sel.node.attrs.label ?? "").toLowerCase(),
        });
      }

      const { from, to, empty } = sel;
      if (empty) return setBubble(null);
      const dom = window.getSelection();
      if (!dom || dom.isCollapsed || !dom.rangeCount) return setBubble(null);
      const r = dom.getRangeAt(0).getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return setBubble(null);
      const text = editor.state.doc.textBetween(from, to, " ").trim();
      if (!text) return setBubble(null);
      setBubble({
        mode: "convert",
        left: r.left + r.width / 2 - ox,
        top: r.top - oy,
        from,
        to,
        suggestion: suggestVariable(text),
      });
    };
    const clear = () => {
      if (!menuOpenRef.current) setBubble(null);
    };
    editor.on("selectionUpdate", sync);
    editor.on("blur", clear);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("blur", clear);
    };
  }, [editor]);

  if (!bubble) return null;

  const insert = (o: Option, fallback: string) => {
    const name = o.name ?? promptName(fallback);
    if (!name) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: bubble.from, to: bubble.to }, tokenNode(name))
      .run();
    setBubble(null);
  };
  const onOpenChange = (open: boolean) => {
    menuOpenRef.current = open;
    if (!open) setBubble(null);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mousedown only guards the selection; the menu inside is the control.
    <div
      className="fixed z-[60] -translate-x-1/2 -translate-y-full"
      style={{ left: bubble.left, top: bubble.top - 10 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {bubble.mode === "convert" ? (
        <ConvertMenu
          suggestion={bubble.suggestion}
          onOpenChange={onOpenChange}
          onPick={(o) => insert(o, bubble.suggestion.slug)}
        />
      ) : (
        <TokenMenu
          token={bubble.token}
          onOpenChange={onOpenChange}
          onPick={(o) => insert(o, bubble.token)}
          onUnwrap={() => {
            editor
              .chain()
              .focus()
              .insertContentAt(
                { from: bubble.from, to: bubble.to },
                humanizeFillLabel(bubble.token),
              )
              .run();
            setBubble(null);
          }}
          onDelete={() => {
            editor
              .chain()
              .focus()
              .deleteRange({ from: bubble.from, to: bubble.to })
              .run();
            setBubble(null);
          }}
        />
      )}
    </div>
  );
}

function ConvertMenu({
  suggestion,
  onPick,
  onOpenChange,
}: {
  suggestion: VariableSuggestion;
  onPick: (o: Option) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const suggested =
    OPTIONS.find((o) => o.kind === suggestion.kind) ?? OPTIONS[OPTIONS.length - 1];
  const rest = OPTIONS.filter((o) => o !== suggested);
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 gap-1.5 shadow-xl" />}
      >
        <SparklesIcon className="text-primary" />
        Convert to variable
        <ChevronDownIcon className="text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Suggested</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onPick(suggested)}>
            <suggested.icon />
            {suggested.label}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {rest.map((o) => (
            <DropdownMenuItem key={o.kind} onClick={() => onPick(o)}>
              <o.icon />
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TokenMenu({
  token,
  onPick,
  onUnwrap,
  onDelete,
  onOpenChange,
}: {
  token: string;
  onPick: (o: Option) => void;
  onUnwrap: () => void;
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const header = VARIABLE_KEYS.has(token)
    ? "Auto-fills from the recipient."
    : "Fill-in field you Tab through.";
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 gap-1.5 shadow-xl" />}
      >
        {humanizeFillLabel(token)}
        <ChevronDownIcon className="text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <div className="px-1.5 pt-1 pb-0.5 text-[11.5px] text-muted-foreground">
          {header}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Change to</DropdownMenuLabel>
          {OPTIONS.map((o) => (
            <DropdownMenuItem key={o.kind} onClick={() => onPick(o)}>
              <o.icon />
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onUnwrap}>
            <Undo2 />
            Remove (keep as text)
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
