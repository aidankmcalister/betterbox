import { createContext, useContext } from "react";

import { READER_PANE_ID } from "@/lib/layout-tree";
import type { Account } from "@/lib/account";
import type { Folder } from "@/lib/folders";
import type { ComposerContent } from "@/components/editor/composer";

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

export const splitReaderId = (accountId: string) =>
  `${READER_PANE_ID}:${accountId}`;

// ── Panel registry ──────────────────────────────────────────────────────────
// Non-email integration panels (GitHub PRs, …) dropped onto the board on demand.
// Each has a stable key (pane id = `panelPaneId(key)`); adding one is a single
// entry here — getPaneType and the board dispatch never change.
export const PANEL_PREFIX = "__panel__:";
export const panelPaneId = (key: string) => `${PANEL_PREFIX}${key}`;
export const panelKeyOf = (paneId: string) => paneId.slice(PANEL_PREFIX.length);

// ── Pane-type registry ──────────────────────────────────────────────────────
// Pane type is derived from the opaque pane id's shape (getPaneType); each type
// maps to its renderer + drag label. A new type adds a getPaneType branch and a
// registry entry — the board's dispatch never changes.
export type PaneType = "email" | "reader" | "composer" | "panel";

export function getPaneType(paneId: string): PaneType {
  if (paneId === COMPOSE_PANE_ID) return "composer";
  if (paneId === READER_PANE_ID || paneId.startsWith(`${READER_PANE_ID}:`)) {
    return "reader";
  }
  if (paneId.startsWith(PANEL_PREFIX)) return "panel";
  return "email";
}

/** Everything a pane renderer/drag-label needs from the board's live state. */
export type PaneRenderCtx = {
  accounts: Account[];
  reading: Reading | null;
  openEmails: Record<string, string>;
  compose: ComposePane | null;
  closeReaderFor: (accountId: string) => void;
  /** Close a non-email panel (removes it from the board). */
  onClosePanel: (paneId: string) => void;
};

export type TilesCtx = {
  accounts: Account[];
  removable: boolean;
  onRemovePane: (accountId: string) => void;
  /** This pane's folder — per-pane, so two inboxes can show different folders. */
  folderFor: (accountId: string) => Folder;
  setPaneFolder: (accountId: string, folder: Folder) => void;
  openEmail: (accountId: string, emailId: string) => void;
  getOpenEmail: (accountId: string) => string | null;
  /* Per-account search lives here (not in the pane) so it survives pane remounts
     on layout change — e.g. docking the reader. Absent = closed. */
  paneSearch: Record<string, string>;
  openSearch: (accountId: string) => void;
  setSearch: (accountId: string, query: string) => void;
  closeSearch: (accountId: string) => void;
  /** Portal target for row context menus (set in the landing demo). */
  portalContainer?: React.RefObject<HTMLElement | null>;
};

export const TilesContext = createContext<TilesCtx | null>(null);

export function useTiles(): TilesCtx {
  const ctx = useContext(TilesContext);
  if (!ctx) throw new Error("Tile components must render inside InboxTiles");
  return ctx;
}
