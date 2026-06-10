/**
 * The inbox-tiles layout is a recursive split tree (design spec), not a grid.
 * Pure data + operations; rendering and drag interactions live in
 * components/inbox-tiles.tsx. Every operation returns a new tree.
 */

export type SplitDir = "row" | "col";
export type DropZone = "center" | "left" | "right" | "top" | "bottom";

export type PaneNode = { type: "pane"; accountId: string };
export type SplitNode = {
  type: "split";
  id: string;
  dir: SplitDir;
  /** Fractions that sum to 1, one per child. */
  sizes: number[];
  children: LayoutNode[];
};
export type LayoutNode = PaneNode | SplitNode;

export const MIN_PANE_FRACTION = 0.15;

/** Dispatch this on window to restore the default tile layout (⌘K action). */
export const RESET_TILE_LAYOUT_EVENT = "bm:reset-tile-layout";

/** The reader is an ordinary pane in the tree under this reserved id, so it
 *  drags/swaps/splits like an inbox. It only survives validation while a
 *  message is open (the caller includes it in the valid pane ids). */
export const READER_PANE_ID = "__reader__";

const newSplitId = () => crypto.randomUUID();

function split(dir: SplitDir, children: LayoutNode[], sizes: number[]): SplitNode {
  return { type: "split", id: newSplitId(), dir, sizes, children };
}

function pane(accountId: string): PaneNode {
  return { type: "pane", accountId };
}

function paneAccountIds(node: LayoutNode): string[] {
  if (node.type === "pane") return [node.accountId];
  return node.children.flatMap(paneAccountIds);
}

/** Spec default: wide primary pane, remaining accounts stacked on the right. */
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

/** Remove a pane; collapse single-child splits and renormalize sizes. */
function removePane(
  node: LayoutNode,
  accountId: string,
): LayoutNode | null {
  if (node.type === "pane") {
    return node.accountId === accountId ? null : node;
  }

  const kept = node.children
    .map((child, i) => ({ child: removePane(child, accountId), size: node.sizes[i] }))
    .filter((entry): entry is { child: LayoutNode; size: number } => entry.child !== null);

  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0].child;

  const total = kept.reduce((sum, entry) => sum + entry.size, 0);
  return {
    ...node,
    children: kept.map((entry) => entry.child),
    sizes: kept.map((entry) => entry.size / total),
  };
}

/** Replace the target pane with a 50/50 split holding it and the new pane. */
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
    children: node.children.map((child) => swapPanes(child, accountA, accountB)),
  };
}

/**
 * Drop handler: center swaps the two panes; an edge moves the dragged pane
 * (remove first, collapse, then split the target). Self/no-target is a no-op
 * at the call site.
 */
export function movePane(
  tree: LayoutNode,
  sourceAccountId: string,
  targetAccountId: string,
  zone: DropZone,
): LayoutNode {
  if (sourceAccountId === targetAccountId) return tree;
  if (zone === "center") return swapPanes(tree, sourceAccountId, targetAccountId);

  const without = removePane(tree, sourceAccountId);
  if (without === null) return tree; // source was the only pane
  return splitPane(without, targetAccountId, sourceAccountId, zone);
}

/** New accounts dock as a right-side pane (spec: existing 0.66 / new 0.34). */
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
    children: node.children.map((child) => withSplitSizes(child, splitId, sizes)),
  };
}

/**
 * Reconcile a (possibly stale or null) tree with the connected accounts:
 * drop panes for disconnected accounts, dock newly connected ones on the
 * right, fall back to the default layout when nothing survives.
 */
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

/** Parse a stored tree defensively; any malformed node rejects the whole tree. */
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
