import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  RefreshCwIcon,
  SearchIcon,
  GripVerticalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { useTileDrag } from "@/components/tile-board";
import { toast } from "sonner";

import type { Account } from "@/lib/account";
import { linkGoogle } from "@/lib/auth/auth-client";
import { formatCount } from "@/lib/format";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import {
  accountsQueryKey,
  deleteDraft,
  emailsQueryKey,
  flattenEmails,
  useEmailsQuery,
} from "@/lib/mail-queries";
import { useSettings } from "@/hooks/use-settings";
import { FOLDERS, type Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountDot } from "@/components/shell/account-dot";
import { LabeledView } from "@/components/mail/labeled-view";
import { Hint } from "@/components/ui/tooltip";
import {
  FolderEmptyState,
  ErrorState,
  SkeletonRows,
} from "@/components/mail/thread-list-states";
import { ThreadRow } from "@/components/mail/thread-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTiles } from "./tiles-context";

const FULL_EMAIL_MIN_WIDTH = 330;

export const BAR_PRIMARY =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-[7px] rounded-lg bg-primary px-3.5 text-[13px] font-medium text-on-primary transition-colors hover:bg-primary-hover [&_svg]:size-3.5";
export const BAR_SEC =
  "inline-flex h-8 cursor-pointer items-center gap-[7px] rounded-lg border bg-secondary px-3 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-popover hover:text-foreground [&_svg]:size-3.5 [&_svg]:text-muted-foreground";
export const BAR_ICON =
  "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&_svg]:size-[15px] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

export const SEARCH_OPERATORS: { token: string; hint: string }[] = [
  { token: "is:unread", hint: "Unread only" },
  { token: "is:starred", hint: "Starred only" },
  { token: "from:", hint: "From a sender" },
  { token: "to:", hint: "Sent to someone" },
  { token: "subject:", hint: "Words in the subject" },
  { token: "has:attachment", hint: "Has an attachment" },
  { token: "newer_than:7d", hint: "Last 7 days" },
  { token: "after:2026/01/01", hint: "After a date (YYYY/MM/DD)" },
  { token: "in:important", hint: "Marked important" },
];

/** Per-pane folder switcher in the header — changes only this pane's folder. A
 *  button, so the pane-header drag (which ignores buttons) won't fire on open. */
export function FolderPicker({
  folder,
  onSelect,
}: {
  folder: Folder;
  onSelect: (folder: Folder) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[11px] text-muted-foreground/70 capitalize hover:bg-muted hover:text-foreground"
          />
        }
      >
        {folder}
        <ChevronDownIcon className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-32">
        {FOLDERS.map((f) => (
          <DropdownMenuItem
            key={f}
            onClick={() => onSelect(f)}
            className="font-mono text-[12px] capitalize"
          >
            {f}
            {f === folder && <CheckIcon className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PaneHeader({
  account,
  dotIndex,
  width,
  searchOpen,
  onOpenSearch,
  onCloseSearch,
  search,
  onSearchChange,
  activeQuery,
}: {
  account: Account;
  dotIndex: number;
  width: number;
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  activeQuery: string;
}) {
  const { removable, onRemovePane, folderFor, setPaneFolder } = useTiles();
  const folder = folderFor(account.accountId);
  const beginHeaderDrag = useTileDrag();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const label =
    width >= FULL_EMAIL_MIN_WIDTH || width === 0
      ? account.email || account.accountId
      : account.email.split("@")[0] || account.accountId;

  const activeKey = emailsQueryKey(account.accountId, folder, activeQuery);
  const refreshing = useIsFetching({ queryKey: activeKey }) > 0;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: activeKey });
    queryClient.invalidateQueries({ queryKey: accountsQueryKey });
  };

  const iconButton =
    "inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent";

  if (searchOpen) {
    const insertOperator = (token: string) => {
      const base = search.trim();
      const next = (base ? `${base} ` : "") + token;
      // Value operators (from:, to:, …) keep the cursor trailing; complete tokens get a space.
      onSearchChange(token.endsWith(":") ? next : `${next} `);
      searchInputRef.current?.focus();
    };
    return (
      <div className="shrink-0 border-b">
        <div className="flex h-9 items-center gap-1.5 px-2.5">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          <input
            ref={searchInputRef}
            // biome-ignore lint/a11y/noAutofocus: focus the in-pane search field the moment it opens (it replaces the header on demand).
            autoFocus
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCloseSearch();
            }}
            placeholder="Search this inbox, try in:important"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
          {refreshing && (
            <RefreshCwIcon className="size-3 shrink-0 animate-spin text-muted-foreground/70" />
          )}
          <Hint label="Close search (Esc)">
            <button
              type="button"
              onClick={onCloseSearch}
              className={iconButton}
            >
              <XIcon className="size-3.5" />
            </button>
          </Hint>
        </div>
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto px-2.5 pb-1.5">
          <span className="mr-0.5 shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground/50 uppercase">
            try
          </span>
          {SEARCH_OPERATORS.map((op) => (
            <Hint key={op.token} label={op.hint}>
              <button
                type="button"
                onClick={() => insertOperator(op.token)}
                className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {op.token}
              </button>
            </Hint>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      onPointerDown={(event) => beginHeaderDrag(event, account.accountId)}
      className="flex h-9 shrink-0 items-center gap-2 border-b px-2.5 select-none md:cursor-grab md:touch-none md:active:cursor-grabbing"
    >
      <GripVerticalIcon className="hidden size-3.5 shrink-0 text-muted-foreground/70 md:block" />
      <AccountDot colorIndex={dotIndex} accountId={account.accountId} />
      <span className="min-w-0 truncate font-mono text-xs font-medium">
        {label}
      </span>
      <FolderPicker
        folder={folder}
        onSelect={(next) => setPaneFolder(account.accountId, next)}
      />
      {account.unread > 0 && (
        <span className="shrink-0 font-mono text-[11px] font-medium text-primary">
          {formatCount(account.unread)} new
        </span>
      )}
      {folder === "drafts" && (
        <DeleteAllDraftsButton
          account={account}
          className={cn(iconButton, "ml-auto")}
        />
      )}
      <Hint label="Search this inbox">
        <button
          type="button"
          onClick={onOpenSearch}
          className={cn(iconButton, folder !== "drafts" && "ml-auto")}
        >
          <SearchIcon className="size-3.5" />
        </button>
      </Hint>
      <Hint label="Refresh">
        <button
          type="button"
          disabled={refreshing}
          onClick={refresh}
          className={iconButton}
        >
          <RefreshCwIcon
            className={cn("size-3.5", refreshing && "animate-spin")}
          />
        </button>
      </Hint>
      {removable && (
        <Hint label={`Remove ${account.email} from view`}>
          <button
            type="button"
            onClick={() => onRemovePane(account.accountId)}
            className={iconButton}
          >
            <XIcon className="size-3.5" />
          </button>
        </Hint>
      )}
    </div>
  );
}

/** Drafts-only: delete every draft in this account, behind a confirm dialog. */
function DeleteAllDraftsButton({
  account,
  className,
}: {
  account: Account;
  className: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const draftsList = () =>
    flattenEmails(
      queryClient.getQueryData(emailsQueryKey(account.accountId, "drafts")),
    ) ?? [];

  const onConfirm = async () => {
    const drafts = draftsList();
    setBusy(true);
    try {
      await Promise.all(
        drafts.map((d) => deleteDraft(account.accountId, d.id)),
      );
      queryClient.invalidateQueries({
        queryKey: ["emails", account.accountId],
      });
      toast.success(
        `Deleted ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`,
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const count = open ? draftsList().length : 0;

  return (
    <>
      <Hint label="Delete all drafts">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={className}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      </Hint>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all drafts?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {count === 0
              ? "There are no drafts to delete."
              : `Permanently delete ${count} draft${count === 1 ? "" : "s"} in ${account.email || account.accountId}. This can’t be undone.`}
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={busy || count === 0}
              onClick={() => void onConfirm()}
              className="bg-label-red text-white hover:bg-label-red/90"
            >
              {busy ? "Deleting…" : "Delete all"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PaneBody({
  account,
  dotIndex,
  search,
}: {
  account: Account;
  dotIndex: number;
  search: string;
}) {
  const { getOpenEmail, openEmail, folderFor, portalContainer } = useTiles();
  const folder = folderFor(account.accountId);
  const { density } = useSettings();
  const query = useEmailsQuery(account.accountId, folder, search);
  const { error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    query;
  const emails = flattenEmails(query.data);
  const searching = search.trim().length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arm the infinite-scroll observer when paging state or the loaded count changes; refs are stable.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, emails?.length]);

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      {folder === "labeled" ? (
        <LabeledView
          accountId={account.accountId}
          dotIndex={dotIndex}
          openEmail={openEmail}
          getOpenEmail={getOpenEmail}
          portalContainer={portalContainer}
        />
      ) : error ? (
        <ErrorState
          detail={`GET /api/emails · ${error.message}`}
          onRetry={() => refetch()}
          onReconnect={() => linkGoogle()}
        />
      ) : !emails ? (
        <SkeletonRows density={density} />
      ) : emails.length === 0 ? (
        searching ? (
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              No matches for{" "}
              <span className="font-mono text-foreground">{search.trim()}</span>
            </p>
            <p className="font-mono text-[10.5px] text-muted-foreground/70">
              searched {account.email} · live from Gmail
            </p>
          </div>
        ) : (
          <FolderEmptyState folder={folder} />
        )
      ) : (
        <>
          {emails.map((email) => (
            <ThreadRow
              key={email.id}
              email={email}
              density={density}
              dotIndex={dotIndex}
              accountId={account.accountId}
              selected={getOpenEmail(account.accountId) === email.id}
              onClick={() => openEmail(account.accountId, email.id)}
              portalContainer={portalContainer}
            />
          ))}
          {hasNextPage ? (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/70"
            >
              <RefreshCwIcon className="size-3 shrink-0 animate-spin" />
              Loading more…
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
