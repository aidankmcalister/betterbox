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
  CheckIcon,
  GripVerticalIcon,
  MailOpenIcon,
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
import {
  flattenEmails,
  useEmailsQuery,
  useFullEmailQuery,
} from "@/lib/mail-queries";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountDot } from "@/components/account-dot";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/thread-list-states";
import { ThreadRow } from "@/components/thread-row";
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

type Reading = { accountId: string; emailId: string };

type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  drag: DragState | null;
  beginHeaderDrag: (event: React.PointerEvent, accountId: string) => void;
  resizeSplit: (splitId: string, sizes: number[]) => void;
  reading: Reading | null;
  openEmail: (accountId: string, emailId: string) => void;
  closeReader: () => void;
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
  onRemovePane,
}: {
  accounts: Account[];
  scopeIds: string[];
  onRemovePane: (accountId: string) => void;
}) {
  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const ids = scoped.map((a) => a.accountId);
  const idsKey = ids.join(",");

  /* The open message. While set, the reader pane is part of the layout tree
     (it docks right by default and drags/swaps like any inbox pane). */
  const [reading, setReading] = useState<Reading | null>(null);
  const paneIds = reading ? [...ids, READER_PANE_ID] : ids;
  const paneIdsKey = paneIds.join(",");

  useEffect(() => {
    if (reading && !ids.includes(reading.accountId)) setReading(null);
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

  const openEmail = useCallback(
    (accountId: string, emailId: string) => setReading({ accountId, emailId }),
    [],
  );
  const closeReader = useCallback(() => setReading(null), []);

  const ctx: TilesCtx = {
    accounts,
    removable: scoped.length > 1,
    onRemovePane,
    drag,
    beginHeaderDrag,
    resizeSplit,
    reading,
    openEmail,
    closeReader,
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
  const { reading, beginHeaderDrag, closeReader } = useTiles();
  const { showTechnicalMetadata } = useSettings();
  const query = useFullEmailQuery(
    reading?.accountId ?? "",
    reading?.emailId ?? null,
  );
  const email = query.data;
  const sender = email ? parseAddress(email.from) : null;
  const sentAt = email ? new Date(email.date) : null;

  return (
    <>
      <div
        onPointerDown={(event) => beginHeaderDrag(event, READER_PANE_ID)}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b px-2.5 select-none active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
        <MailOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs font-medium">
          {email?.subject || "Reading"}
        </span>
        <button
          type="button"
          title="Close reader"
          onClick={closeReader}
          className="ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {query.error ? (
          <ErrorState
            detail={`GET /api/message · ${query.error.message}`}
            onRetry={() => query.refetch()}
            onReconnect={() => linkGoogle()}
          />
        ) : !email ? (
          <div className="flex flex-col gap-3 p-5">
            <div className="h-5 w-2/3 rounded bg-accent" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="mt-3 h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
            <div className="h-3 w-4/6 rounded bg-muted" />
          </div>
        ) : (
          <article className="px-5 py-4">
            <h2 className="text-[21px] leading-snug font-semibold tracking-[-0.5px]">
              {email.subject || "(no subject)"}
            </h2>
            <div className="mt-2.5 flex flex-col gap-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 text-[13px] font-semibold">
                  {sender?.name}
                </span>
                <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                  &lt;{sender?.address}&gt;
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground/70">
                {sentAt && !Number.isNaN(sentAt.getTime())
                  ? sentAt.toISOString()
                  : email.date}
              </span>
              {email.to && (
                <span className="truncate font-mono text-[11px] text-muted-foreground/70">
                  to {email.to}
                </span>
              )}
              {showTechnicalMetadata && email.messageId && (
                <span className="font-mono text-[11px] break-all text-muted-foreground/70">
                  message-id: {email.messageId}
                </span>
              )}
            </div>
            <div className="my-4 border-t" />
            <div className="text-sm leading-[1.65] whitespace-pre-wrap text-foreground/85">
              {email.body || email.snippet || "(empty message)"}
            </div>
          </article>
        )}
      </div>
    </>
  );
}

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
        <button
          type="button"
          title={`Remove ${account.email} from view`}
          onClick={() => onRemovePane(account.accountId)}
          className="ml-auto inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
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
  const { reading, openEmail } = useTiles();
  const { density } = useSettings();
  const query = useEmailsQuery(account.accountId);
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
        <EmptyState />
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
