import { useEffect, useRef, useState } from "react";

import { useTiles } from "../tiles-context";
import { PaneBody, PaneHeader } from "../pane-chrome";

export function AccountPane({ accountId }: { accountId: string }) {
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

  /* Search state lives on the board (persists across remounts); debounce the
     fetch locally, seeded from it so a remount re-queries instead of clearing. */
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
