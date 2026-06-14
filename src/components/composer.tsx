import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  LinkIcon,
  PaperclipIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { toast } from "sonner";

import { useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/account";
import {
  deleteDraft,
  saveDraft,
  sendNewEmail,
  useContactsQuery,
  useFullEmailQuery,
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
  initialDraft,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  initialDraft?: { to?: string; subject?: string; body?: string };
  /** Open an existing draft for editing — its fields are loaded and seeded. */
  draft?: { accountId: string; emailId: string } | null;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  // Any inbox with an address can be the From. Test/demo accounts are included
  // so the picker shows them — sending from one is a sealed no-op (see `send`).
  const sendable = useMemo(() => accounts.filter((a) => a.email), [accounts]);

  const [fromId, setFromId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the draft being edited (no-op query when not editing a draft).
  const draftEmail = useFullEmailQuery(
    draft?.accountId ?? "",
    draft?.emailId ?? null,
  ).data;

  /* Start from a clean slate each time the composer opens. */
  useEffect(() => {
    if (!open) return;
    setFromId(draft?.accountId ?? null);
    setTo(initialDraft?.to ?? "");
    setSubject(initialDraft?.subject ?? "");
    // The body is the rich editor's HTML; a seeded draft (e.g. a forward) is
    // plain text, so escape it and keep its line breaks.
    setBody(initialDraft?.body ? plainToHtml(initialDraft.body) : "");
    setError(null);
    setSending(false);
  }, [open, initialDraft, draft]);

  // Seed the fields once the edited draft loads (arrives after the open reset).
  useEffect(() => {
    if (!open || !draft || !draftEmail) return;
    setFromId(draft.accountId);
    setTo(draftEmail.to ?? "");
    setSubject(
      !draftEmail.subject || draftEmail.subject === "(no subject)"
        ? ""
        : draftEmail.subject,
    );
    setBody(
      draftEmail.bodyHtml ??
        (draftEmail.body ? plainToHtml(draftEmail.body) : ""),
    );
  }, [open, draft, draftEmail]);

  const from =
    sendable.find((a) => a.accountId === fromId) ??
    sendable.find((a) => a.email === session?.user.email) ??
    sendable[0] ??
    null;

  // People you've emailed before — feeds the To autocomplete.
  const contacts = useContactsQuery(from?.accountId, open).data ?? [];

  if (!open) return null;

  // Require at least one well-formed address (comma-separated allowed) before
  // Send is enabled — so "d" can't be sent.
  const recipientsValid = isValidRecipients(to);
  const canSend = !sending && from !== null && recipientsValid;

  const hasContent =
    to.trim().length > 0 || subject.trim().length > 0 || body.length > 0;

  const refreshDrafts = (accountId: string) => {
    queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
    // Drop the cached full-email so re-opening an edited draft shows new content.
    queryClient.invalidateQueries({ queryKey: ["email", accountId] });
  };

  const reset = () => {
    setTo("");
    setSubject("");
    setBody("");
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
        subject,
        body: "",
        html: body,
      });
      // A sent draft leaves the Drafts folder.
      if (draft) {
        await deleteDraft(from.accountId, draft.emailId);
        refreshDrafts(from.accountId);
      }
      if (sandbox) {
        toast("Demo — message not sent", {
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
      className="fixed right-5 bottom-5 z-40 flex w-[520px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-input bg-secondary shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b bg-popover px-3.5 py-[11px]">
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold">
          {draft ? "Edit draft" : "New message"}
        </span>
        <Hint label="Close — saves to drafts">
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
                  onClick={() => setFromId(account.accountId)}
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

      <div className="flex h-10 items-center gap-2.5 border-b px-4">
        <FieldLabel>To</FieldLabel>
        <RecipientField value={to} onChange={setTo} contacts={contacts} />
      </div>

      <div className="flex h-10 items-center gap-2.5 border-b px-4">
        <FieldLabel>Subject</FieldLabel>
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Subject"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      <div className="px-3.5 py-3">
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="Write your message…"
          minHeight={200}
        />
      </div>

      <footer className="flex items-center gap-2 border-t px-3.5 py-[11px]">
        <Button size="sm" disabled={!canSend} onClick={() => void send()}>
          <SendIcon data-icon="inline-start" />
          {sending ? "Sending…" : "Send"}
        </Button>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </KbdGroup>
        {!error && to.trim().length > 0 && !recipientsValid && (
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
            icon={PaperclipIcon}
            title="Attachments — soon"
            disabled
          />
          <FooterIcon icon={CodeIcon} title="Code block — soon" disabled />
          <FooterIcon icon={LinkIcon} title="Link — soon" disabled />
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
function plainToHtml(text: string): string {
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

/** To field with Gmail-style autocomplete: the last comma-separated token is
 *  matched against people you've emailed; pick one to fill it in. */
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

  const lastComma = value.lastIndexOf(",");
  const prefix = value.slice(0, lastComma + 1); // "" or "a@b.com,"
  const token = value
    .slice(lastComma + 1)
    .trim()
    .toLowerCase();

  const chosen = new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
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
    onChange(`${prefix ? `${prefix} ` : ""}${contact.email}, `);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!show) return;
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
        }}
        placeholder="name@domain.dev"
        className="w-full bg-transparent font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/60"
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
}: {
  icon: typeof PaperclipIcon;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Hint label={title}>
      {/* aria-disabled (not `disabled`) so the button still receives hover and
          the tooltip fires; the click is guarded instead. */}
      <button
        type="button"
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground",
          disabled
            ? "cursor-default opacity-40"
            : "cursor-pointer hover:bg-popover hover:text-foreground",
        )}
      >
        <Icon className="size-[15px]" />
      </button>
    </Hint>
  );
}
