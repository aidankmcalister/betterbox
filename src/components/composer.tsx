import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  EyeIcon,
  GripVerticalIcon,
  PaperclipIcon,
  PencilIcon,
  PenLineIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import DOMPurify from "dompurify";
import { toast } from "sonner";

import type { Editor } from "@tiptap/react";
import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/account";
import {
  deleteDraft,
  saveDraft,
  sendNewEmail,
  useContactsQuery,
  type Contact,
} from "@/lib/mail-queries";
import { isTestAccount } from "@/lib/test-account";
import { AccountDot } from "@/components/account-dot";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const shortName = (email: string) => email.split("@")[0] || email;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Threading headers that nest a sent message under an existing conversation
 *  (set by reply / reply-all; null for a fresh compose). */
export type ReplyContext = {
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

/** The composer's editable fields. Lifted to the parent (AppShell) so they
 *  persist when the composer remounts — switching pane↔popout, or navigating to
 *  a page where the board (and its compose pane) isn't mounted. */
export type ComposerContent = {
  fromId: string | null;
  to: string;
  cc: string;
  subject: string;
  body: string;
  /** Present when the composer was opened as a reply-all (threads the send). */
  reply: ReplyContext | null;
};

/** True when `value` is one or more comma-separated, well-formed addresses. */
function isValidRecipients(value: string): boolean {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => EMAIL_RE.test(part));
}

/**
 * Docked composer for a new message (design: fixed bottom-right panel, not a
 * Dialog). Field rows are borderless — plain inputs, label column 44px,
 * mono To / sans Subject (font spec), ⌘↵ sends. Replies happen inline in the
 * reader, not here.
 */
export function Composer({
  open,
  onOpenChange,
  accounts,
  content,
  onContentChange,
  draft,
  inPane = false,
  onHeaderPointerDown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Editable fields, owned by the parent so they survive the composer
   *  remounting (e.g. swapping between the board pane and the popout). */
  content: ComposerContent;
  onContentChange: (patch: Partial<ComposerContent>) => void;
  /** Open an existing draft for editing — the parent seeds `content`. */
  draft?: { accountId: string; emailId: string } | null;
  /** Render to fill a tile (pane mode) instead of the floating popout. */
  inPane?: boolean;
  /** In pane mode, makes the header a drag handle for the tile board. */
  onHeaderPointerDown?: (event: React.PointerEvent) => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { defaultSendFrom } = useSettings();
  // Any inbox with an address can be the From. Test/demo accounts are included
  // so the picker shows them — sending from one is a sealed no-op (see `send`).
  const sendable = useMemo(() => accounts.filter((a) => a.email), [accounts]);

  const { fromId, to, cc, subject, body, reply } = content;
  // Cc starts hidden for a fresh compose; reply-all seeds cc, so reveal it then.
  const [ccShown, setCcShown] = useState(false);
  const showCc = ccShown || cc.trim().length > 0;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preview renders the body as the recipient sees it (rich text → HTML).
  const [preview, setPreview] = useState(false);
  // The live editor instance, so the footer code-block button can drive it.
  const [editor, setEditor] = useState<Editor | null>(null);
  // Re-render on editor transactions so the code-block button's active state
  // (below) tracks the selection without the editor owning the footer.
  const [, bumpEditorState] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", bumpEditorState);
    return () => {
      editor.off("transaction", bumpEditorState);
    };
  }, [editor]);

  // From: an explicit pick (fromId) wins; otherwise the configured default
  // send-from account, then the primary inbox, then the first sendable one.
  const from =
    sendable.find((a) => a.accountId === fromId) ??
    sendable.find((a) => a.accountId === defaultSendFrom) ??
    sendable.find((a) => a.email === session?.user.email) ??
    sendable[0] ??
    null;

  // People you've emailed before — feeds the To autocomplete.
  const contacts = useContactsQuery(from?.accountId, open).data ?? [];

  if (!open) return null;

  // Require at least one well-formed address (comma-separated allowed) before
  // Send is enabled — so "d" can't be sent. Cc is optional but, when present,
  // must be valid too.
  const recipientsValid = isValidRecipients(to);
  const ccValid = cc.trim().length === 0 || isValidRecipients(cc);
  const canSend = !sending && from !== null && recipientsValid && ccValid;

  const hasContent =
    to.trim().length > 0 || subject.trim().length > 0 || body.length > 0;

  const refreshDrafts = (accountId: string) => {
    queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
    // Drop the cached full-email so re-opening an edited draft shows new content.
    queryClient.invalidateQueries({ queryKey: ["email", accountId] });
  };

  const reset = () => {
    onContentChange({
      fromId: null,
      to: "",
      cc: "",
      subject: "",
      body: "",
      reply: null,
    });
    setCcShown(false);
    setError(null);
    setSending(false);
    setPreview(false);
    onOpenChange(false);
  };

  // Closing keeps your work: save the current content as a draft (or update the
  // one being edited). Empty composers don't create a draft.
  const close = () => {
    if (from && hasContent) {
      void saveDraft({
        accountId: from.accountId,
        id: draft?.emailId,
        to: to.trim(),
        subject,
        html: body,
      }).then(() => refreshDrafts(from.accountId));
      if (isTestAccount(from.accountId)) toast("Saved to drafts");
    }
    reset();
  };

  // Discard throws the message away — and removes the draft if we were editing
  // one (so it doesn't linger in the Drafts folder).
  const discard = () => {
    if (draft && from) {
      void deleteDraft(from.accountId, draft.emailId).then(() =>
        refreshDrafts(from.accountId),
      );
      if (isTestAccount(from.accountId)) toast("Draft discarded");
    }
    reset();
  };

  const send = async () => {
    if (!canSend || !from) return;
    setSending(true);
    setError(null);
    const sandbox = isTestAccount(from.accountId);
    try {
      await sendNewEmail({
        accountId: from.accountId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject,
        body: "",
        html: body,
        inReplyTo: reply?.inReplyTo,
        references: reply?.references,
        threadId: reply?.threadId,
      });
      // A sent draft leaves the Drafts folder.
      if (draft) {
        await deleteDraft(from.accountId, draft.emailId);
        refreshDrafts(from.accountId);
      }
      if (sandbox) {
        toast("Demo: message not sent", {
          description: "This is a sandbox. Nothing actually left BetterBox.",
        });
      } else {
        toast.success("Message sent", { description: `To ${to.trim()}` });
      }
      setSending(false);
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error("Couldn’t send message", { description: message });
      setSending(false);
    }
  };

  return (
    <section
      aria-label="New message"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void send();
        }
        if (event.key === "Escape" && !sending) close();
      }}
      className={cn(
        "flex flex-col overflow-hidden bg-secondary",
        inPane
          ? "h-full w-full"
          : // Full-screen on phones; the floating bottom-right popout on sm+.
            "fixed inset-0 z-50 w-full rounded-none border-0 sm:inset-auto sm:right-5 sm:bottom-5 sm:z-40 sm:w-[520px] sm:max-w-[calc(100vw-2.5rem)] sm:rounded-xl sm:border sm:border-input sm:shadow-2xl",
      )}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        className={cn(
          "flex items-center gap-2 border-b bg-popover",
          // Match the account/reader pane header height (h-9) in pane mode.
          inPane ? "h-9 px-2.5" : "px-3.5 py-[11px]",
          onHeaderPointerDown &&
            "cursor-grab touch-none select-none active:cursor-grabbing",
        )}
      >
        {onHeaderPointerDown && (
          <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        )}
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold">
          {draft ? "Edit draft" : "New message"}
        </span>
        <Hint label="Close, saves to drafts">
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-[15px]" />
          </button>
        </Hint>
      </header>

      <div className="flex h-[42px] items-center gap-2.5 border-b px-4">
        <FieldLabel>From</FieldLabel>
        {from ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-[7px] border bg-card px-2.5 py-1 hover:bg-muted">
              <AccountDot
                colorIndex={accounts.findIndex(
                  (a) => a.accountId === from.accountId,
                )}
                accountId={from.accountId}
              />
              <span className="shrink-0 text-[13px]">
                {shortName(from.email)}
              </span>
              <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                {from.email}
              </span>
              <ChevronDownIcon className="size-[13px] shrink-0 text-muted-foreground/70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {sendable.map((account) => (
                <DropdownMenuItem
                  key={account.accountId}
                  onClick={() => onContentChange({ fromId: account.accountId })}
                >
                  <AccountDot
                    colorIndex={accounts.findIndex(
                      (a) => a.accountId === account.accountId,
                    )}
                    accountId={account.accountId}
                  />
                  <span className="shrink-0 text-[13px]">
                    {shortName(account.email)}
                  </span>
                  <span className="ml-auto truncate font-mono text-[11.5px] text-muted-foreground">
                    {account.email}
                  </span>
                  {account.accountId === from.accountId && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-xs text-muted-foreground">
            No sendable account linked
          </span>
        )}
      </div>

      <div className="flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5">
        <FieldLabel>To</FieldLabel>
        <RecipientField
          value={to}
          onChange={(next) => onContentChange({ to: next })}
          contacts={contacts}
        />
        {!showCc && (
          <button
            type="button"
            onClick={() => setCcShown(true)}
            className="shrink-0 cursor-pointer rounded px-1 text-[12px] text-muted-foreground/70 hover:text-foreground"
          >
            Cc
          </button>
        )}
      </div>

      {showCc && (
        <div className="flex min-h-10 items-center gap-2.5 border-b px-4 py-1.5">
          <FieldLabel>Cc</FieldLabel>
          <RecipientField
            value={cc}
            onChange={(next) => onContentChange({ cc: next })}
            contacts={contacts}
          />
        </div>
      )}

      <div className="flex h-10 items-center gap-2.5 border-b px-4">
        <FieldLabel>Subject</FieldLabel>
        <input
          value={subject}
          onChange={(event) => onContentChange({ subject: event.target.value })}
          placeholder="Subject"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div
        className={cn(
          // Pane + full-screen mobile: editor grows to fill. Desktop popout
          // (sm+): content-sized, as before.
          inPane
            ? "flex min-h-0 flex-1 flex-col"
            : "flex min-h-0 flex-1 flex-col sm:block sm:flex-none",
          preview && "overflow-y-auto",
        )}
      >
        {preview ? (
          <PreviewBody html={body} minHeight={inPane ? 320 : 200} />
        ) : (
          <RichTextEditor
            value={body}
            onChange={(next) => onContentChange({ body: next })}
            onEditorReady={setEditor}
            placeholder="Write your message…"
            minHeight={inPane ? 320 : 200}
            // The editor fills edge-to-edge in both modes — drop the rounded
            // border so it isn't an inset box (the rows divide it instead).
            // Fills the full height in pane + full-screen mobile; content-sized
            // in the desktop popout.
            className={cn(
              "rounded-none border-0",
              inPane ? "h-full" : "h-full sm:h-auto",
            )}
          />
        )}
      </div>

      <footer className="flex items-center gap-2 border-t px-3.5 pt-[11px] pb-[max(11px,env(safe-area-inset-bottom))] sm:pb-[11px]">
        <Button size="sm" disabled={!canSend} onClick={() => void send()}>
          <SendIcon data-icon="inline-start" />
          {sending ? "Sending…" : "Send"}
        </Button>
        <KbdGroup className="hidden sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
        {!error &&
          ((to.trim().length > 0 && !recipientsValid) || !ccValid) && (
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground/70">
              Enter a valid email address
            </span>
          )}
        {error && (
          <span className="min-w-0 truncate font-mono text-[11px] text-label-red">
            {error}
          </span>
        )}
        <span className="ml-auto inline-flex gap-0.5">
          <FooterIcon
            icon={preview ? PenLineIcon : EyeIcon}
            title={preview ? "Back to editing" : "Preview"}
            active={preview}
            onClick={() => setPreview((p) => !p)}
          />
          <FooterIcon
            icon={PaperclipIcon}
            title="Attachments (soon)"
            disabled
            className="hidden sm:inline-flex"
          />
          <FooterIcon
            icon={CodeIcon}
            title="Code block"
            disabled={!editor || preview}
            active={editor?.isActive("codeBlock") ?? false}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            className="hidden sm:inline-flex"
          />
          <FooterIcon
            icon={Trash2Icon}
            title={draft ? "Delete draft" : "Discard"}
            onClick={discard}
          />
        </span>
      </footer>
    </section>
  );
}

/** Escape a plain-text draft and preserve its line breaks so it seeds the rich
 *  editor (which treats its content as HTML) without dropping `<addr>` or runs. */
export function plainToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .join("<br>");
}

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="w-11 shrink-0 text-[12.5px] text-muted-foreground/70">
      {children}
    </span>
  );
}

/** To field with Gmail-style chips + autocomplete. Committed recipients render
 *  as bordered pills (echoing the From box); the trailing token stays editable.
 *  The value stays a comma-separated string so send/save/validation are unchanged. */
function RecipientField({
  value,
  onChange,
  contacts,
}: {
  value: string;
  onChange: (value: string) => void;
  contacts: Contact[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Everything before the last comma is committed (chips); the rest is the
  // token still being typed. A comma in the input naturally promotes a chip.
  const parts = value.split(",");
  const draft = (parts[parts.length - 1] ?? "").replace(/^\s+/, "");
  const chips = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);

  const commit = (nextChips: string[], nextDraft: string) => {
    const head = nextChips.length ? `${nextChips.join(", ")}, ` : "";
    onChange(head + nextDraft);
  };
  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed) commit([...chips, trimmed], "");
  };

  const token = draft.trim().toLowerCase();
  const chosen = new Set(chips.map((c) => c.toLowerCase()));
  const matches =
    token.length === 0
      ? []
      : contacts
          .filter(
            (c) =>
              !chosen.has(c.email.toLowerCase()) &&
              (c.email.toLowerCase().includes(token) ||
                c.name.toLowerCase().includes(token)),
          )
          .slice(0, 6);
  const show = open && matches.length > 0;

  const choose = (contact: Contact) => {
    commit([...chips, contact.email], "");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => {
        const valid = EMAIL_RE.test(chip);
        return (
          <span
            key={`${chip}-${i}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-[7px] border bg-card py-0.5 pr-1 pl-2",
              !valid && "border-label-red/40 text-label-red",
            )}
          >
            <span className="truncate font-mono text-[12px]">{chip}</span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Remove ${chip}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                commit(
                  chips.filter((_, idx) => idx !== i),
                  draft,
                )
              }
              className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={draft}
        onChange={(event) => {
          commit(chips, event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Backspace" && draft === "" && chips.length) {
            event.preventDefault();
            commit(chips.slice(0, -1), "");
            return;
          }
          if (show) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (
              (event.key === "Enter" || event.key === "Tab") &&
              !event.metaKey &&
              !event.ctrlKey
            ) {
              event.preventDefault();
              event.stopPropagation();
              choose(matches[active]);
            } else if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
          } else if (
            event.key === "Enter" &&
            draft.trim() &&
            !event.metaKey &&
            !event.ctrlKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            commitDraft();
          }
        }}
        placeholder={chips.length ? "" : "name@domain.dev"}
        className="min-w-[120px] flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/60"
      />
      {show && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 overflow-hidden rounded-lg border bg-popover p-1 shadow-xl ring-1 ring-foreground/10">
          {matches.map((contact, i) => (
            <button
              key={contact.email}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(contact)}
              className={cn(
                "flex w-full flex-col rounded-md px-2 py-1.5 text-left",
                i === active ? "bg-accent text-accent-foreground" : "",
              )}
            >
              {contact.name && (
                <span className="truncate text-[12.5px]">{contact.name}</span>
              )}
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {contact.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FooterIcon({
  icon: Icon,
  title,
  onClick,
  disabled = false,
  active = false,
  className,
}: {
  icon: typeof PaperclipIcon;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <Hint label={title}>
      {/* aria-disabled (not `disabled`) so the button still receives hover and
          the tooltip fires; the click is guarded instead. */}
      <button
        type="button"
        aria-disabled={disabled}
        aria-pressed={active}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground",
          disabled
            ? "cursor-default opacity-40"
            : "cursor-pointer hover:bg-popover hover:text-foreground",
          active && "bg-popover text-foreground",
          className,
        )}
      >
        <Icon className="size-[15px]" />
      </button>
    </Hint>
  );
}

/** Read-only render of the message body — how the recipient will see it. Uses
 *  the same prose styles as the editor, sanitized (the HTML is our own TipTap
 *  output, but a pasted/typed link could carry a javascript: href). */
function PreviewBody({ html, minHeight }: { html: string; minHeight: number }) {
  if (!html) {
    return (
      <div
        className="px-3.5 py-3 text-[13px] text-muted-foreground/60"
        style={{ minHeight }}
      >
        Nothing to preview yet. Write a message first.
      </div>
    );
  }
  const clean = typeof window === "undefined" ? "" : DOMPurify.sanitize(html);
  return (
    <div
      className="tiptap prose-email max-w-none px-3.5 py-3 text-[13px] leading-[1.6] text-foreground"
      style={{ minHeight }}
      // Sanitized just above.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
