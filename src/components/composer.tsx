import { useEffect, useMemo, useState } from "react";
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

import { useSession } from "@/lib/auth-client";
import type { Account } from "@/lib/account";
import { sendNewEmail } from "@/lib/mail-queries";
import { isTestAccount } from "@/lib/test-account";
import { AccountDot } from "@/components/account-dot";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const shortName = (email: string) => email.split("@")[0] || email;

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  initialDraft?: { to?: string; subject?: string; body?: string };
}) {
  const { data: session } = useSession();
  const sendable = useMemo(
    () => accounts.filter((a) => !isTestAccount(a.accountId) && a.email),
    [accounts],
  );

  const [fromId, setFromId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Start from a clean slate each time the composer opens. */
  useEffect(() => {
    if (!open) return;
    setFromId(null);
    setTo(initialDraft?.to ?? "");
    setSubject(initialDraft?.subject ?? "");
    // The body is the rich editor's HTML; a seeded draft (e.g. a forward) is
    // plain text, so escape it and keep its line breaks.
    setBody(initialDraft?.body ? plainToHtml(initialDraft.body) : "");
    setError(null);
  }, [open, initialDraft]);

  const from =
    sendable.find((a) => a.accountId === fromId) ??
    sendable.find((a) => a.email === session?.user.email) ??
    sendable[0] ??
    null;

  if (!open) return null;

  const canSend = !sending && from !== null && to.trim().length > 0;

  const discard = () => {
    setTo("");
    setSubject("");
    setBody("");
    onOpenChange(false);
  };

  const send = async () => {
    if (!canSend || !from) return;
    setSending(true);
    setError(null);
    try {
      await sendNewEmail({
        accountId: from.accountId,
        to: to.trim(),
        subject,
        body: "",
        html: body,
      });
      discard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        if (event.key === "Escape" && !sending) onOpenChange(false);
      }}
      className="fixed right-5 bottom-5 z-40 flex w-[520px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-input bg-secondary shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b bg-popover px-3.5 py-[11px]">
        <PencilIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[13.5px] font-semibold">New message</span>
        <Hint label="Close composer">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
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
        <input
          autoFocus
          type="email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="name@domain.dev"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none placeholder:text-muted-foreground/60"
        />
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
        <span className="font-mono text-[11px] text-muted-foreground/70">
          ⌘↵
        </span>
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
          <FooterIcon icon={Trash2Icon} title="Discard" onClick={discard} />
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
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-popover hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Icon className="size-[15px]" />
      </button>
    </Hint>
  );
}
