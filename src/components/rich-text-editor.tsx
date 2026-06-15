import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  LinkIcon,
  Undo2Icon,
  Redo2Icon,
} from "lucide-react";

import { Hint } from "@/components/ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * Reusable rich-text editor for compose + reply. Tiptap (ProseMirror) under the
 * hood: markdown shortcuts (**bold**, *italic*, `code`, # heading, - list,
 * > quote, 1. list) plus a small toolbar. Emits HTML via onChange; an empty
 * document reports "" so callers can treat it as blank.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write something…",
  onSubmit,
  onEditorReady,
  autoFocus = false,
  minHeight = 120,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Cmd/Ctrl+Enter handler (e.g. send). */
  onSubmit?: () => void;
  /** Hands the live editor instance up so callers can drive it (e.g. a footer
   *  control that toggles a code block). Receives null when the editor unmounts. */
  onEditorReady?: (editor: Editor | null) => void;
  autoFocus?: boolean;
  minHeight?: number;
  className?: string;
}) {
  const editor = useEditor({
    // TanStack Start renders on the server; defer to the client to avoid
    // hydration mismatches.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap prose-email max-w-none px-3.5 py-3 text-[13px] leading-[1.6] text-foreground outline-none",
        ),
        style: `min-height:${minHeight}px`,
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter" &&
          onSubmit
        ) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  // Keep the editor in sync when the caller resets it (e.g. after sending, or
  // switching the message being replied to). Only re-sync external changes when
  // the editor isn't focused: syncing mid-typing replaces the doc and interrupts
  // input rules (e.g. "# " → heading would silently fail "sometimes"). While
  // focused the editor is the source of truth; the controlled value catches up.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Publish the editor instance to the caller (and clear it on unmount).
  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-background focus-within:border-ring/60",
        className,
      )}
    >
      <Toolbar editor={editor} />
      {/* flex-1 so the editable surface fills the box's height when the parent
          gives it one (compose pane / full-screen mobile composer). */}
      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 overflow-y-auto [&_.tiptap]:min-h-full"
      />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
      <Btn
        label="Bold"
        keys={["⌘", "B"]}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon />
      </Btn>
      <Btn
        label="Italic"
        keys={["⌘", "I"]}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </Btn>
      <Btn
        label="Strikethrough"
        keys={["⌘", "⇧", "S"]}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon />
      </Btn>
      <Btn
        label="Inline code"
        keys={["⌘", "E"]}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon />
      </Btn>
      <Divider />
      <Btn
        label="Bullet list"
        keys={["⌘", "⇧", "8"]}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon />
      </Btn>
      <Btn
        label="Numbered list"
        keys={["⌘", "⇧", "7"]}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrderedIcon />
      </Btn>
      <Btn
        label="Quote"
        keys={["⌘", "⇧", "B"]}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <QuoteIcon />
      </Btn>
      <Btn label="Link" active={editor.isActive("link")} onClick={setLink}>
        <LinkIcon />
      </Btn>
      <Divider />
      <Btn
        label="Undo"
        keys={["⌘", "Z"]}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2Icon />
      </Btn>
      <Btn
        label="Redo"
        keys={["⌘", "⇧", "Z"]}
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2Icon />
      </Btn>
    </div>
  );
}

function Btn({
  label,
  keys,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  /** Mac keyboard shortcut, shown as chips in the tooltip. */
  keys?: string[];
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const hint = keys ? (
    <>
      {label}
      <KbdGroup>
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </KbdGroup>
    </>
  ) : (
    label
  );
  return (
    <Hint label={hint}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[15px]",
          active && "bg-muted text-foreground",
        )}
      >
        {children}
      </button>
    </Hint>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" />;
}
