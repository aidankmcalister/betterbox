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
import { insertSnippet } from "@/components/editor-fill-fields";

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
 *  inserts its content — resolving `{{variables}}`, `{{cursor}}`, and tab-stop
 *  `{{fields}}` (see insertSnippet). Variables are pulled fresh at run time. */
function buildSnippetCommands(
  snippets: Record<string, string>,
  getVariables: () => Record<string, string>,
): SlashCommand[] {
  return Object.entries(snippets).map(([trigger, text]) => ({
    id: `snippet:${trigger}`,
    title: trigger,
    // Rich snippets are HTML — show a plain-text preview, not tags.
    subtitle: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    keywords: [trigger.replace(/^\//, "")],
    group: "Snippets",
    icon: TextIcon,
    run: (e, r) => insertSnippet(e, r, text, getVariables()),
  }));
}

function filterCommands(
  query: string,
  snippets: Record<string, string>,
  getVariables: () => Record<string, string>,
): SlashCommand[] {
  const all = [
    ...STATIC_COMMANDS,
    ...buildSnippetCommands(snippets, getVariables),
  ];
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
          setSelected((s) => Math.min(s + 1, items.length - 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => Math.max(s - 1, 0));
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
      <div className="w-72 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-2 text-[12px] text-muted-foreground shadow-xl ring-1 ring-foreground/10">
        No matches
      </div>
    );
  }

  return (
    <div className="max-h-72 w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border bg-popover p-1 shadow-xl ring-1 ring-foreground/10">
      {items.map((item, i) => {
        const showHeader = i === 0 || items[i - 1].group !== item.group;
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {showHeader && (
              <div className="px-1.5 pt-1.5 pb-0.5 font-mono text-[9.5px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
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
                "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left",
                i === selected && "bg-accent text-accent-foreground",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border bg-background text-muted-foreground [&_svg]:size-3">
                <Icon />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span
                  className={cn(
                    "block truncate text-[12.5px] text-foreground",
                    item.group === "Snippets" && "font-mono text-primary",
                  )}
                >
                  {item.title}
                </span>
                {item.subtitle && (
                  <span className="block truncate text-[11px] text-muted-foreground/80">
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
  // Clamp horizontally so the menu never runs off a narrow (mobile) viewport.
  const menuWidth = el.offsetWidth || 288;
  const left = Math.max(
    8,
    Math.min(rect.left, window.innerWidth - menuWidth - 8),
  );
  el.style.left = `${Math.round(left)}px`;
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
        // Above the composer dialog (the To-field autocomplete sits at z-50
        // inside it; this menu mounts to body, so clear the dialog entirely).
        el.style.zIndex = "100";
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
  getVariables: () => Record<string, string>;
}>({
  name: "slashCommand",
  addOptions() {
    return { getSnippets: () => ({}), getVariables: () => ({}) };
  },
  addProseMirrorPlugins() {
    const getSnippets = this.options.getSnippets;
    const getVariables = this.options.getVariables;
    return [
      Suggestion<SlashCommand>({
        editor: this.editor,
        char: "/",
        pluginKey: new PluginKey("slashCommand"),
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query }) =>
          filterCommands(query, getSnippets(), getVariables),
        render: makeRender(),
      }),
    ];
  },
});
