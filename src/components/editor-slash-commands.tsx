import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  CodeIcon,
  MinusIcon,
  TextIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Notion-style `/` command menu for the composer. A single registry backs it:
 * built-in formatting commands (`/h1`, `/code`, lists…) plus the user's saved
 * snippets (`/ty` → text). Type `/`, filter, ↑/↓ + Enter to run. This is the
 * backbone — add a new command by pushing onto STATIC_COMMANDS or by surfacing
 * another source the way snippets are surfaced here.
 */
export type SlashCommand = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  group: "Basic blocks" | "Snippets";
  icon: LucideIcon;
  run: (editor: Editor, range: Range) => void;
};

/** Built-in formatting commands. Each clears the typed `/query` first, then
 *  applies its block. */
const STATIC_COMMANDS: SlashCommand[] = [
  {
    id: "h1",
    title: "Heading 1",
    subtitle: "Big section heading",
    keywords: ["h1", "heading", "title"],
    group: "Basic blocks",
    icon: Heading1Icon,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    title: "Heading 2",
    subtitle: "Medium heading",
    keywords: ["h2", "heading", "subtitle"],
    group: "Basic blocks",
    icon: Heading2Icon,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    title: "Heading 3",
    subtitle: "Small heading",
    keywords: ["h3", "heading"],
    group: "Basic blocks",
    icon: Heading3Icon,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    title: "Bulleted list",
    subtitle: "A simple bulleted list",
    keywords: ["ul", "unordered", "bullet", "list"],
    group: "Basic blocks",
    icon: ListIcon,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
  },
  {
    id: "numbered",
    title: "Numbered list",
    subtitle: "A list with numbering",
    keywords: ["ol", "ordered", "number", "list"],
    group: "Basic blocks",
    icon: ListOrderedIcon,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
  },
  {
    id: "quote",
    title: "Quote",
    subtitle: "Capture a quote",
    keywords: ["blockquote", "quote"],
    group: "Basic blocks",
    icon: QuoteIcon,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
  },
  {
    id: "code",
    title: "Code block",
    subtitle: "A block of code",
    keywords: ["code", "pre", "snippet", "```"],
    group: "Basic blocks",
    icon: CodeIcon,
    run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    title: "Divider",
    subtitle: "A horizontal rule",
    keywords: ["hr", "rule", "divider", "---"],
    group: "Basic blocks",
    icon: MinusIcon,
    run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
  },
];

/** Turn the user's saved snippets into commands. Each becomes `/trigger` and
 *  inserts its text (replacing the typed query) plus a trailing space. */
function buildSnippetCommands(
  snippets: Record<string, string>,
): SlashCommand[] {
  return Object.entries(snippets).map(([trigger, text]) => ({
    id: `snippet:${trigger}`,
    title: trigger,
    subtitle: text,
    keywords: [trigger.replace(/^\//, "")],
    group: "Snippets",
    icon: TextIcon,
    run: (e, r) =>
      e.chain().focus().deleteRange(r).insertContent(`${text} `).run(),
  }));
}

function filterCommands(
  query: string,
  snippets: Record<string, string>,
): SlashCommand[] {
  const all = [...STATIC_COMMANDS, ...buildSnippetCommands(snippets)];
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.keywords?.some((k) => k.toLowerCase().includes(q)),
  );
}

// ── menu UI ────────────────────────────────────────────────────────────────

type SlashMenuRef = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const SlashMenuList = forwardRef<
  SlashMenuRef,
  { items: SlashCommand[]; command: (item: SlashCommand) => void }
>(({ items, command }, ref) => {
  const [selected, setSelected] = useState(0);

  // Reset the highlight whenever the filtered set changes.
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <div className="w-64 rounded-lg border bg-popover p-2 text-[12px] text-muted-foreground shadow-md">
        No matches
      </div>
    );
  }

  return (
    <div className="max-h-72 w-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
      {items.map((item, i) => {
        const showHeader = i === 0 || items[i - 1].group !== item.group;
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {showHeader && (
              <div className="px-2 pt-1.5 pb-1 font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
                {item.group}
              </div>
            )}
            <button
              type="button"
              // The editor keeps focus; prevent the mousedown from stealing it.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelected(i)}
              onClick={() => command(item)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                i === selected ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded border bg-background text-muted-foreground [&_svg]:size-3.5">
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[13px] text-foreground",
                    item.group === "Snippets" && "font-mono text-primary",
                  )}
                >
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {item.subtitle}
                  </span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
});
SlashMenuList.displayName = "SlashMenuList";

// ── positioning + render glue ────────────────────────────────────────────────

function positionMenu(
  el: HTMLElement,
  clientRect?: (() => DOMRect | null) | null,
) {
  if (!clientRect) return;
  const rect = clientRect();
  if (!rect) return;
  const menuHeight = el.offsetHeight || 280;
  const spaceBelow = window.innerHeight - rect.bottom;
  // Flip above the caret when there isn't room below.
  const top =
    spaceBelow < menuHeight + 12 && rect.top > menuHeight
      ? rect.top - menuHeight - 6
      : rect.bottom + 6;
  el.style.left = `${Math.round(rect.left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function makeRender(): SuggestionOptions<SlashCommand>["render"] {
  return () => {
    let component: ReactRenderer<SlashMenuRef> | null = null;

    return {
      onStart: (props: SuggestionProps<SlashCommand>) => {
        component = new ReactRenderer(SlashMenuList, {
          props,
          editor: props.editor,
        });
        const el = component.element as HTMLElement;
        el.style.position = "fixed";
        el.style.zIndex = "60";
        document.body.appendChild(el);
        positionMenu(el, props.clientRect);
      },
      onUpdate: (props: SuggestionProps<SlashCommand>) => {
        component?.updateProps(props);
        if (component) {
          positionMenu(component.element as HTMLElement, props.clientRect);
        }
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") return false;
        const ref = component?.ref as SlashMenuRef | null | undefined;
        return ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        component?.element.remove();
        component?.destroy();
        component = null;
      },
    };
  };
}

/** The editor extension. Configure with `getSnippets` so the menu always shows
 *  the user's current snippets without recreating the editor. */
export const SlashCommand = Extension.create<{
  getSnippets: () => Record<string, string>;
}>({
  name: "slashCommand",
  addOptions() {
    return { getSnippets: () => ({}) };
  },
  addProseMirrorPlugins() {
    const getSnippets = this.options.getSnippets;
    return [
      Suggestion<SlashCommand>({
        editor: this.editor,
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query }) => filterCommands(query, getSnippets()),
        render: makeRender(),
      }),
    ];
  },
});
