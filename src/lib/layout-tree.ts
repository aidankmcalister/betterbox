export type SplitDir = "row" | "col";
export type DropZone = "center" | "left" | "right" | "top" | "bottom";

export type PaneNode = { type: "pane"; accountId: string };
export type SplitNode = {
  type: "split";
  id: string;
  dir: SplitDir;
  sizes: number[];
  children: LayoutNode[];
};
export type LayoutNode = PaneNode | SplitNode;

export const MIN_PANE_FRACTION = 0.15;

/** Dispatch on window to restore the default tile layout (⌘K action). */
export const RESET_TILE_LAYOUT_EVENT = "bm:reset-tile-layout";

/** ⌘K "Search in …": run a query in a pane's in-pane search. accountId "all" = every visible pane. */
export const SEARCH_INBOX_EVENT = "bm:search-inbox";
export type SearchInboxDetail = { accountId: string | "all"; query: string };

/** Reserved id: reader is an ordinary pane (drags/swaps/splits like an inbox); survives validation only while a message is open. */
export const READER_PANE_ID = "__reader__";

const newSplitId = () => crypto.randomUUID();

function split(
  dir: SplitDir,
  children: LayoutNode[],
  sizes: number[],
): SplitNode {
  return { type: "split", id: newSplitId(), dir, sizes, children };
}

function pane(accountId: string): PaneNode {
  return { type: "pane", accountId };
}

function paneAccountIds(node: LayoutNode): string[] {
  if (node.type === "pane") return [node.accountId];
  return node.children.flatMap(paneAccountIds);
}

export function defaultLayout(accountIds: string[]): LayoutNode | null {
  if (accountIds.length === 0) return null;
  if (accountIds.length === 1) return pane(accountIds[0]);

  const [primary, ...rest] = accountIds;
  const stack =
    rest.length === 1
      ? pane(rest[0])
      : split("col", rest.map(pane), evenSizes(rest.length));
  return split("row", [pane(primary), stack], [0.6, 0.4]);
}

function evenSizes(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

function removePane(node: LayoutNode, accountId: string): LayoutNode | null {
  if (node.type === "pane") {
    return node.accountId === accountId ? null : node;
  }

  const kept = node.children
    .map((child, i) => ({
      child: removePane(child, accountId),
      size: node.sizes[i],
    }))
    .filter(
      (entry): entry is { child: LayoutNode; size: number } =>
        entry.child !== null,
    );

  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0].child;

  const total = kept.reduce((sum, entry) => sum + entry.size, 0);
  return {
    ...node,
    children: kept.map((entry) => entry.child),
    sizes: kept.map((entry) => entry.size / total),
  };
}

function splitPane(
  node: LayoutNode,
  targetAccountId: string,
  newAccountId: string,
  zone: Exclude<DropZone, "center">,
): LayoutNode {
  if (node.type === "pane") {
    if (node.accountId !== targetAccountId) return node;
    const dir: SplitDir = zone === "left" || zone === "right" ? "row" : "col";
    const incoming = pane(newAccountId);
    const children =
      zone === "left" || zone === "top" ? [incoming, node] : [node, incoming];
    return split(dir, children, [0.5, 0.5]);
  }
  return {
    ...node,
    children: node.children.map((child) =>
      splitPane(child, targetAccountId, newAccountId, zone),
    ),
  };
}

function swapPanes(
  node: LayoutNode,
  accountA: string,
  accountB: string,
): LayoutNode {
  if (node.type === "pane") {
    if (node.accountId === accountA) return pane(accountB);
    if (node.accountId === accountB) return pane(accountA);
    return node;
  }
  return {
    ...node,
    children: node.children.map((child) =>
      swapPanes(child, accountA, accountB),
    ),
  };
}

/** center = swap; edge = remove-then-split. Self-drop is a no-op at the call site. */
export function movePane(
  tree: LayoutNode,
  sourceAccountId: string,
  targetAccountId: string,
  zone: DropZone,
): LayoutNode {
  if (sourceAccountId === targetAccountId) return tree;
  if (zone === "center")
    return swapPanes(tree, sourceAccountId, targetAccountId);

  const without = removePane(tree, sourceAccountId);
  if (without === null) return tree; // source was the only pane
  return splitPane(without, targetAccountId, sourceAccountId, zone);
}

function appendPaneRight(
  tree: LayoutNode | null,
  accountId: string,
): LayoutNode {
  if (tree === null) return pane(accountId);
  return split("row", [tree, pane(accountId)], [0.66, 0.34]);
}

export function withSplitSizes(
  node: LayoutNode,
  splitId: string,
  sizes: number[],
): LayoutNode {
  if (node.type === "pane") return node;
  if (node.id === splitId && sizes.length === node.children.length) {
    return { ...node, sizes };
  }
  return {
    ...node,
    children: node.children.map((child) =>
      withSplitSizes(child, splitId, sizes),
    ),
  };
}

export function validateLayout(
  tree: LayoutNode | null,
  accountIds: string[],
): LayoutNode | null {
  if (accountIds.length === 0) return null;
  if (tree === null) return defaultLayout(accountIds);

  let next: LayoutNode | null = tree;
  for (const staleId of paneAccountIds(tree)) {
    if (!accountIds.includes(staleId) && next !== null) {
      next = removePane(next, staleId);
    }
  }
  const present = next === null ? [] : paneAccountIds(next);
  for (const accountId of accountIds) {
    if (!present.includes(accountId)) {
      next = appendPaneRight(next, accountId);
    }
  }
  return next ?? defaultLayout(accountIds);
}

export function parseStoredTree(value: unknown): LayoutNode | null {
  return isLayoutNode(value) ? value : null;
}

function isLayoutNode(value: unknown): value is LayoutNode {
  if (typeof value !== "object" || value === null) return false;
  const node = value as Record<string, unknown>;
  if (node.type === "pane") return typeof node.accountId === "string";
  if (node.type === "split") {
    return (
      typeof node.id === "string" &&
      (node.dir === "row" || node.dir === "col") &&
      Array.isArray(node.sizes) &&
      node.sizes.every((size) => typeof size === "number") &&
      Array.isArray(node.children) &&
      node.children.length === node.sizes.length &&
      node.children.length >= 2 &&
      node.children.every(isLayoutNode)
    );
  }
  return false;
}

/** localStorage key for the live tile layout (the board persists here). */
export const TILE_LAYOUT_KEY = "bm.tiles-layout";

/** The tile layout the board currently persists, or null (= default layout). */
export function loadCurrentLayout(): LayoutNode | null {
  try {
    const raw = localStorage.getItem(TILE_LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; tree?: unknown };
    return parsed?.v === 3 ? parseStoredTree(parsed.tree) : null;
  } catch {
    return null;
  }
}

/** Dispatch on window to apply a layout (restore a saved workspace); the board
 *  re-validates it against the current accounts. */
export const APPLY_TILE_LAYOUT_EVENT = "bm:apply-tile-layout";
export type ApplyTileLayoutDetail = { tree: LayoutNode };

export function applyTileLayout(tree: LayoutNode): void {
  window.dispatchEvent(
    new CustomEvent<ApplyTileLayoutDetail>(APPLY_TILE_LAYOUT_EVENT, {
      detail: { tree },
    }),
  );
}

/** A named board layout the user can re-summon from the command palette. */
export type Workspace = { id: string; name: string; tree: LayoutNode };

const WORKSPACES_KEY = "bm.workspaces";

export function listWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((w): Workspace[] => {
      if (typeof w !== "object" || w === null) return [];
      const { id, name, tree } = w as Record<string, unknown>;
      const validTree = parseStoredTree(tree);
      if (typeof id !== "string" || typeof name !== "string" || !validTree) {
        return [];
      }
      return [{ id, name, tree: validTree }];
    });
  } catch {
    return [];
  }
}

function writeWorkspaces(list: Workspace[]): Workspace[] {
  try {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — workspaces just won't persist
  }
  return list;
}

/** Save a layout under a name (replacing any existing one with that name). */
export function saveWorkspace(name: string, tree: LayoutNode): Workspace[] {
  const trimmed = name.trim();
  if (!trimmed) return listWorkspaces();
  const rest = listWorkspaces().filter(
    (w) => w.name.toLowerCase() !== trimmed.toLowerCase(),
  );
  return writeWorkspaces([
    ...rest,
    { id: crypto.randomUUID(), name: trimmed, tree },
  ]);
}

export function removeWorkspace(id: string): Workspace[] {
  return writeWorkspaces(listWorkspaces().filter((w) => w.id !== id));
}
