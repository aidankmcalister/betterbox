import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  MIN_PANE_FRACTION,
  defaultLayout,
  movePane,
  validateLayout,
  withSplitSizes,
  type DropZone,
  type LayoutNode,
} from "@/lib/layout-tree";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const DRAG_THRESHOLD_PX = 6;

type DragState = {
  paneId: string;
  x: number;
  y: number;
  target: { paneId: string; zone: DropZone } | null;
};

export type TileStorage = {
  load: () => LayoutNode | null;
  save: (tree: LayoutNode | null) => void;
};

type BoardCtx = {
  beginHeaderDrag: (event: React.PointerEvent, paneId: string) => void;
  renderPane: (paneId: string) => ReactNode;
  drag: DragState | null;
  resizeSplit: (splitId: string, sizes: number[]) => void;
};
const BoardContext = createContext<BoardCtx | null>(null);

function useBoard(): BoardCtx {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("Tile components must render inside <TileBoard>");
  return ctx;
}

const NOOP_DRAG = () => {};

/** The pane-header drag starter. Returns a no-op when used outside a
 *  <TileBoard> (e.g. the single-column mobile board renders panes directly), so
 *  ReaderPane / PaneHeader / ComposePane can render without a board. */
export function useTileDrag() {
  const ctx = useContext(BoardContext);
  return ctx?.beginHeaderDrag ?? NOOP_DRAG;
}

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
  sourcePaneId: string,
): DragState["target"] {
  const paneEl = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-pane-id]");
  const paneId = paneEl?.dataset.paneId;
  if (!paneEl || !paneId || paneId === sourcePaneId) return null;
  return { paneId, zone: zoneWithinPane(paneEl.getBoundingClientRect(), x, y) };
}

export function TileBoard({
  paneIds,
  renderPane,
  storage,
  renderDragLabel,
  resetEvent,
  emptyLabel = "Nothing to show.",
}: {
  paneIds: string[];
  renderPane: (paneId: string) => ReactNode;
  storage: TileStorage;
  renderDragLabel?: (paneId: string) => ReactNode;
  resetEvent?: string;
  emptyLabel?: string;
}) {
  const paneIdsKey = paneIds.join(",");
  const [tree, setTree] = useState<LayoutNode | null>(null);
  const hydratedRef = useRef(false);
  // Keep latest closures off the hydrate/reset effect deps.
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const renderPaneRef = useRef(renderPane);
  renderPaneRef.current = renderPane;

  useEffect(() => {
    setTree((current) => {
      const base = hydratedRef.current ? current : storageRef.current.load();
      hydratedRef.current = true;
      const next = validateLayout(base, paneIds);
      storageRef.current.save(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneIdsKey]);

  const mutate = useCallback(
    (update: (tree: LayoutNode | null) => LayoutNode | null) => {
      setTree((current) => {
        const next = update(current);
        storageRef.current.save(next);
        return next;
      });
    },
    [],
  );

  const [drag, setDrag] = useState<DragState | null>(null);

  const commitDrop = useCallback(
    (sourcePaneId: string, target: DragState["target"]) => {
      if (!target) return;
      mutate((current) =>
        current
          ? movePane(current, sourcePaneId, target.paneId, target.zone)
          : current,
      );
    },
    [mutate],
  );

  const beginHeaderDrag = useCallback(
    (event: React.PointerEvent, paneId: string) => {
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
          paneId,
          x: ev.clientX,
          y: ev.clientY,
          target: findDropTarget(ev.clientX, ev.clientY, paneId),
        });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        document.body.classList.remove("bm-dragging");
        if (active) {
          commitDrop(paneId, findDropTarget(ev.clientX, ev.clientY, paneId));
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

  useEffect(() => {
    if (!resetEvent) return;
    const onReset = () => mutate(() => defaultLayout(paneIds));
    window.addEventListener(resetEvent, onReset);
    return () => window.removeEventListener(resetEvent, onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetEvent, mutate, paneIdsKey]);

  const ctx: BoardCtx = { beginHeaderDrag, renderPane, drag, resizeSplit };

  return (
    <BoardContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {tree ? (
            <TileTree node={tree} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>

        {drag && renderDragLabel && (
          <div
            className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-md border bg-popover px-2.5 py-1.5 shadow-lg"
            style={{ left: drag.x + 14, top: drag.y + 12 }}
          >
            {renderDragLabel(drag.paneId)}
          </div>
        )}
      </div>
    </BoardContext.Provider>
  );
}

const childKey = (child: LayoutNode) =>
  child.type === "pane" ? child.accountId : child.id;

function TileTree({ node }: { node: LayoutNode }) {
  const { resizeSplit } = useBoard();

  if (node.type === "pane") return <BoardPane paneId={node.accountId} />;

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
      onLayoutChanged={(layout) => {
        const grows = node.children.map(
          (child) => layout[childKey(child)] ?? 1,
        );
        const total = grows.reduce((sum, grow) => sum + grow, 0);
        if (total > 0)
          resizeSplit(
            node.id,
            grows.map((grow) => grow / total),
          );
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

const DROP_ZONE_CLASS: Record<DropZone, string> = {
  center: "inset-[15%]",
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
};

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

function BoardPane({ paneId }: { paneId: string }) {
  const { drag, renderPane } = useBoard();
  const zone = drag?.target?.paneId === paneId ? drag.target.zone : null;
  return (
    <div data-pane-id={paneId} className="relative h-full min-w-0">
      {renderPane(paneId)}
      {zone && <DropOverlay zone={zone} />}
    </div>
  );
}
