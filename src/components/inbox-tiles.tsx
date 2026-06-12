import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArchiveIcon,
  BadgeCheckIcon,
  BracesIcon,
  ChevronLeftIcon,
  CheckIcon,
  ChevronUpIcon,
  ClipboardIcon,
  CodeXmlIcon,
  DownloadIcon,
  FileTextIcon,
  ForwardIcon,
  GripVerticalIcon,
  HashIcon,
  MailOpenIcon,
  PencilIcon,
  RefreshCwIcon,
  ReplyAllIcon,
  SearchIcon,
  ReplyIcon,
  SendIcon,
  StarIcon,
  TagIcon,
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
import type { Account } from "@/lib/account";
import { linkGoogle } from "@/lib/auth-client";
import { formatCount } from "@/lib/format";
import { exportEmail } from "@/lib/export-email";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  accountsQueryKey,
  actOnEmail,
  createLabel,
  deleteLabel,
  emailsQueryKey,
  flattenEmails,
  labelsQueryKey,
  markEmailsRead,
  renameLabel,
  sendNewEmail,
  setEmailLabel,
  useEmailsQuery,
  useFullEmailQuery,
  useLabelsQuery,
  useRawEmailQuery,
  useThreadQuery,
  type EmailsData,
  type FullEmail,
  type Label,
  type MessageAction,
} from "@/lib/mail-queries";
import { MARK_READ_MS, setTagColor, useSettings } from "@/hooks/use-settings";
import type { Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import { HtmlBody } from "@/components/html-body";
import { RawView } from "@/components/raw-view";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const STORAGE_KEY = "bm.tiles-layout";
/** Below this pane width the header shows the short handle, not the email. */
const FULL_EMAIL_MIN_WIDTH = 330;

/** Tag color palette. A tag's color is the user's override (Settings, by label
 *  id) or a stable default derived from the name. No mail data is stored. */
const TAG_COLORS = [
  "--color-label-blue",
  "--color-label-green",
  "--color-label-purple",
  "--color-label-red",
  "--color-label-yellow",
  "--color-label-orange",
];
const tagColorIndex = (label: Label, overrides: Record<string, number>) =>
  overrides[label.id] ??
  [...label.name].reduce((total, ch) => total + ch.charCodeAt(0), 0) %
    TAG_COLORS.length;
const tagColorVar = (index: number) => `var(${TAG_COLORS[index % TAG_COLORS.length]})`;

/** A tag pill. `onRemove` adds an × (reader); omit it for read-only row chips. */
function TagChip({ label, onRemove }: { label: Label; onRemove?: () => void }) {
  const { tagColors } = useSettings();
  const color = tagColorVar(tagColorIndex(label, tagColors));
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-2 text-[11px] font-medium"
      style={{
        background: `color-mix(in srgb, ${color} 16%, var(--background))`,
        color,
      }}
    >
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </span>
  );
}

/** The open message — URL-driven in shared mode (/email/$id?account=…), or
 *  board-local state in split mode. */
export type Reading = { accountId: string; emailId: string };

/** Split-mode reader pane id for an account (one reader docked per account). */
const splitReaderId = (accountId: string) => `${READER_PANE_ID}:${accountId}`;

type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  folder: Folder;
  /** Open an email — shared mode routes via the URL, split mode via board state. */
  openEmail: (accountId: string, emailId: string) => void;
  /** Which email is open in this account's reader, if any. */
  getOpenEmail: (accountId: string) => string | null;
  /* Per-account search lives here (not in the pane) so it survives the pane
     remounts that happen when the layout changes — e.g. docking the reader. An
     account present in the map has its search bar open; the value is the query
     (possibly ""). Absent = closed. */
  paneSearch: Record<string, string>;
  openSearch: (accountId: string) => void;
  setSearch: (accountId: string, query: string) => void;
  closeSearch: (accountId: string) => void;
};
const TilesContext = createContext<TilesCtx | null>(null);

function useTiles(): TilesCtx {
  const ctx = useContext(TilesContext);
  if (!ctx) throw new Error("Tile components must render inside InboxTiles");
  return ctx;
}

// ── Persistence ──────────────────────────────────────────────────────────────

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

// ── Board ────────────────────────────────────────────────────────────────────

export function InboxTiles({
  accounts,
  scopeIds,
  folder,
  reading,
  onOpenEmail,
  onCloseReader,
  onRemovePane,
}: {
  accounts: Account[];
  scopeIds: string[];
  folder: Folder;
  reading: Reading | null;
  onOpenEmail: (accountId: string, emailId: string) => void;
  onCloseReader: () => void;
  onRemovePane: (accountId: string) => void;
}) {
  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const ids = scoped.map((a) => a.accountId);
  const idsKey = ids.join(",");

  const { readerMode } = useSettings();

  /* Split mode keeps a reader open per account in board-local state; shared mode
     uses the single URL-driven `reading`. */
  const [openEmails, setOpenEmails] = useState<Record<string, string>>({});
  const split = readerMode === "split";

  const openEmail = useCallback(
    (accountId: string, emailId: string) => {
      if (split) setOpenEmails((current) => ({ ...current, [accountId]: emailId }));
      else onOpenEmail(accountId, emailId);
    },
    [split, onOpenEmail],
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

  /* Reader panes join the layout tree (they dock right and drag like any pane).
     Shared: one __reader__. Split: __reader__:<accountId> per open email. */
  const readerIds = split
    ? ids.filter((id) => openEmails[id]).map(splitReaderId)
    : reading
      ? [READER_PANE_ID]
      : [];
  const paneIds = [...ids, ...readerIds];

  /* Drop readers for accounts that left the view. */
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

  /* Per-account search state, owned by the board so it persists across pane
     remounts. Stays until explicitly cleared (the search bar's ×). */
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

  /* ⌘K "Search in …" drives the panes from afar (accountId "all" = every one). */
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
  };

  const storage: TileStorage = { load: loadStoredTree, save: persistTree };

  const renderPane = (paneId: string) => {
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
      <TileBoard
        paneIds={paneIds}
        renderPane={renderPane}
        storage={storage}
        renderDragLabel={renderDragLabel}
        resetEvent={RESET_TILE_LAYOUT_EVENT}
        emptyLabel="No linked accounts."
      />
    </TilesContext.Provider>
  );
}

// ── Pane ─────────────────────────────────────────────────────────────────────

function AccountPane({
  accountId,
}: {
  accountId: string;
}) {
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

  /* Search state is owned by the board (persists across remounts). Presence in
     the map = open. Debounce the fetch locally, seeded from the persisted query
     so a remount re-queries immediately rather than clearing. */
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

/** "Jane <jane@x.com>" → { name: "Jane", address: "jane@x.com" }. */
function parseAddress(from: string): { name: string; address: string } {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim() || match[2], address: match[2] };
  return { name: from, address: from };
}

/** The message viewer — an ordinary pane in the tree (drag it like an inbox). */
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
  const { showTechnicalMetadata, clock, markRead, tagColors } = useSettings();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(false);
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

  // ── Tags (Gmail labels) ──────────────────────────────────────────────────
  const labels = useLabelsQuery(accountId).data ?? [];
  const appliedIds = email?.labelIds ?? [];
  const appliedTags = labels.filter((label) => appliedIds.includes(label.id));
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  /* The picker is portalled to <body> (fixed-positioned off the button) so the
     tile panes' stacking/overflow can't clip it or render over it. */
  const tagButtonRef = useRef<HTMLButtonElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; right: number }>();
  const openTagPicker = () => {
    const rect = tagButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setTagPickerOpen(true);
  };

  useEffect(() => {
    if (!tagPickerOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (tagButtonRef.current?.contains(target)) return;
      if (tagPickerRef.current?.contains(target)) return;
      setTagPickerOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [tagPickerOpen]);

  /* Optimistically patch the reader + every cached row list for this account. */
  const patchLabels = useCallback(
    (messageId: string, labelId: string, on: boolean) => {
      const upd = (ids: string[] = []) =>
        on ? Array.from(new Set([...ids, labelId])) : ids.filter((id) => id !== labelId);
      queryClient.setQueryData<FullEmail>(["email", accountId, messageId], (e) =>
        e ? { ...e, labelIds: upd(e.labelIds) } : e,
      );
      const patch = (data?: EmailsData) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.map((e) =>
              e.id === messageId ? { ...e, labelIds: upd(e.labelIds) } : e,
            ),
          })),
        };
      queryClient.setQueriesData<EmailsData>({ queryKey: ["emails", accountId] }, patch);
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails-search", accountId] },
        patch,
      );
    },
    [accountId, queryClient],
  );

  const toggleTag = useCallback(
    async (label: Label) => {
      if (!email) return;
      const on = !(email.labelIds ?? []).includes(label.id);
      patchLabels(email.id, label.id, on);
      try {
        await setEmailLabel(accountId, email.id, label.id, on);
      } catch {
        patchLabels(email.id, label.id, !on); // revert
      }
    },
    [accountId, email, patchLabels],
  );

  const createTag = useCallback(async () => {
    const name = newTag.trim();
    if (!email || !name) return;
    setNewTag("");
    const label = await createLabel(accountId, name);
    queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
      (current ?? []).some((l) => l.id === label.id)
        ? current
        : [...(current ?? []), label],
    );
    patchLabels(email.id, label.id, true);
    try {
      await setEmailLabel(accountId, email.id, label.id, true);
    } catch {
      patchLabels(email.id, label.id, false);
    }
  }, [accountId, email, newTag, patchLabels, queryClient]);

  // ── Tag editing (rename / recolor / delete) ──────────────────────────────
  const [editingTag, setEditingTag] = useState<Label | null>(null);
  const [editName, setEditName] = useState("");

  const renameTag = useCallback(async () => {
    if (!editingTag) return;
    const tag = editingTag;
    const name = editName.trim();
    setEditingTag(null);
    if (!name || name === tag.name) return;
    queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
      (current ?? []).map((l) => (l.id === tag.id ? { ...l, name } : l)),
    );
    try {
      await renameLabel(accountId, tag.id, name);
    } catch {
      /* leave the optimistic name; a refetch will reconcile */
    }
  }, [accountId, editingTag, editName, queryClient]);

  const deleteTag = useCallback(
    async (tag: Label) => {
      setEditingTag(null);
      setTagPickerOpen(false);
      // Drop it from the labels list and strip it off every cached message.
      queryClient.setQueryData<Label[]>(labelsQueryKey(accountId), (current) =>
        (current ?? []).filter((l) => l.id !== tag.id),
      );
      const strip = (data?: EmailsData) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            emails: page.emails.map((e) =>
              e.labelIds?.includes(tag.id)
                ? { ...e, labelIds: e.labelIds.filter((id) => id !== tag.id) }
                : e,
            ),
          })),
        };
      queryClient.setQueriesData<EmailsData>({ queryKey: ["emails", accountId] }, strip);
      queryClient.setQueriesData<EmailsData>(
        { queryKey: ["emails-search", accountId] },
        strip,
      );
      queryClient.setQueriesData<FullEmail>({ queryKey: ["email", accountId] }, (e) =>
        e && e.labelIds?.includes(tag.id)
          ? { ...e, labelIds: e.labelIds.filter((id) => id !== tag.id) }
          : e,
      );
      try {
        await deleteLabel(accountId, tag.id);
      } catch {
        /* optimistic removal stands */
      }
    },
    [accountId, queryClient],
  );

  /* The whole conversation. Until it loads, show the opened message alone. */
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

  useEffect(() => setStarred(email?.starred ?? false), [email?.id, email?.starred]);
  /* Reset the inline reply when the open message changes. */
  useEffect(() => {
    setReplyOpen(false);
    setReplyBody("");
    setReplySent(false);
  }, [email?.id]);
  /* Default-expand the opened message + the latest; collapse the rest. */
  useEffect(() => {
    if (messages.length === 0) return;
    const ids = new Set<string>();
    if (emailId) ids.add(emailId);
    ids.add(messages[messages.length - 1].id);
    setExpandedIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email?.threadId, thread]);

  /* Mark an unread message read after the configured delay (Settings → Inbox). */
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

  /* Reply happens inline at the foot of the message (it stays in the pane and
     threads under the original), not in the docked composer. */
  const startReply = () => {
    if (!email) return;
    setReplySent(false);
    setReplyOpen(true);
    requestAnimationFrame(() =>
      replyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const sendReply = async () => {
    const target = lastMessage;
    if (!target || !replySender || replySending || !replyBody.trim()) return;
    setReplySending(true);
    try {
      await sendNewEmail({
        accountId,
        to: replySender.address,
        subject: /^re:/i.test(target.subject)
          ? target.subject
          : `Re: ${target.subject}`,
        body: replyBody,
        inReplyTo: target.messageId || undefined,
        references:
          [target.references, target.messageId].filter(Boolean).join(" ") ||
          undefined,
        threadId: target.threadId || undefined,
      });
      setReplyOpen(false);
      setReplyBody("");
      setReplySent(true);
      // Pull the just-sent message into the visible conversation.
      queryClient.invalidateQueries({
        queryKey: ["thread", accountId, target.threadId],
      });
    } finally {
      setReplySending(false);
    }
  };

  /* archive/trash drop the message from the inbox and close the reader; star
     just toggles. Optimistic — Gmail confirms in the background. */
  const runAction = async (action: MessageAction) => {
    if (!email || busy) return;
    setBusy(true);
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
      onClose();
    } catch {
      setBusy(false);
    }
  };

  /* Reader-scoped keys: Esc closes · ⌥R toggles Raw · R replies. */
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
      if (event.key.toLowerCase() !== "r") return;
      event.preventDefault();
      if (event.altKey) setRaw((current) => !current);
      else startReply();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, email, sender, replyOpen]);

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* Title strip — context + quiet management, draggable like any pane.
          The action buttons live in the floating bar, not up here. */}
      <div
        onPointerDown={(event) => beginHeaderDrag(event, paneId)}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-[9px] border-b px-2.5 select-none active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <MailOpenIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {email?.subject || "Reading"}
        </span>
        <Hint label="Tags">
          <button
            ref={tagButtonRef}
            type="button"
            disabled={!email || busy}
            aria-pressed={tagPickerOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => (tagPickerOpen ? setTagPickerOpen(false) : openTagPicker())}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent",
              appliedTags.length > 0
                ? "text-accent-2-hover"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TagIcon className="size-[15px]" />
          </button>
        </Hint>
        {tagPickerOpen &&
          email &&
          pickerPos &&
          createPortal(
            <div
              ref={tagPickerRef}
              style={{
                position: "fixed",
                top: pickerPos.top,
                right: pickerPos.right,
              }}
              className="z-[100] w-60 overflow-hidden rounded-lg border bg-popover shadow-2xl"
            >
              {editingTag ? (
                <div className="p-2">
                  <div className="mb-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingTag(null)}
                      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ChevronLeftIcon className="size-4" />
                    </button>
                    <span className="text-[12px] font-medium">Edit tag</span>
                    <button
                      type="button"
                      onClick={() => void deleteTag(editingTag)}
                      className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-label-red hover:bg-label-red/10"
                    >
                      <Trash2Icon className="size-3" /> Delete
                    </button>
                  </div>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void renameTag();
                      }
                    }}
                    placeholder="Tag name"
                    className="w-full rounded-md bg-background/60 px-2 py-1 text-[12.5px] outline-none placeholder:text-muted-foreground/60"
                  />
                  <div className="mt-2 flex items-center gap-1.5">
                    {TAG_COLORS.map((_, index) => {
                      const active = tagColorIndex(editingTag, tagColors) === index;
                      return (
                        <button
                          key={index}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTagColor(editingTag.id, index)}
                          className={cn(
                            "size-5 rounded-full transition-shadow",
                            active &&
                              "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
                          )}
                          style={{ background: tagColorVar(index) }}
                        />
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void renameTag()}
                    className="mt-2.5 w-full rounded-md bg-primary py-1 text-[12px] font-medium text-on-primary hover:bg-primary-hover"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <div className="no-scrollbar max-h-56 overflow-y-auto p-1">
                    {labels.length === 0 ? (
                      <p className="px-2 py-2 text-[12px] text-muted-foreground">
                        No tags yet — create one below.
                      </p>
                    ) : (
                      labels.map((label) => {
                        const on = appliedIds.includes(label.id);
                        return (
                          <div
                            key={label.id}
                            className="group/tag flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-muted"
                          >
                            <button
                              type="button"
                              onClick={() => toggleTag(label)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  background: tagColorVar(
                                    tagColorIndex(label, tagColors),
                                  ),
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {label.name}
                              </span>
                            </button>
                            {on && (
                              <CheckIcon className="size-3.5 shrink-0 text-accent-2-hover" />
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTag(label);
                                setEditName(label.name);
                              }}
                              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 group-hover/tag:opacity-100 hover:bg-foreground/10 hover:text-foreground"
                            >
                              <PencilIcon className="size-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="border-t p-1.5">
                    <input
                      autoFocus
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createTag();
                        }
                      }}
                      placeholder="Create tag…"
                      className="w-full rounded-md bg-background/60 px-2 py-1 text-[12.5px] outline-none placeholder:text-muted-foreground/60"
                    />
                  </div>
                </>
              )}
            </div>,
            document.body,
          )}
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
        <Hint label="Archive">
          <button
            type="button"
            disabled={!email || busy}
            onClick={() => runAction("archive")}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ArchiveIcon className="size-[15px]" />
          </button>
        </Hint>
        <Hint label="Trash">
          <button
            type="button"
            disabled={!email || busy}
            onClick={() => runAction("trash")}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2Icon className="size-[15px]" />
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
          /* Mirrors the real article: subject, sender row (avatar + meta), body.
             Same padding/sizes so the layout doesn't jump when it fills in. */
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
          <article className="mx-auto max-w-[720px] px-[34px] pt-[22px] pb-24">
            <h2 className="text-[21px] leading-[1.3] font-semibold tracking-[-0.5px]">
              {email.subject || "(no subject)"}
            </h2>

            {appliedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {appliedTags.map((label) => (
                  <TagChip
                    key={label.id}
                    label={label}
                    onRemove={() => toggleTag(label)}
                  />
                ))}
              </div>
            )}

            {messages.length > 1 && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                {messages.length} messages
              </p>
            )}
            <div className="mt-3">
              {messages.map((message) => (
                <ThreadMessage
                  key={message.id}
                  message={message}
                  expanded={expandedIds.has(message.id)}
                  onToggle={() => toggleExpand(message.id)}
                  accountColor={accountColor}
                  hour12={clock === "12h"}
                  showTechnicalMetadata={showTechnicalMetadata}
                />
              ))}
            </div>

            {/* Inline reply — stays in the pane and threads under this message. */}
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
                  <textarea
                    autoFocus
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        void sendReply();
                      }
                    }}
                    placeholder="Write your reply…"
                    className="h-32 w-full resize-none rounded-md bg-background/50 p-2.5 text-sm leading-[1.6] outline-none placeholder:text-muted-foreground/60"
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
                    <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                      ⌘↵
                    </span>
                  </div>
                </div>
              ) : replySent ? (
                <button
                  type="button"
                  onClick={startReply}
                  className="mt-6 flex w-full items-center gap-2 rounded-lg border border-accent-2-focus/40 bg-accent-2/10 px-3 py-2 text-left text-[12.5px] text-accent-2-hover hover:bg-accent-2/15"
                >
                  <CheckIcon className="size-3.5" />
                  Reply sent — it&rsquo;ll appear in this thread. Reply again?
                </button>
              ) : null}
            </div>
          </article>
        )}
      </div>

      {/* Floating action bar — over both views, only when a message is open. */}
      {email && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-[3px] rounded-[10px] border bg-popover p-1 shadow-2xl">
          <button type="button" onClick={startReply} className={FBTN_PRIMARY}>
            <ReplyIcon /> Reply
          </button>
          <Hint label="Reply all — soon">
            <button type="button" disabled className={FBTN_ICON}>
              <ReplyAllIcon />
            </button>
          </Hint>
          <Hint label="Forward — soon">
            <button type="button" disabled className={FBTN_ICON}>
              <ForwardIcon />
            </button>
          </Hint>
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
          <Hint label="Toggle raw MIME source (⌥R)">
            <button
              type="button"
              aria-pressed={raw}
              onClick={() => setRaw((current) => !current)}
              className={cn(FBTN_MONO, raw && FBTN_MONO_ON)}
            >
              <CodeXmlIcon /> Raw
            </button>
          </Hint>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button type="button" className={FBTN_MONO} />}
            >
              <DownloadIcon /> Export
              <ChevronUpIcon className="size-3 text-muted-foreground/70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => exportEmail(email, "md")}>
                  <HashIcon />
                  Markdown
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .md
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportEmail(email, "json")}>
                  <BracesIcon className="text-accent-2-hover" />
                  <span className="font-mono text-xs">JSON</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .json
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportEmail(email, "txt")}>
                  <FileTextIcon />
                  Plain text
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    .txt
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(email.messageId)}
                >
                  <ClipboardIcon className="text-accent-2-hover" />
                  <span className="font-mono text-xs">Copy message-ID</span>
                  <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
                    ⌘⇧C
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

/** One message in the conversation — a collapsed one-liner or the full body. */
function ThreadMessage({
  message,
  expanded,
  onToggle,
  accountColor,
  hour12,
  showTechnicalMetadata,
}: {
  message: FullEmail;
  expanded: boolean;
  onToggle: () => void;
  accountColor: string;
  hour12: boolean;
  showTechnicalMetadata: boolean;
}) {
  const sender = parseAddress(message.from);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b py-3 text-left hover:bg-muted/40"
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
          {shortDate(message.date, hour12)}
        </span>
      </button>
    );
  }

  return (
    <div className="border-b py-4 first:pt-0">
      <div className="flex items-start gap-3">
        <SenderAvatar
          name={sender.name}
          address={sender.address}
          color={accountColor}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="shrink-0 cursor-pointer text-sm font-semibold hover:underline"
            >
              {sender.name}
            </button>
            {isVerifiedSender(sender.address) && (
              <Hint label="Verified sender">
                <BadgeCheckIcon className="size-3.5 shrink-0 -translate-y-px self-center text-label-blue" />
              </Hint>
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
              &lt;{sender.address}&gt;
            </span>
            <Hint label={isoDate(message.date)}>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
                {shortDate(message.date, hour12)}
              </span>
            </Hint>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-[7px]">
            <span className="shrink-0 text-[11.5px] text-muted-foreground/70">
              to
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: accountColor }}
              />
              <span className="truncate">{message.to || "—"}</span>
            </span>
          </div>
          {showTechnicalMetadata && message.messageId && (
            <div className="mt-2 font-mono text-[10.5px] break-all text-muted-foreground/70">
              message-id:{" "}
              <span className="text-label-blue">{message.messageId}</span>
            </div>
          )}
        </div>
      </div>
      <div className="pt-[18px]">
        {message.bodyHtml ? (
          <HtmlBody html={message.bodyHtml} />
        ) : (
          (message.body || message.snippet || "(empty message)")
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
            )
        )}
      </div>
    </div>
  );
}

/* Floating-bar button recipes (local compositions — the pill's transparent,
   mono, teal-when-active styling doesn't map onto a stock Button variant). */
const FBTN_PRIMARY =
  "inline-flex h-[30px] cursor-pointer items-center gap-[7px] rounded-[7px] bg-primary px-[13px] text-[12.5px] font-medium text-on-primary transition-colors hover:bg-primary-hover [&_svg]:size-3.5";
const FBTN_ICON =
  "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";
const FBTN_MONO =
  "inline-flex h-[30px] cursor-pointer items-center gap-[7px] rounded-[7px] border border-transparent px-2 font-mono text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5";
const FBTN_MONO_ON =
  "border-accent-2-focus bg-accent-2/15 text-accent-2-hover hover:bg-accent-2/15 hover:text-accent-2-hover";

const isoDate = (raw: string) => {
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
};

/** Reader timestamp: "YYYY-MM-DD · 8:22 PM" (or 24h) — full ISO is the title. */
const shortDate = (raw: string, hour12: boolean) => {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = date.toLocaleTimeString([], {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  });
  return `${ymd} · ${time}`;
};

/** Click-to-insert Gmail search operators shown under the pane search box. */
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

  /* Whichever list is live in this pane — the folder, or the active search. */
  const activeKey = emailsQueryKey(account.accountId, folder, activeQuery);
  const refreshing = useIsFetching({ queryKey: activeKey }) > 0;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: activeKey });
    queryClient.invalidateQueries({ queryKey: accountsQueryKey });
  };

  const iconButton =
    "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent";

  /* Search mode — not draggable, so the input stays focusable. Below the input,
     a row of Gmail operator chips ("intellisense") you can click to insert. */
  if (searchOpen) {
    const insertOperator = (token: string) => {
      const base = search.trim();
      const next = (base ? `${base} ` : "") + token;
      // Value operators (from:, to:, …) leave the cursor ready for the value;
      // complete ones (is:unread) get a trailing space.
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
            placeholder="Search this inbox — try in:important"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {refreshing && (
            <RefreshCwIcon className="size-3 shrink-0 animate-spin text-muted-foreground/70" />
          )}
          <Hint label="Close search (Esc)">
            <button type="button" onClick={onCloseSearch} className={iconButton}>
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
      className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b px-2.5 select-none active:cursor-grabbing"
    >
      <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
      <AccountDot colorIndex={dotIndex} accountId={account.accountId} />
      <span className="min-w-0 truncate font-mono text-xs font-medium">
        {label}
      </span>
      {account.unread > 0 && (
        <span className="shrink-0 font-mono text-[11px] font-medium text-primary">
          {formatCount(account.unread)} new
        </span>
      )}
      <Hint label="Search this inbox">
        <button type="button" onClick={onOpenSearch} className={cn(iconButton, "ml-auto")}>
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
          <RefreshCwIcon className={cn("size-3.5", refreshing && "animate-spin")} />
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

function PaneBody({
  account,
  dotIndex,
  search,
}: {
  account: Account;
  dotIndex: number;
  search: string;
}) {
  const { getOpenEmail, openEmail, folder } = useTiles();
  const { density } = useSettings();
  const query = useEmailsQuery(account.accountId, folder, search);
  const { error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    query;
  const emails = flattenEmails(query.data);
  const searching = search.trim().length > 0;

  /* Infinite scroll: pull the next page as the bottom sentinel nears view. */
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
      {error ? (
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
