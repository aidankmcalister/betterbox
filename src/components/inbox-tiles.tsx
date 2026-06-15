import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArchiveIcon,
  BadgeCheckIcon,
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
  PencilIcon,
  RefreshCwIcon,
  ReplyAllIcon,
  SearchIcon,
  ReplyIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  READER_PANE_ID,
  RESET_TILE_LAYOUT_EVENT,
  SEARCH_INBOX_EVENT,
  parseStoredTree,
  type LayoutNode,
  type SearchInboxDetail,
} from "@/lib/layout-tree";
import {
  TileBoard,
  useTileDrag,
  type TileStorage,
} from "@/components/tile-board";
import { toast } from "sonner";

import type { Account } from "@/lib/account";
import { linkGoogle } from "@/lib/auth-client";
import { isTestAccount } from "@/lib/test-account";
import { formatCount } from "@/lib/format";
import { exportEmail } from "@/lib/export-email";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  accountsQueryKey,
  actOnEmail,
  deleteDraft,
  emailsQueryKey,
  flattenEmails,
  markEmailsRead,
  sendNewEmail,
  useEmailsQuery,
  useFullEmailQuery,
  useRawEmailQuery,
  useThreadQuery,
  type EmailsData,
  type FullEmail,
  type MessageAction,
} from "@/lib/mail-queries";
import { MARK_READ_MS, useSettings } from "@/hooks/use-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { Composer, type ComposerContent } from "@/components/composer";
import { AppliedTags, TagPicker, useTagActions } from "@/components/tag-picker";
import { LabeledView } from "@/components/labeled-view";
import type { Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import { HtmlBody } from "@/components/html-body";
import { RawView } from "@/components/raw-view";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SenderAvatar } from "@/components/sender-avatar";
import { isVerifiedSender } from "@/lib/verified-senders";
import { Hint } from "@/components/ui/tooltip";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/thread-list-states";
import { ThreadRow } from "@/components/thread-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const STORAGE_KEY = "bm.tiles-layout";
const FULL_EMAIL_MIN_WIDTH = 330;

/** Pane id for the composer when it lives in the board (composerMode: "pane"). */
export const COMPOSE_PANE_ID = "__compose__";

export type Reading = { accountId: string; emailId: string };

/** Compose-as-a-pane state, threaded from AppShell when composerMode === "pane". */
export type ComposePane = {
  open: boolean;
  draftRef: { accountId: string; emailId: string } | null;
  content: ComposerContent;
  onContentChange: (patch: Partial<ComposerContent>) => void;
  onOpenChange: (open: boolean) => void;
};

const splitReaderId = (accountId: string) => `${READER_PANE_ID}:${accountId}`;

type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  folder: Folder;
  openEmail: (accountId: string, emailId: string) => void;
  getOpenEmail: (accountId: string) => string | null;
  /* Per-account search lives here (not in the pane) so it survives pane
     remounts when the layout changes — e.g. docking the reader. Absent = closed. */
  paneSearch: Record<string, string>;
  openSearch: (accountId: string) => void;
  setSearch: (accountId: string, query: string) => void;
  closeSearch: (accountId: string) => void;
  /** Portal target for row context menus (set in the landing demo). */
  portalContainer?: React.RefObject<HTMLElement | null>;
};
const TilesContext = createContext<TilesCtx | null>(null);

function useTiles(): TilesCtx {
  const ctx = useContext(TilesContext);
  if (!ctx) throw new Error("Tile components must render inside InboxTiles");
  return ctx;
}

function loadStoredTree(): LayoutNode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; tree?: unknown };
    return parsed?.v === 3 ? parseStoredTree(parsed.tree) : null;
  } catch {
    return null;
  }
}

function persistTree(tree: LayoutNode | null) {
  try {
    if (tree === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 3, tree }));
  } catch {
    // storage unavailable — layout just won't persist
  }
}

export function InboxTiles({
  accounts,
  scopeIds,
  folder,
  reading,
  onOpenEmail,
  onCloseReader,
  onRemovePane,
  onEditDraft,
  compose,
  portalContainer,
}: {
  accounts: Account[];
  scopeIds: string[];
  folder: Folder;
  reading: Reading | null;
  onOpenEmail: (accountId: string, emailId: string) => void;
  onCloseReader: () => void;
  onRemovePane: (accountId: string) => void;
  /** Drafts open in the composer for editing instead of the read-only reader. */
  onEditDraft?: (accountId: string, emailId: string) => void;
  /** Set (composerMode === "pane") to dock the composer as a draggable tile. */
  compose?: ComposePane | null;
  /** Portal target for row context menus — set in the landing demo so they
   *  stay inside the scaled box. */
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const ids = scoped.map((a) => a.accountId);
  const idsKey = ids.join(",");

  const { readerMode } = useSettings();
  const isMobile = useIsMobile();

  const [openEmails, setOpenEmails] = useState<Record<string, string>>({});
  // Mobile is single-column: force the shared reader (one at a time) so opening
  // a message routes through the URL and overlays full-screen, never a 2nd pane.
  const split = readerMode === "split" && !isMobile;

  const openEmail = useCallback(
    (accountId: string, emailId: string) => {
      // A draft isn't a message to read — open it in the composer to edit/send.
      if (folder === "drafts" && onEditDraft) {
        onEditDraft(accountId, emailId);
        return;
      }
      if (split)
        setOpenEmails((current) => ({ ...current, [accountId]: emailId }));
      else onOpenEmail(accountId, emailId);
    },
    [folder, onEditDraft, split, onOpenEmail],
  );
  const getOpenEmail = useCallback(
    (accountId: string) =>
      split
        ? (openEmails[accountId] ?? null)
        : reading?.accountId === accountId
          ? reading.emailId
          : null,
    [split, openEmails, reading],
  );
  const closeReaderFor = useCallback(
    (accountId: string) => {
      if (split) {
        setOpenEmails((current) => {
          const next = { ...current };
          delete next[accountId];
          return next;
        });
      } else onCloseReader();
    },
    [split, onCloseReader],
  );

  const readerIds = split
    ? ids.filter((id) => openEmails[id]).map(splitReaderId)
    : reading
      ? [READER_PANE_ID]
      : [];
  const composeIds = compose?.open ? [COMPOSE_PANE_ID] : [];
  const paneIds = [...ids, ...readerIds, ...composeIds];

  useEffect(() => {
    if (split) {
      setOpenEmails((current) => {
        const next: Record<string, string> = {};
        for (const id of ids) if (current[id]) next[id] = current[id];
        return Object.keys(next).length === Object.keys(current).length
          ? current
          : next;
      });
    } else if (reading && !ids.includes(reading.accountId)) {
      onCloseReader();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, split]);

  const [paneSearch, setPaneSearch] = useState<Record<string, string>>({});
  const openSearch = useCallback(
    (accountId: string) =>
      setPaneSearch((current) =>
        accountId in current ? current : { ...current, [accountId]: "" },
      ),
    [],
  );
  const setSearch = useCallback(
    (accountId: string, query: string) =>
      setPaneSearch((current) => ({ ...current, [accountId]: query })),
    [],
  );
  const closeSearch = useCallback(
    (accountId: string) =>
      setPaneSearch((current) => {
        const next = { ...current };
        delete next[accountId];
        return next;
      }),
    [],
  );

  useEffect(() => {
    const onSearch = (event: Event) => {
      const { accountId, query } = (event as CustomEvent<SearchInboxDetail>)
        .detail;
      setPaneSearch((current) => {
        if (accountId === "all") {
          const next = { ...current };
          for (const id of ids) next[id] = query;
          return next;
        }
        return { ...current, [accountId]: query };
      });
    };
    window.addEventListener(SEARCH_INBOX_EVENT, onSearch);
    return () => window.removeEventListener(SEARCH_INBOX_EVENT, onSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const ctx: TilesCtx = {
    accounts,
    removable: scoped.length > 1,
    onRemovePane,
    folder,
    openEmail,
    getOpenEmail,
    paneSearch,
    openSearch,
    setSearch,
    closeSearch,
    portalContainer,
  };

  const storage: TileStorage = { load: loadStoredTree, save: persistTree };

  const renderPane = (paneId: string) => {
    if (paneId === COMPOSE_PANE_ID && compose) {
      return <ComposePane compose={compose} accounts={accounts} />;
    }
    if (paneId === READER_PANE_ID && reading) {
      return (
        <ReaderPane
          paneId={paneId}
          accountId={reading.accountId}
          emailId={reading.emailId}
          onClose={() => closeReaderFor(reading.accountId)}
        />
      );
    }
    if (paneId.startsWith(`${READER_PANE_ID}:`)) {
      const acc = paneId.slice(READER_PANE_ID.length + 1);
      return (
        <ReaderPane
          paneId={paneId}
          accountId={acc}
          emailId={openEmails[acc] ?? null}
          onClose={() => closeReaderFor(acc)}
        />
      );
    }
    return <AccountPane accountId={paneId} />;
  };

  const renderDragLabel = (paneId: string) => {
    if (paneId === COMPOSE_PANE_ID) {
      return (
        <>
          <PencilIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs">New message</span>
        </>
      );
    }
    if (paneId === READER_PANE_ID || paneId.startsWith(`${READER_PANE_ID}:`)) {
      return (
        <>
          <MailOpenIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs">Reading pane</span>
        </>
      );
    }
    const account = accounts.find((a) => a.accountId === paneId);
    if (!account) return null;
    return (
      <>
        <AccountDot
          colorIndex={accounts.indexOf(account)}
          accountId={account.accountId}
        />
        <span className="font-mono text-xs">{account.email}</span>
      </>
    );
  };

  return (
    <TilesContext.Provider value={ctx}>
      {isMobile ? (
        <MobileBoard
          accounts={accounts}
          accountIds={ids}
          reading={reading}
          renderPane={renderPane}
        />
      ) : (
        <TileBoard
          paneIds={paneIds}
          renderPane={renderPane}
          storage={storage}
          renderDragLabel={renderDragLabel}
          resetEvent={RESET_TILE_LAYOUT_EVENT}
          emptyLabel="No linked accounts."
        />
      )}
    </TilesContext.Provider>
  );
}

/**
 * Single-column board for phones. Shows one account's inbox at a time (a
 * horizontally-scrollable tab strip switches between them when several are in
 * view), and slides the shared reader in full-screen over the list when a
 * message is open. No drag-to-arrange, no side-by-side panes.
 */
function MobileBoard({
  accounts,
  accountIds,
  reading,
  renderPane,
}: {
  accounts: Account[];
  accountIds: string[];
  reading: Reading | null;
  renderPane: (paneId: string) => React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(accountIds[0] ?? null);

  // Keep the active tab valid as accounts come/go from view.
  useEffect(() => {
    if (!active || !accountIds.includes(active)) {
      setActive(accountIds[0] ?? null);
    }
  }, [accountIds, active]);

  if (accountIds.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">No linked accounts.</p>
    );
  }

  const scoped = accounts.filter((a) => accountIds.includes(a.accountId));

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {scoped.length > 1 && (
        <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
          {scoped.map((account) => {
            const on = active === account.accountId;
            return (
              <button
                key={account.accountId}
                type="button"
                onClick={() => setActive(account.accountId)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors",
                  on
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <AccountDot
                  colorIndex={accounts.indexOf(account)}
                  accountId={account.accountId}
                />
                <span className="font-mono">
                  {account.email.split("@")[0] || account.accountId}
                </span>
                {account.unread > 0 && (
                  <span className="font-mono font-medium text-primary">
                    {formatCount(account.unread)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {active && renderPane(active)}
        {reading && (
          <div className="absolute inset-0 z-40 bg-background">
            {renderPane(READER_PANE_ID)}
          </div>
        )}
      </div>
    </div>
  );
}

/** The composer docked as a board tile — its header doubles as the drag handle. */
function ComposePane({
  compose,
  accounts,
}: {
  compose: ComposePane;
  accounts: Account[];
}) {
  const beginHeaderDrag = useTileDrag();
  return (
    <Composer
      inPane
      open
      onOpenChange={compose.onOpenChange}
      accounts={accounts}
      content={compose.content}
      onContentChange={compose.onContentChange}
      draft={compose.draftRef}
      onHeaderPointerDown={(event) => beginHeaderDrag(event, COMPOSE_PANE_ID)}
    />
  );
}

function AccountPane({ accountId }: { accountId: string }) {
  const { accounts, paneSearch, openSearch, setSearch, closeSearch } =
    useTiles();
  const account = accounts.find((a) => a.accountId === accountId);
  const dotIndex = accounts.findIndex((a) => a.accountId === accountId);

  const paneRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Search state is owned by the board (persists across remounts). Debounce the
     fetch locally, seeded from the persisted query so a remount re-queries
     immediately rather than clearing. */
  const search = paneSearch[accountId];
  const searchOpen = search !== undefined;
  const [debounced, setDebounced] = useState(search ?? "");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search ?? ""), 300);
    return () => clearTimeout(timer);
  }, [search]);

  if (!account) return null;

  return (
    <div ref={paneRef} className="flex h-full min-w-0 flex-col bg-background">
      <PaneHeader
        account={account}
        dotIndex={dotIndex}
        width={width}
        searchOpen={searchOpen}
        onOpenSearch={() => openSearch(accountId)}
        onCloseSearch={() => closeSearch(accountId)}
        search={search ?? ""}
        onSearchChange={(query) => setSearch(accountId, query)}
        activeQuery={debounced}
      />
      <PaneBody account={account} dotIndex={dotIndex} search={debounced} />
    </div>
  );
}

function parseAddress(from: string): { name: string; address: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim() || match[2], address: match[2] };
  return { name: from, address: from };
}

/** Split a header address list ("A <a@x>, B <b@y>") into bare addresses,
 *  respecting commas inside a quoted display name. */
function splitAddresses(list: string): string[] {
  if (!list) return [];
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  for (const ch of list) {
    if (ch === '"') inQuote = !inQuote;
    if (ch === "," && !inQuote) {
      parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((part) => parseAddress(part).address).filter(Boolean);
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A quoted-reply body: a blank line to type into, an attribution line, then the
 *  original message in a blockquote. Returned as HTML to seed the rich editor. */
function quotedReplyHtml(message: FullEmail): string {
  const who = parseAddress(message.from);
  const attribution = `On ${escapeHtml(message.date)}, ${escapeHtml(
    who.name,
  )} &lt;${escapeHtml(who.address)}&gt; wrote:`;
  const original = escapeHtml(message.body || message.snippet || "")
    .split("\n")
    .join("<br>");
  return `<p></p><p>${attribution}</p><blockquote>${original}</blockquote>`;
}

function ReaderPane({
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
  const { accounts, folder } = useTiles();
  const beginHeaderDrag = useTileDrag();
  const { clock, markRead, rawByDefault } = useSettings();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(rawByDefault);
  // Measure our own width so the action bar can collapse (reply-all/forward fold
  // into the overflow, the message-id copy goes icon-only) on a narrow pane.
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
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
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

  useEffect(
    () => setStarred(email?.starred ?? false),
    [email?.id, email?.starred],
  );
  useEffect(() => {
    setReplyOpen(false);
    setReplyBody("");
    setReplySent(false);
  }, [email?.id]);
  useEffect(() => {
    if (messages.length === 0) return;
    const ids = new Set<string>();
    if (emailId) ids.add(emailId);
    ids.add(messages[messages.length - 1].id);
    setExpandedIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.threadId, thread]);

  useEffect(() => {
    if (!email || !email.unread) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Reply to everyone on the thread's latest message: To = original sender +
  // To recipients, Cc = original Cc, both minus our own address and dupes.
  // Opens the composer (via the same event forward uses) with threading headers.
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

  // Build a forward draft from the open message and ask the app shell to open
  // the composer. Reused by the reader footer button and the start-forward
  // event (row context menu).
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
        html: replyBody,
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
      // Alt+R -> toggle raw MIME
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
      // Open inline reply
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            {/* Hero — labels then the big subject */}
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
                <div className="mt-6 rounded-lg border bg-secondary p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <ReplyIcon className="size-3.5" />
                    Reply to{" "}
                    <span className="font-medium text-foreground">
                      {(replySender ?? sender).name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground/80">
                      &lt;{(replySender ?? sender).address}&gt;
                    </span>
                  </div>
                  <RichTextEditor
                    value={replyBody}
                    onChange={setReplyBody}
                    onSubmit={() => void sendReply()}
                    placeholder="Write your reply…"
                    autoFocus
                    minHeight={120}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={replySending || !replyBody.trim()}
                      onClick={() => void sendReply()}
                    >
                      <SendIcon data-icon="inline-start" />
                      {replySending ? "Sending…" : "Send reply"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReplyOpen(false)}
                    >
                      Cancel
                    </Button>
                    <KbdGroup className="ml-auto">
                      <Kbd>⌘</Kbd>
                      <Kbd>↵</Kbd>
                    </KbdGroup>
                  </div>
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

function ThreadMessage({
  message,
  expanded,
  onToggle,
  accountColor,
  hour12,
  narrow,
}: {
  message: FullEmail;
  expanded: boolean;
  onToggle: () => void;
  accountColor: string;
  hour12: boolean;
  narrow: boolean;
}) {
  const sender = parseAddress(message.from);

  // Collapsed thread message — a compact one-line row.
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-1 py-2 text-left hover:bg-muted/40"
      >
        <SenderAvatar
          name={sender.name}
          address={sender.address}
          color={accountColor}
          className="size-7"
        />
        <span className="shrink-0 text-[13px] font-medium">{sender.name}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {message.snippet}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {relativeTime(message.date)}
        </span>
      </button>
    );
  }

  // Expanded — the two-tier sender card, then the email framed as paper.
  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {/* Tier 1 — logo · name + verified + email · time */}
        <div
          className={cn(
            "flex items-center gap-3",
            narrow ? "px-3.5 py-3.5" : "px-[18px] py-4",
          )}
        >
          <SenderAvatar
            name={sender.name}
            address={sender.address}
            color={accountColor}
            className="size-11"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="cursor-pointer truncate text-[16px] font-semibold tracking-[-0.2px] hover:underline"
              >
                {sender.name}
              </button>
              {isVerifiedSender(sender.address) && (
                <Hint label="Verified sender">
                  <BadgeCheckIcon className="size-4 shrink-0 text-label-blue" />
                </Hint>
              )}
            </div>
            <div className="mt-[3px] truncate font-mono text-[11.5px] text-muted-foreground">
              &lt;{sender.address}&gt;
            </div>
          </div>
          <Hint label={isoDate(message.date)}>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[12px] text-muted-foreground">
                {timeOnly(message.date, hour12)}
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                {relativeTime(message.date)}
              </div>
            </div>
          </Hint>
        </div>
        {/* Tier 2 — recipient strip + copy message-id */}
        <div
          className={cn(
            "flex items-center gap-2 border-t bg-secondary py-2.5",
            narrow ? "px-3.5" : "px-[18px]",
          )}
        >
          <span className="shrink-0 text-[11.5px] text-muted-foreground/70">
            to
          </span>
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: accountColor }}
          />
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
            {message.to || "—"}
          </span>
          {message.messageId && (
            <CopyButton
              value={message.messageId}
              label="Copy message ID"
              iconOnly={narrow}
            />
          )}
        </div>
      </div>

      {/* Native email — framed as a floating paper card */}
      <div className="mt-3.5 overflow-hidden rounded-xl border bg-card shadow-lg shadow-black/30">
        {message.bodyHtml ? (
          <HtmlBody html={message.bodyHtml} />
        ) : (
          <div className="px-5 py-4">
            {(message.body || message.snippet || "(empty message)")
              .split("\n")
              .map((line, i) =>
                line.trim() === "" ? (
                  <div key={i} className="h-3" />
                ) : (
                  <p
                    key={i}
                    className="m-0 text-sm leading-[1.65] text-pretty text-foreground/85"
                  >
                    {line}
                  </p>
                ),
              )}
          </div>
        )}
      </div>
    </div>
  );
}

const BAR_PRIMARY =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-[7px] rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-hover [&_svg]:size-3.5";
const BAR_SEC =
  "inline-flex h-8 cursor-pointer items-center gap-[7px] rounded-lg border bg-secondary px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-popover hover:text-foreground [&_svg]:size-3.5 [&_svg]:text-muted-foreground";
const BAR_ICON =
  "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-[15px] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

const isoDate = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

/** Clock-aware time only, e.g. "10:16" / "10:16 AM". */
const timeOnly = (raw: string, hour12: boolean) => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleTimeString([], {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  });
};

/** Compact relative age ("2h ago", "3d ago"); falls back to a short date past a week. */
const relativeTime = (raw: string) => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const secs = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const SEARCH_OPERATORS: { token: string; hint: string }[] = [
  { token: "is:unread", hint: "Unread only" },
  { token: "is:starred", hint: "Starred only" },
  { token: "from:", hint: "From a sender" },
  { token: "to:", hint: "Sent to someone" },
  { token: "subject:", hint: "Words in the subject" },
  { token: "has:attachment", hint: "Has an attachment" },
  { token: "newer_than:7d", hint: "Last 7 days" },
  { token: "after:2026/01/01", hint: "After a date (YYYY/MM/DD)" },
  { token: "in:important", hint: "Marked important" },
];

function PaneHeader({
  account,
  dotIndex,
  width,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  search,
  onSearchChange,
  activeQuery,
}: {
  account: Account;
  dotIndex: number;
  width: number;
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  activeQuery: string;
}) {
  const { removable, onRemovePane, folder } = useTiles();
  const beginHeaderDrag = useTileDrag();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const label =
    width >= FULL_EMAIL_MIN_WIDTH || width === 0
      ? account.email || account.accountId
      : account.email.split("@")[0] || account.accountId;

  const activeKey = emailsQueryKey(account.accountId, folder, activeQuery);
  const refreshing = useIsFetching({ queryKey: activeKey }) > 0;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: activeKey });
    queryClient.invalidateQueries({ queryKey: accountsQueryKey });
  };

  const iconButton =
    "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent";

  if (searchOpen) {
    const insertOperator = (token: string) => {
      const base = search.trim();
      const next = (base ? `${base} ` : "") + token;
      // Value operators (from:, to:, …) need trailing cursor; complete tokens get a space.
      onSearchChange(token.endsWith(":") ? next : `${next} `);
      searchInputRef.current?.focus();
    };
    return (
      <div className="shrink-0 border-b">
        <div className="flex h-9 items-center gap-1.5 px-2.5">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          <input
            ref={searchInputRef}
            autoFocus
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCloseSearch();
            }}
            placeholder="Search this inbox, try in:important"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {refreshing && (
            <RefreshCwIcon className="size-3 shrink-0 animate-spin text-muted-foreground/70" />
          )}
          <Hint label="Close search (Esc)">
            <button
              type="button"
              onClick={onCloseSearch}
              className={iconButton}
            >
              <XIcon className="size-3.5" />
            </button>
          </Hint>
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-2.5 pb-1.5">
          <span className="mr-0.5 shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground/50 uppercase">
            try
          </span>
          {SEARCH_OPERATORS.map((op) => (
            <Hint key={op.token} label={op.hint}>
              <button
                type="button"
                onClick={() => insertOperator(op.token)}
                className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {op.token}
              </button>
            </Hint>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      onPointerDown={(event) => beginHeaderDrag(event, account.accountId)}
      className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
    >
      <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
      <AccountDot colorIndex={dotIndex} accountId={account.accountId} />
      <span className="min-w-0 truncate font-mono text-xs font-medium">
        {label}
      </span>
      {account.unread > 0 && (
        <span className="shrink-0 font-mono text-[11px] font-medium text-primary">
          {formatCount(account.unread)} new
        </span>
      )}
      {folder === "drafts" && (
        <DeleteAllDraftsButton
          account={account}
          className={cn(iconButton, "ml-auto")}
        />
      )}
      <Hint label="Search this inbox">
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(iconButton, folder !== "drafts" && "ml-auto")}
        >
          <SearchIcon className="size-3.5" />
        </button>
      </Hint>
      <Hint label="Refresh">
        <button
          type="button"
          disabled={refreshing}
          onClick={refresh}
          className={iconButton}
        >
          <RefreshCwIcon
            className={cn("size-3.5", refreshing && "animate-spin")}
          />
        </button>
      </Hint>
      {removable && (
        <Hint label={`Remove ${account.email} from view`}>
          <button
            type="button"
            onClick={() => onRemovePane(account.accountId)}
            className={iconButton}
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  );
}

/** Drafts-only: delete every draft in this account, behind a confirm dialog. */
function DeleteAllDraftsButton({
  account,
  className,
}: {
  account: Account;
  className: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const draftsList = () =>
    flattenEmails(
      queryClient.getQueryData(emailsQueryKey(account.accountId, "drafts")),
    ) ?? [];

  const onConfirm = async () => {
    const drafts = draftsList();
    setBusy(true);
    try {
      await Promise.all(
        drafts.map((d) => deleteDraft(account.accountId, d.id)),
      );
      queryClient.invalidateQueries({
        queryKey: ["emails", account.accountId],
      });
      toast.success(
        `Deleted ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`,
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const count = open ? draftsList().length : 0;

  return (
    <>
      <Hint label="Delete all drafts">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </Hint>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all drafts?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {count === 0
              ? "There are no drafts to delete."
              : `Permanently delete ${count} draft${count === 1 ? "" : "s"} in ${account.email || account.accountId}. This can’t be undone.`}
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || count === 0}
              onClick={() => void onConfirm()}
              className="bg-label-red text-white hover:bg-label-red/90"
            >
              {busy ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaneBody({
  account,
  dotIndex,
  search,
}: {
  account: Account;
  dotIndex: number;
  search: string;
}) {
  const { getOpenEmail, openEmail, folder, portalContainer } = useTiles();
  const { density } = useSettings();
  const query = useEmailsQuery(account.accountId, folder, search);
  const { error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    query;
  const emails = flattenEmails(query.data);
  const searching = search.trim().length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, emails?.length]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      {folder === "labeled" ? (
        <LabeledView
          accountId={account.accountId}
          dotIndex={dotIndex}
          openEmail={openEmail}
          getOpenEmail={getOpenEmail}
          portalContainer={portalContainer}
        />
      ) : error ? (
        <ErrorState
          detail={`GET /api/emails · ${error.message}`}
          onRetry={() => refetch()}
          onReconnect={() => linkGoogle()}
        />
      ) : !emails ? (
        <SkeletonRows density={density} />
      ) : emails.length === 0 ? (
        searching ? (
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              No matches for{" "}
              <span className="font-mono text-foreground">{search.trim()}</span>
            </p>
            <p className="font-mono text-[10.5px] text-muted-foreground/70">
              searched {account.email} · live from Gmail
            </p>
          </div>
        ) : (
          <EmptyState folder={folder} />
        )
      ) : (
        <>
          {emails.map((email) => (
            <ThreadRow
              key={email.id}
              email={email}
              density={density}
              dotIndex={dotIndex}
              accountId={account.accountId}
              selected={getOpenEmail(account.accountId) === email.id}
              onClick={() => openEmail(account.accountId, email.id)}
              portalContainer={portalContainer}
            />
          ))}
          {hasNextPage ? (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70"
            >
              <RefreshCwIcon className="size-3 shrink-0 animate-spin" />
              Loading more…
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70">
              <CheckIcon className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {emails.length} loaded · fetched live from Gmail
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
