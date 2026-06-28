import { useCallback, useEffect, useRef, useState } from "react";

import {
  READER_PANE_ID,
  RESET_TILE_LAYOUT_EVENT,
  SEARCH_INBOX_EVENT,
  TILE_LAYOUT_KEY,
  parseStoredTree,
  type LayoutNode,
  type SearchInboxDetail,
} from "@/lib/layout-tree";
import { TileBoard, type TileStorage } from "@/components/tile-board";

import type { Account } from "@/lib/account";
import { useSettings } from "@/hooks/use-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCount } from "@/lib/format";
import type { Folder } from "@/lib/folders";
import { cn } from "@/lib/utils";
import { AccountDot } from "@/components/shell/account-dot";
import { PANE_TYPES } from "./pane-registry";
import {
  COMPOSE_PANE_ID,
  TilesContext,
  getPaneType,
  splitReaderId,
  type ComposePane,
  type PaneRenderCtx,
  type Reading,
  type TilesCtx,
} from "./tiles-context";

const STORAGE_KEY = TILE_LAYOUT_KEY;

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
  extraPaneIds,
  onClosePanel,
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
  /** Non-email integration panels (by pane id) currently open on the board. */
  extraPaneIds?: string[];
  /** Remove an open panel from the board — a panel's close button calls this. */
  onClosePanel?: (paneId: string) => void;
  /** Portal target for row context menus — set in the landing demo so they stay inside the scaled box. */
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const scoped = accounts.filter((a) => scopeIds.includes(a.accountId));
  const ids = scoped.map((a) => a.accountId);
  const idsKey = ids.join(",");

  const { readerMode } = useSettings();
  const isMobile = useIsMobile();

  const [openEmails, setOpenEmails] = useState<Record<string, string>>({});
  // Mobile is single-column: force the shared reader so opening a message
  // overlays full-screen via the URL, never a 2nd pane.
  const split = readerMode === "split" && !isMobile;

  // Per-pane folder: each pane can show a different folder, falling back to the
  // global (sidebar/route) folder until its header picker overrides it.
  const [paneFolders, setPaneFolders] = useState<Record<string, Folder>>({});
  const paneFoldersRef = useRef(paneFolders);
  paneFoldersRef.current = paneFolders;
  const folderFor = useCallback(
    (accountId: string) => paneFoldersRef.current[accountId] ?? folder,
    [folder],
  );
  const setPaneFolder = useCallback(
    (accountId: string, next: Folder) =>
      setPaneFolders((current) => ({ ...current, [accountId]: next })),
    [],
  );

  const openEmail = useCallback(
    (accountId: string, emailId: string) => {
      // A draft isn't a message to read — open it in the composer to edit/send.
      if (folderFor(accountId) === "drafts" && onEditDraft) {
        onEditDraft(accountId, emailId);
        return;
      }
      if (split)
        setOpenEmails((current) => ({ ...current, [accountId]: emailId }));
      else onOpenEmail(accountId, emailId);
    },
    [folderFor, onEditDraft, split, onOpenEmail],
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
  const paneIds = [
    ...ids,
    ...readerIds,
    ...composeIds,
    ...(extraPaneIds ?? []),
  ];

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on idsKey (the serialized id list); ids/reading/onCloseReader are intentionally read fresh without re-running.
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-subscribe only when the visible id list (idsKey) changes; ids is read fresh inside the handler.
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
  }, [idsKey]);

  const ctx: TilesCtx = {
    accounts,
    removable: scoped.length >= 1,
    onRemovePane,
    folderFor,
    setPaneFolder,
    openEmail,
    getOpenEmail,
    paneSearch,
    openSearch,
    setSearch,
    closeSearch,
    portalContainer,
  };

  const storage: TileStorage = { load: loadStoredTree, save: persistTree };

  // Single dispatch: classify the pane id, then look up its renderer/label in the registry.
  const paneCtx: PaneRenderCtx = {
    accounts,
    reading,
    openEmails,
    compose: compose ?? null,
    closeReaderFor,
    onClosePanel: onClosePanel ?? (() => {}),
  };
  const renderPane = (paneId: string) =>
    PANE_TYPES[getPaneType(paneId)].render(paneId, paneCtx);
  const renderDragLabel = (paneId: string) =>
    PANE_TYPES[getPaneType(paneId)].dragLabel(paneId, paneCtx);

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

/** Single-column board for phones: one inbox at a time (a scrollable tab strip
 *  switches between them), with the shared reader sliding full-screen over the
 *  list when a message is open. No drag-to-arrange or side-by-side panes. */
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

export { COMPOSE_PANE_ID, panelPaneId } from "./tiles-context";
export type { Reading, ComposePane, PaneType } from "./tiles-context";
