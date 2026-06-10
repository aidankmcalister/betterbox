import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckIcon, GripVerticalIcon, XIcon } from "lucide-react";

import {
  MIN_PANE_FRACTION,
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
import { isTestAccount, makeTestEmails } from "@/lib/test-account";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { AccountDot } from "@/components/account-dot";
import {
  EmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/thread-list-states";
import { ThreadRow, type ThreadRowEmail } from "@/components/thread-row";
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

type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  drag: DragState | null;
  beginHeaderDrag: (event: React.PointerEvent, accountId: string) => void;
  resizeSplit: (splitId: string, sizes: number[]) => void;
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

  const [tree, setTree] = useState<LayoutNode | null>(null);
  const hydratedRef = useRef(false);

  /* Hydrate from storage once, then revalidate whenever the scope changes. */
  useEffect(() => {
    setTree((current) => {
      const base = hydratedRef.current ? current : loadStoredTree();
      hydratedRef.current = true;
      const next = validateLayout(base, ids);
      persistTree(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

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

        {drag && draggedAccount && (
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border bg-popover px-2.5 py-1.5 shadow-lg"
            style={{ left: drag.x + 14, top: drag.y + 12 }}
          >
            <AccountDot
              colorIndex={accounts.indexOf(draggedAccount)}
              accountId={draggedAccount.accountId}
            />
            <span className="font-mono text-xs">{draggedAccount.email}</span>
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
  const { accounts, drag } = useTiles();
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
  const dropZone = drag?.target?.accountId === accountId ? drag.target.zone : null;

  return (
    <div
      ref={paneRef}
      data-pane-id={accountId}
      className="relative flex h-full min-w-0 flex-col bg-background"
    >
      <PaneHeader account={account} dotIndex={dotIndex} width={width} />
      <PaneBody account={account} dotIndex={dotIndex} />
      {dropZone && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 border-[1.5px] border-primary bg-primary/15",
            DROP_ZONE_CLASS[dropZone],
          )}
        />
      )}
    </div>
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
  const { density } = useSettings();
  const [emails, setEmails] = useState<ThreadRowEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setEmails(null);
    setError(null);
    if (isTestAccount(account.accountId)) {
      setEmails(makeTestEmails(account.accountId));
      return;
    }
    fetch(`/api/emails?accountId=${account.accountId}&max=50`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setEmails(data.emails ?? []);
      })
      .catch((err: Error) => setError(err.message));
  }, [account.accountId]);

  useEffect(load, [load]);

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      {error ? (
        <ErrorState
          detail={`GET /api/emails · ${error}`}
          onRetry={load}
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
            />
          ))}
          <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70">
            <CheckIcon className="size-3 shrink-0" />
            <span className="min-w-0 truncate">
              50 most recent · fetched live from Gmail
            </span>
          </div>
        </>
      )}
    </div>
  );
}
