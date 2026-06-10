import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArchiveIcon,
  BracesIcon,
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
  ReplyAllIcon,
  ReplyIcon,
  SendIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  MIN_PANE_FRACTION,
  READER_PANE_ID,
  RESET_TILE_LAYOUT_EVENT,
  defaultLayout,
  movePane,
  parseStoredTree,
  validateLayout,
  withSplitSizes,
  type DropZone,
  type LayoutNode,
} from "@/lib/layout-tree";
import type { Account } from "@/lib/account";
import { linkGoogle } from "@/lib/auth-client";
import { formatCount } from "@/lib/format";
import { exportEmail } from "@/lib/export-email";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountsQueryKey,
  actOnEmail,
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
import type { Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountDot, useAccountColor } from "@/components/account-dot";
import type { ComposeReply } from "@/components/composer";
import { HtmlBody } from "@/components/html-body";
import { RawView } from "@/components/raw-view";
import { SenderAvatar } from "@/components/sender-avatar";
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
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const STORAGE_KEY = "bm.tiles-layout";
const DRAG_THRESHOLD_PX = 6;
/** Below this pane width the header shows the short handle, not the email. */
const FULL_EMAIL_MIN_WIDTH = 330;

type DragState = {
  accountId: string;
  x: number;
  y: number;
  target: { accountId: string; zone: DropZone } | null;
};

/** The open message — now URL-driven (/email/$id?account=…) by the layout. */
export type Reading = { accountId: string; emailId: string };

type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  drag: DragState | null;
  beginHeaderDrag: (event: React.PointerEvent, accountId: string) => void;
  resizeSplit: (splitId: string, sizes: number[]) => void;
  folder: Folder;
  reading: Reading | null;
  openEmail: (accountId: string, emailId: string) => void;
  closeReader: () => void;
  onReply: (reply: ComposeReply) => void;
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

// ── Drop-zone hit testing ────────────────────────────────────────────────────

/** Central 40% box swaps; otherwise the nearest edge wins (design spec). */
function zoneWithinPane(rect: DOMRect, x: number, y: number): DropZone {
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  if (Math.abs(dx) < rect.width * 0.2 && Math.abs(dy) < rect.height * 0.2) {
    return "center";
  }
  const toLeft = (x - rect.left) / rect.width;
  const toTop = (y - rect.top) / rect.height;
  const nearest = Math.min(toLeft, 1 - toLeft, toTop, 1 - toTop);
  if (nearest === toLeft) return "left";
  if (nearest === 1 - toLeft) return "right";
  return nearest === toTop ? "top" : "bottom";
}

function findDropTarget(
  x: number,
  y: number,
  sourceAccountId: string,
): DragState["target"] {
  const paneEl = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-pane-id]");
  const accountId = paneEl?.dataset.paneId;
  if (!paneEl || !accountId || accountId === sourceAccountId) return null;
  return { accountId, zone: zoneWithinPane(paneEl.getBoundingClientRect(), x, y) };
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
  onReply,
}: {
  accounts: Account[];
  scopeIds: string[];
  folder: Folder;
  reading: Reading | null;
  onOpenEmail: (accountId: string, emailId: string) => void;
  onCloseReader: () => void;
  onRemovePane: (accountId: string) => void;
  onReply: (reply: ComposeReply) => void;
}) {
  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const ids = scoped.map((a) => a.accountId);
  const idsKey = ids.join(",");

  /* The open message is URL state; while set, the reader pane is part of the
     layout tree (it docks right by default and drags/swaps like any pane). */
  const paneIds = reading ? [...ids, READER_PANE_ID] : ids;
  const paneIdsKey = paneIds.join(",");

  useEffect(() => {
    if (reading && !ids.includes(reading.accountId)) onCloseReader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const [tree, setTree] = useState<LayoutNode | null>(null);
  const hydratedRef = useRef(false);

  /* Hydrate from storage once, then revalidate whenever panes change. */
  useEffect(() => {
    setTree((current) => {
      const base = hydratedRef.current ? current : loadStoredTree();
      hydratedRef.current = true;
      const next = validateLayout(base, paneIds);
      persistTree(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneIdsKey]);

  const mutate = useCallback(
    (update: (tree: LayoutNode | null) => LayoutNode | null) => {
      setTree((current) => {
        const next = update(current);
        persistTree(next);
        return next;
      });
    },
    [],
  );

  const [drag, setDrag] = useState<DragState | null>(null);

  const commitDrop = useCallback(
    (sourceAccountId: string, target: DragState["target"]) => {
      if (!target) return;
      mutate((current) =>
        current
          ? movePane(current, sourceAccountId, target.accountId, target.zone)
          : current,
      );
    },
    [mutate],
  );

  const beginHeaderDrag = useCallback(
    (event: React.PointerEvent, accountId: string) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;
      const start = { x: event.clientX, y: event.clientY };
      let active = false;

      const onMove = (ev: PointerEvent) => {
        if (!active) {
          const moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
          if (moved < DRAG_THRESHOLD_PX) return;
          active = true;
          document.body.classList.add("bm-dragging");
        }
        ev.preventDefault();
        setDrag({
          accountId,
          x: ev.clientX,
          y: ev.clientY,
          target: findDropTarget(ev.clientX, ev.clientY, accountId),
        });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        document.body.classList.remove("bm-dragging");
        if (active) {
          commitDrop(accountId, findDropTarget(ev.clientX, ev.clientY, accountId));
        }
        setDrag(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [commitDrop],
  );

  const resizeSplit = useCallback(
    (splitId: string, sizes: number[]) => {
      mutate((current) =>
        current ? withSplitSizes(current, splitId, sizes) : current,
      );
    },
    [mutate],
  );

  const ctx: TilesCtx = {
    accounts,
    removable: scoped.length > 1,
    onRemovePane,
    drag,
    beginHeaderDrag,
    resizeSplit,
    folder,
    reading,
    openEmail: onOpenEmail,
    closeReader: onCloseReader,
    onReply,
  };

  /* Reset is triggered from the command palette (no tiles toolbar). */
  useEffect(() => {
    const onReset = () => mutate(() => defaultLayout(ids));
    window.addEventListener(RESET_TILE_LAYOUT_EVENT, onReset);
    return () => window.removeEventListener(RESET_TILE_LAYOUT_EVENT, onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate, idsKey]);

  const draggedAccount = drag
    ? accounts.find((a) => a.accountId === drag.accountId)
    : null;

  return (
    <TilesContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {tree ? (
            <TileTree node={tree} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              No linked accounts.
            </p>
          )}
        </div>

        {drag && (
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border bg-popover px-2.5 py-1.5 shadow-lg"
            style={{ left: drag.x + 14, top: drag.y + 12 }}
          >
            {draggedAccount ? (
              <>
                <AccountDot
                  colorIndex={accounts.indexOf(draggedAccount)}
                  accountId={draggedAccount.accountId}
                />
                <span className="font-mono text-xs">
                  {draggedAccount.email}
                </span>
              </>
            ) : (
              <>
                <MailOpenIcon className="size-3.5 text-muted-foreground" />
                <span className="text-xs">Reading pane</span>
              </>
            )}
          </div>
        )}
      </div>
    </TilesContext.Provider>
  );
}

// ── Recursive tree rendering ─────────────────────────────────────────────────

const childKey = (child: LayoutNode) =>
  child.type === "pane" ? child.accountId : child.id;

function TileTree({ node }: { node: LayoutNode }) {
  const { resizeSplit } = useTiles();

  if (node.type === "pane") return <TilePane accountId={node.accountId} />;

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
      onLayoutChanged={(layout) => {
        const grows = node.children.map((child) => layout[childKey(child)] ?? 1);
        const total = grows.reduce((sum, grow) => sum + grow, 0);
        if (total > 0) resizeSplit(node.id, grows.map((grow) => grow / total));
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={childKey(child)}>
          {i > 0 && (
            <ResizableHandle className="transition-colors hover:bg-primary data-[resize-handle-state=drag]:bg-primary" />
          )}
          <ResizablePanel
            id={childKey(child)}
            defaultSize={`${node.sizes[i] * 100}%`}
            minSize={`${MIN_PANE_FRACTION * 100}%`}
            className="min-h-0 min-w-0"
          >
            <TileTree node={child} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

// ── Pane ─────────────────────────────────────────────────────────────────────

const DROP_ZONE_CLASS: Record<DropZone, string> = {
  center: "inset-[15%]",
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
};

function TilePane({ accountId }: { accountId: string }) {
  const { drag } = useTiles();
  const dropZone =
    drag?.target?.accountId === accountId ? drag.target.zone : null;

  if (accountId === READER_PANE_ID) {
    return (
      <div
        data-pane-id={READER_PANE_ID}
        className="relative flex h-full min-w-0 flex-col bg-background"
      >
        <ReaderPane />
        {dropZone && <DropOverlay zone={dropZone} />}
      </div>
    );
  }

  return <AccountPane accountId={accountId} dropZone={dropZone} />;
}

function DropOverlay({ zone }: { zone: DropZone }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 border-[1.5px] border-primary bg-primary/15",
        DROP_ZONE_CLASS[zone],
      )}
    />
  );
}

function AccountPane({
  accountId,
  dropZone,
}: {
  accountId: string;
  dropZone: DropZone | null;
}) {
  const { accounts } = useTiles();
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

  if (!account) return null;

  return (
    <div
      ref={paneRef}
      data-pane-id={accountId}
      className="relative flex h-full min-w-0 flex-col bg-background"
    >
      <PaneHeader account={account} dotIndex={dotIndex} width={width} />
      <PaneBody account={account} dotIndex={dotIndex} />
      {dropZone && <DropOverlay zone={dropZone} />}
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
function ReaderPane() {
  const { reading, accounts, beginHeaderDrag, closeReader, folder } = useTiles();
  const { showTechnicalMetadata, clock, markRead } = useSettings();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [starred, setStarred] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const replyRef = useRef<HTMLDivElement>(null);

  const accountId = reading?.accountId ?? "";
  const emailId = reading?.emailId ?? null;
  const fullQuery = useFullEmailQuery(accountId, emailId);
  const rawQuery = useRawEmailQuery(accountId, emailId, raw);

  const email = fullQuery.data;
  const dotIndex = accounts.findIndex((a) => a.accountId === accountId);
  const accountColor = useAccountColor(Math.max(dotIndex, 0), accountId);
  const sender = email ? parseAddress(email.from) : null;

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
      closeReader();
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
        else closeReader();
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
  }, [closeReader, email, sender, replyOpen]);

  return (
    <>
      {/* Title strip — context + quiet management, draggable like any pane.
          The action buttons live in the floating bar, not up here. */}
      <div
        onPointerDown={(event) => beginHeaderDrag(event, READER_PANE_ID)}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-[9px] border-b px-2.5 select-none active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <MailOpenIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
          {email?.subject || "Reading"}
        </span>
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
            onClick={closeReader}
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
          <div className="mx-auto flex max-w-[720px] flex-col gap-3 px-8 py-6">
            <div className="h-5 w-2/3 rounded bg-accent" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="mt-3 h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
            <div className="h-3 w-4/6 rounded bg-muted" />
          </div>
        ) : (
          <article className="mx-auto max-w-[720px] px-[34px] pt-[22px] pb-24">
            <h2 className="text-[21px] leading-[1.3] font-semibold tracking-[-0.5px]">
              {email.subject || "(no subject)"}
            </h2>

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
    </>
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

function PaneHeader({
  account,
  dotIndex,
  width,
}: {
  account: Account;
  dotIndex: number;
  width: number;
}) {
  const { removable, onRemovePane, beginHeaderDrag } = useTiles();
  const label =
    width >= FULL_EMAIL_MIN_WIDTH || width === 0
      ? account.email || account.accountId
      : account.email.split("@")[0] || account.accountId;

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
      {removable && (
        <Hint label={`Remove ${account.email} from view`}>
          <button
            type="button"
            onClick={() => onRemovePane(account.accountId)}
            className="ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
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
}: {
  account: Account;
  dotIndex: number;
}) {
  const { reading, openEmail, folder } = useTiles();
  const { density } = useSettings();
  const query = useEmailsQuery(account.accountId, folder);
  const { error, refetch } = query;
  const emails = flattenEmails(query.data);

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      {error ? (
        <ErrorState
          detail={`GET /api/emails · ${error.message}`}
          onRetry={() => refetch()}
          onReconnect={() => linkGoogle()}
        />
      ) : !emails ? (
        <SkeletonRows density={density} />
      ) : emails.length === 0 ? (
        <EmptyState folder={folder} />
      ) : (
        <>
          {emails.map((email) => (
            <ThreadRow
              key={email.id}
              email={email}
              density={density}
              dotIndex={dotIndex}
              accountId={account.accountId}
              selected={
                reading?.accountId === account.accountId &&
                reading.emailId === email.id
              }
              onClick={() => openEmail(account.accountId, email.id)}
            />
          ))}
          {query.hasNextPage ? (
            <div className="flex items-center justify-center p-2">
              <Button
                variant="ghost"
                size="xs"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
                className="font-mono text-[10.5px] text-muted-foreground"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load 50 more"}
              </Button>
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
