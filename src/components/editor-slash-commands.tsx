import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
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
  CalendarIcon,
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

import { insertSnippet } from "@/components/editor-fill-fields";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Notion-style `/` command menu for the composer. One registry backs it: built-in
 * formatting commands (`/h1`, `/code`, lists…) plus saved snippets (`/ty` → text).
 * Add a command by pushing onto STATIC_COMMANDS or surfacing a source like snippets.
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

/** Built-in formatting commands. Each clears the typed `/query`, then applies its block. */
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
  {
    id: "date",
    title: "Date",
    subtitle: "Pick a date inline",
    keywords: ["date", "calendar", "day", "when", "schedule"],
    group: "Basic blocks",
    icon: CalendarIcon,
    run: (e, r) =>
      e
        .chain()
        .focus()
        .deleteRange(r)
        .insertContent({ type: "dateField", attrs: { value: "" } })
        .run(),
  },
];

/** Saved snippets → commands. Each becomes `/trigger` and inserts its content,
 *  resolving `{{variables}}`, `{{cursor}}`, and tab-stop `{{fields}}` (see
 *  insertSnippet). Variables are pulled fresh at run time. */
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

type SlashMenuRef = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const GROUPS: SlashCommand["group"][] = ["Basic blocks", "Snippets"];

const SlashMenuList = forwardRef<
  SlashMenuRef,
  { items: SlashCommand[]; command: (item: SlashCommand) => void }
>(({ items, command }, ref) => {
  // The editor keeps focus, so cmdk can't read keys itself — Tiptap's suggestion
  // keymap drives cmdk's selection via the controlled `value`.
  const [value, setValue] = useState(items[0]?.id ?? "");
  const listRef = useRef<HTMLDivElement>(null);

  // Reset the highlight whenever the filtered set changes.
  useEffect(() => setValue(items[0]?.id ?? ""), [items]);
  // Keep the selected row fully visible. cmdk's own scroll undershoots by a row,
  // so after layout (rAF) we nudge scrollTop just enough to bring it in-view.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || !value) return;
      const el = list.querySelector<HTMLElement>(
        `[data-cmd-id="${CSS.escape(value)}"]`,
      );
      if (!el) return;
      const lr = list.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const pad = 6;
      if (er.top < lr.top + pad) list.scrollTop -= lr.top + pad - er.top;
      else if (er.bottom > lr.bottom - pad)
        list.scrollTop += er.bottom - (lr.bottom - pad);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const move = (delta: number) => {
    const i = Math.max(
      0,
      items.findIndex((c) => c.id === value),
    );
    const next = items[Math.min(items.length - 1, Math.max(0, i + delta))];
    if (next) setValue(next.id);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `move` closes over items/value, both already deps — listing it would rebuild the handle every render for no gain.
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowDown") {
          move(1);
          return true;
        }
        if (event.key === "ArrowUp") {
          move(-1);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items.find((c) => c.id === value);
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, value, command],
  );

  return (
    <Command
      shouldFilter={false}
      value={value}
      onValueChange={setValue}
      // Editor keeps focus — don't let a menu click blur it (closes the popup
      // before onSelect fires).
      onMouseDown={(e) => e.preventDefault()}
      className="h-auto w-72 max-w-[calc(100vw-1rem)] border shadow-xl ring-1 ring-foreground/10"
    >
      <CommandList ref={listRef}>
        <CommandEmpty className="px-2 py-3 text-left text-[12px] text-muted-foreground">
          No matches
        </CommandEmpty>
        {GROUPS.map((group) => {
          const groupItems = items.filter((c) => c.group === group);
          if (groupItems.length === 0) return null;
          return (
            <CommandGroup
              key={group}
              heading={group}
              className="**:[[cmdk-group-heading]]:px-1.5 **:[[cmdk-group-heading]]:pt-1.5 **:[[cmdk-group-heading]]:pb-0.5 **:[[cmdk-group-heading]]:font-mono **:[[cmdk-group-heading]]:text-[9.5px] **:[[cmdk-group-heading]]:tracking-[0.5px] **:[[cmdk-group-heading]]:text-muted-foreground/60 **:[[cmdk-group-heading]]:uppercase"
            >
              {groupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    data-cmd-id={item.id}
                    onSelect={() => command(item)}
                    className="gap-2 px-2 py-1.5 text-[13px]"
                  >
                    <Icon className="text-muted-foreground" />
                    {item.group === "Snippets" ? (
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink-0 font-mono text-[11.5px] text-primary">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground/55">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flex-1 truncate">{item.title}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </Command>
  );
});
SlashMenuList.displayName = "SlashMenuList";

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
        // Above the composer dialog: it mounts to body, so clear the dialog (z-50) entirely.
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

/** The editor extension. `getSnippets` lets the menu show current snippets
 *  without recreating the editor. */
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
