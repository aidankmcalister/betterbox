import { useEffect, useRef, useState } from "react";
import {
  ArchiveIcon,
  BracesIcon,
  CheckIcon,
  ClipboardIcon,
  CodeXmlIcon,
  FileTextIcon,
  ForwardIcon,
  GripVerticalIcon,
  HashIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  ReplyAllIcon,
  ReplyIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { linkGoogle } from "@/lib/auth/auth-client";
import { isTestAccount } from "@/lib/test-account";
import { exportEmail } from "@/lib/email/export-email";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountsQueryKey,
  actOnEmail,
  emailsQueryKey,
  markEmailsRead,
  sendNewEmail,
  useFullEmailQuery,
  useRawEmailQuery,
  useThreadQuery,
  type EmailsData,
  type FullEmail,
  type MessageAction,
} from "@/lib/mail-queries";
import { MARK_READ_MS, useSettings } from "@/hooks/use-settings";
import { useSnippetMap } from "@/hooks/use-snippets";
import {
  appendSignature,
  appendSignatureHtml,
  resolveAccountSignature,
  useGmailSignatureQuery,
  useSignaturesQuery,
} from "@/hooks/use-signatures";
import { useTileDrag } from "@/components/tile-board";
import { toast } from "sonner";
import {
  AppliedTags,
  TagPicker,
  useTagActions,
} from "@/components/mail/tag-picker";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useAccountColor } from "@/components/shell/account-dot";
import { HtmlBody } from "@/components/mail/html-body";
import { RawView } from "@/components/mail/raw-view";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Hint } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/mail/thread-list-states";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTiles } from "../tiles-context";
import { BAR_ICON, BAR_PRIMARY, BAR_SEC } from "../pane-chrome";
import { parseAddress, quotedReplyHtml, splitAddresses } from "../email-html";
import { ThreadMessage } from "./reader-message";

export function ReaderPane({
  paneId,
  accountId,
  emailId,
  onClose,
}: {
  paneId: string;
  accountId: string;
  emailId: string | null;
  onClose: () => void;
}) {
  const { accounts, folderFor } = useTiles();
  const folder = folderFor(accountId);
  const beginHeaderDrag = useTileDrag();
  const { clock, markRead, rawByDefault } = useSettings();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(rawByDefault);
  // Measure width so the action bar can collapse on a narrow pane (reply-all/forward fold into overflow).
  const paneRef = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setNarrow(entries[0].contentRect.width < 560),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [busy, setBusy] = useState(false);
  const [starred, setStarred] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  // Snippets / slash commands in the reply editor (fetched only while replying).
  const replySnippets = useSnippetMap(replyOpen, accountId);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);

  // Signature: read-only block below the reply editor, appended to outgoing HTML on send unless removed.
  const sigData = useSignaturesQuery(replyOpen, accountId).data;
  const dbSig = resolveAccountSignature(sigData, accountId);
  const replyEmail = accounts.find((a) => a.accountId === accountId)?.email;
  const gmailSig =
    useGmailSignatureQuery(accountId, replyEmail, replyOpen).data ?? "";
  const useGmailSig = gmailSig.length > 0;
  const [signatureSkipped, setSignatureSkipped] = useState(false);
  useEffect(() => {
    if (replyOpen) setSignatureSkipped(false);
  }, [replyOpen]);
  const showSignature = (useGmailSig || dbSig !== null) && !signatureSkipped;
  const replyOutgoingHtml = !showSignature
    ? replyBody
    : useGmailSig
      ? appendSignatureHtml(replyBody, gmailSig)
      : dbSig
        ? appendSignature(replyBody, dbSig.body)
        : replyBody;
  const [replySent, setReplySent] = useState(false);
  const replyRef = useRef<HTMLDivElement>(null);

  const fullQuery = useFullEmailQuery(accountId, emailId);
  const rawQuery = useRawEmailQuery(accountId, emailId, raw);

  const email = fullQuery.data;
  const dotIndex = accounts.findIndex((a) => a.accountId === accountId);
  const accountColor = useAccountColor(Math.max(dotIndex, 0), accountId);
  const sender = email ? parseAddress(email.from) : null;

  const tags = useTagActions(accountId, email);

  const threadQuery = useThreadQuery(accountId, email?.threadId);
  const thread = threadQuery.data;
  const messages = thread && thread.length > 0 ? thread : email ? [email] : [];
  const lastMessage = messages[messages.length - 1];
  const replySender = lastMessage ? parseAddress(lastMessage.from) : sender;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync the local star state only when the open message changes.
  useEffect(
    () => setStarred(email?.starred ?? false),
    [email?.id, email?.starred],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the reply box whenever the open message changes (email.id is the trigger).
  useEffect(() => {
    setReplyOpen(false);
    setReplyBody("");
    setReplySent(false);
  }, [email?.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute the expanded set when the thread/message changes; emailId is read fresh.
  useEffect(() => {
    if (messages.length === 0) return;
    const ids = new Set<string>();
    if (emailId) ids.add(emailId);
    ids.add(messages[messages.length - 1].id);
    setExpandedIds(ids);
  }, [email?.threadId, thread]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the mark-read timer should only re-arm on the listed inputs; queryClient/folder are stable refs.
  useEffect(() => {
    if (!email?.unread) return;
    const delay = MARK_READ_MS[markRead];
    if (delay === null) return;
    const id = email.id;
    const timer = setTimeout(() => {
      markEmailsRead(accountId, [id]);
      queryClient.setQueryData<EmailsData>(
        emailsQueryKey(accountId, folder),
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              emails: page.emails.map((e) =>
                e.id === id ? { ...e, unread: false } : e,
              ),
            })),
          },
      );
      queryClient.setQueryData<FullEmail>(["email", accountId, id], (e) =>
        e ? { ...e, unread: false } : e,
      );
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    }, delay);
    return () => clearTimeout(timer);
  }, [email?.id, email?.unread, markRead, accountId]);

  const startReply = () => {
    if (!email) return;
    setReplySent(false);
    setReplyOpen(true);
    requestAnimationFrame(() =>
      replyRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      }),
    );
  };

  // Reply-all on the latest message: To = sender + To recipients, Cc = original
  // Cc (both minus our address and dupes). Opens the composer with threading headers.
  const startReplyAll = () => {
    const target = lastMessage;
    if (!target) return;
    const self = (
      accounts.find((a) => a.accountId === accountId)?.email ?? ""
    ).toLowerCase();
    const seen = new Set<string>();
    if (self) seen.add(self);
    const dedupe = (addresses: string[]) =>
      addresses.filter((address) => {
        const key = address.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const to = dedupe([
      parseAddress(target.from).address,
      ...splitAddresses(target.to ?? ""),
    ]);
    const cc = dedupe(splitAddresses(target.cc ?? ""));
    const subject = /^re:/i.test(target.subject)
      ? target.subject
      : `Re: ${target.subject}`;
    window.dispatchEvent(
      new CustomEvent("open-compose", {
        detail: {
          accountId,
          to: to.join(", "),
          cc: cc.join(", "),
          subject,
          html: quotedReplyHtml(target),
          reply: {
            inReplyTo: target.messageId || undefined,
            references:
              [target.references, target.messageId].filter(Boolean).join(" ") ||
              undefined,
            threadId: target.threadId || undefined,
          },
        },
      }),
    );
  };

  // Build a forward draft and open the composer. Used by the footer button and the start-forward event.
  const startForward = () => {
    if (!email) return;
    const fwdBody = `\n\n---- Forwarded message ----\nFrom: ${sender?.name ?? ""} <${sender?.address ?? ""}>\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.body || email.snippet || ""}`;
    window.dispatchEvent(
      new CustomEvent("open-compose", {
        detail: { to: "", subject: `Fwd: ${email.subject}`, body: fwdBody },
      }),
    );
  };

  const sendReply = async () => {
    const target = lastMessage;
    if (!target || !replySender || replySending || !replyBody.trim()) return;
    setReplySending(true);
    const sandbox = isTestAccount(accountId);
    try {
      await sendNewEmail({
        accountId,
        to: replySender.address,
        subject: /^re:/i.test(target.subject)
          ? target.subject
          : `Re: ${target.subject}`,
        body: "",
        html: replyOutgoingHtml,
        inReplyTo: target.messageId || undefined,
        references:
          [target.references, target.messageId].filter(Boolean).join(" ") ||
          undefined,
        threadId: target.threadId || undefined,
      });
      setReplyOpen(false);
      setReplyBody("");
      setReplySent(true);
      if (sandbox) {
        toast("Demo: reply not sent", {
          description: "This is a sandbox. Nothing actually left BetterBox.",
        });
      } else {
        toast.success("Reply sent", {
          description: `To ${replySender.address}`,
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["thread", accountId, target.threadId],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Couldn’t send reply", { description: message });
    } finally {
      setReplySending(false);
    }
  };

  const runAction = async (action: MessageAction) => {
    if (!email || busy) return;
    setBusy(true);
    const sandbox = isTestAccount(accountId);
    try {
      await actOnEmail(accountId, email.id, action);
      if (action === "star" || action === "unstar") {
        setStarred(action === "star");
        setBusy(false);
        return;
      }
      queryClient.setQueryData<EmailsData>(
        emailsQueryKey(accountId, folder),
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              emails: page.emails.filter((e) => e.id !== email.id),
            })),
          },
      );
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
      const label = action === "archive" ? "Archived" : "Moved to trash";
      toast(sandbox ? `Demo: ${label.toLowerCase()} in sandbox only` : label);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Action failed", { description: message });
      setBusy(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebind the reader key/event handlers only on the listed inputs; startReply/startForward close over current values.
  useEffect(() => {
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.closest("input, textarea, [contenteditable='true']") !== null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (replyOpen) setReplyOpen(false);
        else onClose();
        return;
      }
      if (typing(event.target) || event.metaKey || event.ctrlKey) return;
      if (event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setRaw((current) => !current);
        return;
      }
      if (
        typing(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      startReply();
    };
    document.addEventListener("keydown", onKey);

    const onStartReply = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as
        | { accountId?: string; emailId?: string }
        | undefined;
      if (!detail) return;
      if (detail.accountId !== accountId) return;
      if (detail.emailId && detail.emailId !== emailId) return;
      startReply();
    };
    const onStartForward = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as
        | { accountId?: string; emailId?: string }
        | undefined;
      if (!detail) return;
      if (detail.accountId !== accountId) return;
      if (detail.emailId && detail.emailId !== emailId) return;
      startForward();
    };

    window.addEventListener("start-reply", onStartReply);
    window.addEventListener("start-forward", onStartForward);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("start-reply", onStartReply);
      window.removeEventListener("start-forward", onStartForward);
    };
  }, [onClose, email, sender, replyOpen, emailId, accountId]);

  return (
    <div ref={paneRef} className="flex h-full min-w-0 flex-col bg-background">
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 items-center gap-[9px] border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
      >
        <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
        <MailOpenIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {email?.subject || "Reading"}
        </span>
        <TagPicker tags={tags} disabled={!email || busy} />
        <Hint label={starred ? "Unstar" : "Star"}>
          <button
            type="button"
            disabled={!email || busy}
            aria-pressed={starred}
            onClick={() => runAction(starred ? "unstar" : "star")}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent",
              starred
                ? "text-label-yellow hover:text-label-yellow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <StarIcon
              className="size-[15px]"
              fill={starred ? "currentColor" : "none"}
            />
          </button>
        </Hint>
        <span className="h-[18px] w-px shrink-0 bg-border" />
        <Hint label="Close (Esc)">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-[15px]" />
          </button>
        </Hint>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {raw ? (
          rawQuery.error ? (
            <ErrorState
              detail={`GET /api/message?format=raw · ${rawQuery.error.message}`}
              onRetry={() => rawQuery.refetch()}
              onReconnect={() => linkGoogle()}
            />
          ) : rawQuery.data === undefined ? (
            <div className="flex h-full items-center justify-center bg-term font-mono text-[11.5px] text-ink-subtle">
              messages.get · format=raw
            </div>
          ) : (
            <RawView mime={rawQuery.data} />
          )
        ) : fullQuery.error ? (
          <ErrorState
            detail={`GET /api/message · ${fullQuery.error.message}`}
            onRetry={() => fullQuery.refetch()}
            onReconnect={() => linkGoogle()}
          />
        ) : !email || !sender ? (
          <div className="mx-auto max-w-[720px] animate-pulse px-[34px] pt-[22px] pb-24">
            <div className="h-[26px] w-3/4 rounded bg-accent" />
            <div className="mt-3 border-b pb-4">
              <div className="flex items-start gap-3">
                <div className="size-9 shrink-0 rounded-full bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-28 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted/60" />
                    <div className="ml-auto h-3 w-24 rounded bg-muted/60" />
                  </div>
                  <div className="mt-2 h-3 w-32 rounded bg-muted/50" />
                </div>
              </div>
              <div className="flex flex-col gap-2.5 pt-[20px]">
                <div className="h-3.5 w-full rounded bg-muted" />
                <div className="h-3.5 w-[94%] rounded bg-muted" />
                <div className="h-3.5 w-[97%] rounded bg-muted" />
                <div className="h-3.5 w-[80%] rounded bg-muted" />
                <div className="mt-2 h-3.5 w-[90%] rounded bg-muted" />
                <div className="h-3.5 w-[96%] rounded bg-muted" />
                <div className="h-3.5 w-2/3 rounded bg-muted" />
              </div>
            </div>
          </div>
        ) : (
          <article
            className={cn(
              "mx-auto max-w-[720px] pb-10",
              // pt matches the subject→sender-card gap below (mt-5) so the hero
              // sits evenly between the pane header and the card.
              narrow ? "px-3 pt-5" : "px-4 pt-5",
            )}
          >
            <AppliedTags tags={tags} />
            <h1
              className={cn(
                "font-semibold tracking-[-0.6px]",
                tags.appliedTags.length > 0 && "mt-2",
                narrow
                  ? "text-[21px] leading-[1.22]"
                  : "text-[26px] leading-[1.2]",
              )}
            >
              {email.subject || "(no subject)"}
            </h1>
            {messages.length > 1 && (
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">
                {messages.length} messages
              </p>
            )}
            <div className="mt-5 flex flex-col gap-4">
              {messages.map((message) => (
                <ThreadMessage
                  key={message.id}
                  message={message}
                  accountId={accountId}
                  expanded={expandedIds.has(message.id)}
                  onToggle={() => toggleExpand(message.id)}
                  accountColor={accountColor}
                  hour12={clock === "12h"}
                  narrow={narrow}
                />
              ))}
            </div>

            <div ref={replyRef}>
              {replyOpen ? (
                <div className="mt-6 overflow-hidden rounded-xl border border-input bg-background shadow-sm">
                  <div className="flex flex-wrap items-center gap-1.5 border-b px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
                    <ReplyIcon className="size-3.5 shrink-0" />
                    Reply to{" "}
                    <span className="font-medium text-foreground">
                      {(replySender ?? sender).name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                      &lt;{(replySender ?? sender).address}&gt;
                    </span>
                  </div>
                  {/* Transparent, border-0 editor so the body shares the card with header/signature/footer. */}
                  <RichTextEditor
                    value={replyBody}
                    onChange={setReplyBody}
                    onSubmit={() => void sendReply()}
                    snippets={replySnippets}
                    placeholder="Write your reply…"
                    autoFocus
                    minHeight={140}
                    className="rounded-none border-0 bg-transparent"
                  />
                  {showSignature && (
                    <div className="border-t px-3.5 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-[0.5px] text-muted-foreground/60 uppercase">
                          Signature
                        </span>
                        <button
                          type="button"
                          onClick={() => setSignatureSkipped(true)}
                          aria-label="Remove signature"
                          className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </div>
                      {useGmailSig ? (
                        <div className="overflow-hidden rounded-md border">
                          <HtmlBody html={gmailSig} accountId={accountId} />
                        </div>
                      ) : (
                        <div className="text-[13px] leading-[1.6] whitespace-pre-line text-muted-foreground">
                          {dbSig?.body}
                        </div>
                      )}
                    </div>
                  )}
                  <footer className="flex items-center gap-3 border-t px-3.5 py-[11px]">
                    <Button
                      size="sm"
                      disabled={replySending || !replyBody.trim()}
                      onClick={() => void sendReply()}
                    >
                      <SendIcon data-icon="inline-start" />
                      {replySending ? "Sending…" : "Send reply"}
                    </Button>
                    <KbdGroup className="hidden text-muted-foreground/45 sm:inline-flex">
                      <Kbd>⌘</Kbd>
                      <Kbd>↵</Kbd>
                    </KbdGroup>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setReplyOpen(false)}
                    >
                      Cancel
                    </Button>
                  </footer>
                </div>
              ) : replySent ? (
                <button
                  type="button"
                  onClick={startReply}
                  className="mt-6 flex w-full items-center gap-2 rounded-lg border border-accent-2-focus/40 bg-accent-2/10 px-3 py-2 text-left text-[12.5px] text-accent-2-hover hover:bg-accent-2/15"
                >
                  <CheckIcon className="size-3.5" />
                  {isTestAccount(accountId)
                    ? "Demo: nothing was actually sent. Reply again?"
                    : "Reply sent. It’ll appear in this thread. Reply again?"}
                </button>
              ) : null}
            </div>
          </article>
        )}
      </div>

      {email && (
        <div className="flex shrink-0 items-center gap-2 border-t bg-card px-3 py-2.5">
          <button
            type="button"
            onClick={startReply}
            className={cn(BAR_PRIMARY, narrow && "flex-1")}
          >
            <ReplyIcon /> Reply
          </button>
          {!narrow && (
            <>
              <button type="button" onClick={startReplyAll} className={BAR_SEC}>
                <ReplyAllIcon /> Reply all
              </button>
              <button type="button" onClick={startForward} className={BAR_SEC}>
                <ForwardIcon /> Forward
              </button>
              <div className="flex-1" />
            </>
          )}
          <Hint label="Archive">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("archive")}
              className={BAR_ICON}
            >
              <ArchiveIcon />
            </button>
          </Hint>
          <Hint label="Delete">
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction("trash")}
              className={BAR_ICON}
            >
              <Trash2Icon />
            </button>
          </Hint>
          {/* Raw + Export + Copy message-ID tucked into the ··· overflow, opens upward */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title="More actions"
                  className={BAR_ICON}
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              sideOffset={8}
              className="w-60"
            >
              <DropdownMenuItem onClick={startReplyAll}>
                <ReplyAllIcon />
                Reply all
                <KbdGroup className="ml-auto">
                  <Kbd>⇧</Kbd>
                  <Kbd>⌘</Kbd>
                  <Kbd>R</Kbd>
                </KbdGroup>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={startForward}>
                <ForwardIcon />
                Forward
                <KbdGroup className="ml-auto">
                  <Kbd>⌘</Kbd>
                  <Kbd>F</Kbd>
                </KbdGroup>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-mono text-[9.5px] tracking-[0.5px] text-muted-foreground/70 uppercase">
                  Developer
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setRaw((current) => !current)}>
                  <CodeXmlIcon
                    className={raw ? "text-accent-2-hover" : undefined}
                  />
                  <span className="font-mono text-xs">
                    {raw ? "Hide raw source" : "View raw source"}
                  </span>
                  {raw && (
                    <CheckIcon className="ml-auto size-3.5 text-accent-2-hover" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void navigator.clipboard.writeText(email.messageId);
                    toast("Copied message ID");
                  }}
                >
                  <ClipboardIcon />
                  <span className="font-mono text-xs">Copy message-ID</span>
                  <KbdGroup className="ml-auto">
                    <Kbd>⇧</Kbd>
                    <Kbd>⌘</Kbd>
                    <Kbd>C</Kbd>
                  </KbdGroup>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-mono text-[9.5px] tracking-[0.5px] text-muted-foreground/70 uppercase">
                  Export
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportEmail(email, "md")}>
                  <HashIcon />
                  <span className="font-mono text-xs">Export as Markdown</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .md
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportEmail(email, "json")}>
                  <BracesIcon />
                  <span className="font-mono text-xs">Export as JSON</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .json
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportEmail(email, "txt")}>
                  <FileTextIcon />
                  <span className="font-mono text-xs">Export as text</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .txt
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
