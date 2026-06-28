import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  CalendarIcon,
  ChevronDownIcon,
  MailIcon,
  Pencil,
  SparklesIcon,
  Trash2,
  Undo2,
  UserRound,
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
import { FieldNameDialog } from "@/components/editor/field-name-dialog";
import { suggestVariable, type VariableSuggestion } from "@/lib/variable-detect";

type Range = { from: number; to: number };

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
  { kind: "first_name", label: "First name", icon: UserRound, name: "first_name" },
  { kind: "last_name", label: "Last name", icon: UserRound, name: "last_name" },
  { kind: "name", label: "Full name", icon: UserRound, name: "name" },
  { kind: "email", label: "Email", icon: MailIcon, name: "email" },
  { kind: "date", label: "Date", icon: CalendarIcon, name: "date" },
  { kind: "custom", label: "Custom fill-in field…", icon: Pencil, name: null },
];

/** Floating menu over the snippet editor's selection: convert a text run into a
 *  token chip, or edit an existing chip. Settings-modal only. */
export function SnippetTokenBubble({ editor }: { editor: Editor }) {
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [customTarget, setCustomTarget] = useState<
    (Range & { fallback: string }) | null
  >(null);
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

  const insertAt = (range: Range, name: string) =>
    editor.chain().focus().insertContentAt(range, tokenNode(name)).run();
  const pick = (o: Option, b: Bubble, fallback: string) => {
    if (o.name) insertAt({ from: b.from, to: b.to }, o.name);
    else setCustomTarget({ from: b.from, to: b.to, fallback });
    setBubble(null);
  };
  const onOpenChange = (open: boolean) => {
    menuOpenRef.current = open;
    if (!open) setBubble(null);
  };

  return (
    <>
      {bubble && (
        // biome-ignore lint/a11y/noStaticElementInteractions: mousedown only guards the selection; the menu inside is the control.
        <div
          className="fixed z-60 -translate-x-1/2 -translate-y-full"
          style={{ left: bubble.left, top: bubble.top - 10 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {bubble.mode === "convert" ? (
            <ConvertMenu
              suggestion={bubble.suggestion}
              onOpenChange={onOpenChange}
              onPick={(o) => pick(o, bubble, bubble.suggestion.slug)}
            />
          ) : (
            <TokenMenu
              token={bubble.token}
              onOpenChange={onOpenChange}
              onPick={(o) => pick(o, bubble, bubble.token)}
              onUnwrap={() => {
                insertAtText(editor, bubble, humanizeFillLabel(bubble.token));
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
      )}
      <FieldNameDialog
        open={!!customTarget}
        defaultValue={customTarget?.fallback ?? ""}
        onOpenChange={(open) => {
          if (!open) setCustomTarget(null);
        }}
        onSubmit={(slug) => {
          if (customTarget) insertAt(customTarget, slug);
          setCustomTarget(null);
        }}
      />
    </>
  );
}

function insertAtText(editor: Editor, range: Range, text: string) {
  editor.chain().focus().insertContentAt(range, text).run();
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
        render={<Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 shadow-xl" />}
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
        render={<Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 shadow-xl" />}
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
