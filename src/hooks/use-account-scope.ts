import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "bm.account-scope";

type Stored = string[] | "all";

/**
 * The view-builder scope: which accounts are in the composed view.
 * Persisted to localStorage; the last account can't be removed (design rule).
 */
export function useAccountScope(accountIds: string[]) {
  const [stored, setStored] = useState<Stored>("all");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      setStored(JSON.parse(raw) as Stored);
    } catch {
      // ignore corrupt state; fall back to all accounts
    }
  }, []);

  const kept =
    stored === "all"
      ? accountIds
      : stored.filter((id) => accountIds.includes(id));
  const scopeIds = kept.length > 0 ? kept : accountIds;
  const allOn = scopeIds.length === accountIds.length;

  const toggle = useCallback(
    (id: string | "all") => {
      let next: Stored;
      if (id === "all") {
        next = "all";
      } else {
        const current = new Set(scopeIds);
        if (current.has(id)) {
          current.delete(id);
        } else {
          current.add(id);
        }
        next = current.size === accountIds.length ? "all" : [...current];
      }
      setStored(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [scopeIds, accountIds],
  );

  /** Scope the view to a single account (⌘K "Switch to …"). */
  const only = useCallback(
    (id: string) => {
      if (!accountIds.includes(id)) return;
      const next: Stored = accountIds.length === 1 ? "all" : [id];
      setStored(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [accountIds],
  );

  return { scopeIds, allOn, toggle, only };
}
