import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  FlaskConical,
  Inbox,
  Laptop,
  LogOut,
  Moon,
  PenLine,
  RotateCcw,
  Settings,
  Sun,
  UserPlus,
} from "lucide-react";

import type { Account } from "@/lib/account";
import { AccountDot } from "@/components/account-dot";
import { linkGoogle, signOut } from "@/lib/auth-client";
import { RESET_TILE_LAYOUT_EVENT } from "@/lib/layout-tree";
import { useSearchEmailsQuery, type SearchHit } from "@/lib/mail-queries";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/use-settings";
import { shortTime } from "@/components/thread-row";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type CommandEntry = {
  label: string;
  icon: ReactNode;
  action: () => void;
  shortcut?: string;
  shortcutClassName?: string;
};

const senderName = (from: string) =>
  from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || from;

export function CommandMenu({
  open,
  onOpenChange,
  onOpenSettings,
  onGoInbox,
  onCompose,
  onMarkAccountRead,
  onAddTestAccount,
  onOpenEmail,
  accounts,
  searchAccounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onGoInbox: () => void;
  onCompose: () => void;
  onMarkAccountRead: (accountId: string) => void;
  onAddTestAccount?: () => void;
  onOpenEmail: (accountId: string, emailId: string) => void;
  accounts: Account[];
  searchAccounts: Account[];
}) {
  const { setTheme } = useTheme();
  const { clock } = useSettings();

  /* Email search: cmdk's own filtering is off — Gmail matches on full text
     the palette can't see, so results must never be re-filtered locally.
     Commands get a simple substring filter instead. */
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const hitsQuery = useSearchEmailsQuery(
    searchAccounts.map((account) => account.accountId),
    debounced,
  );
  const hits = hitsQuery.data ?? [];
  // Show the Inbox section off the immediate input (so the skeleton appears at
  // once), but run the query off the debounced value.
  const showInbox = search.trim().length >= 2;
  const debouncing = search.trim() !== debounced.trim();

  const setOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setSearch("");
      setDebounced("");
    }
  };

  // Run an action and close the palette.
  const run = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  const openHit = (hit: SearchHit) => {
    onOpenEmail(hit.accountId, hit.id);
    setOpen(false);
  };

  const accountLabel = (accountId: string) =>
    searchAccounts
      .find((account) => account.accountId === accountId)
      ?.email.split("@")[0] ?? "";

  const accountIndex = (accountId: string) =>
    searchAccounts.findIndex((account) => account.accountId === accountId);

  const needle = search.trim().toLowerCase();
  const matches = (entry: CommandEntry) =>
    !needle || entry.label.toLowerCase().includes(needle);

  const groups: { heading: string; entries: CommandEntry[] }[] = [
    {
      heading: "Actions",
      entries: [
        { label: "Compose", icon: <PenLine />, action: onCompose, shortcut: "C" },
        {
          label: "Go to inbox",
          icon: <Inbox />,
          action: onGoInbox,
          shortcut: "G I",
        },
        { label: "Add account", icon: <UserPlus />, action: () => linkGoogle() },
        ...(onAddTestAccount
          ? [
              {
                label: "Add test account",
                icon: <FlaskConical />,
                action: onAddTestAccount,
                shortcut: "DEV",
                shortcutClassName: "text-accent-2",
              },
            ]
          : []),
      ],
    },
    {
      heading: "Mark all as read",
      entries: accounts.map((account, index) => ({
        label: `Mark all read · ${account.email}`,
        icon: <AccountDot colorIndex={index} accountId={account.accountId} />,
        action: () => onMarkAccountRead(account.accountId),
      })),
    },
    {
      heading: "Layout",
      entries: [
        {
          label: "Reset tile layout",
          icon: <RotateCcw />,
          action: () => window.dispatchEvent(new Event(RESET_TILE_LAYOUT_EVENT)),
        },
      ],
    },
    {
      heading: "Theme",
      entries: [
        { label: "Light", icon: <Sun />, action: () => setTheme("light") },
        { label: "Dark", icon: <Moon />, action: () => setTheme("dark") },
        { label: "System", icon: <Laptop />, action: () => setTheme("system") },
      ],
    },
    {
      heading: "Account",
      entries: [
        { label: "Open settings", icon: <Settings />, action: onOpenSettings },
        { label: "Sign out", icon: <LogOut />, action: () => signOut() },
      ],
    },
  ];

  const visibleGroups = groups
    .map((group) => ({ ...group, entries: group.entries.filter(matches) }))
    .filter((group) => group.entries.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search mail or type a command..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Commands first (filtered by the query)… */}
          {visibleGroups.map((group, index) => (
            <Fragment key={group.heading}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.entries.map((entry) => (
                  <CommandItem
                    key={entry.label}
                    value={entry.label}
                    onSelect={run(entry.action)}
                  >
                    {entry.icon}
                    <span>{entry.label}</span>
                    {entry.shortcut && (
                      <CommandShortcut
                        className={cn(
                          "font-mono tracking-normal",
                          entry.shortcutClassName,
                        )}
                      >
                        {entry.shortcut}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Fragment>
          ))}

          {/* …then the mail search results below them (skeleton while loading). */}
          {showInbox && (
            <>
              {visibleGroups.length > 0 && <CommandSeparator />}
              <CommandGroup heading="Inbox">
                {hits.length > 0
                  ? hits.map((hit) => (
                      <CommandItem
                        key={`${hit.accountId}/${hit.id}`}
                        value={`${hit.accountId}/${hit.id}`}
                        onSelect={() => openHit(hit)}
                      >
                        <AccountDot
                          colorIndex={accountIndex(hit.accountId)}
                          accountId={hit.accountId}
                          unread={!!hit.unread}
                          className="ml-1.5"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          <span className={cn(hit.unread && "font-medium")}>
                            {senderName(hit.from)}
                          </span>
                          <span className="text-muted-foreground">
                            {" — "}
                            {hit.subject || "(no subject)"}
                          </span>
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-muted-foreground/70">
                          <span>{shortTime(hit.date, clock === "12h")}</span>
                          {searchAccounts.length > 1 && (
                            <span className="border-l border-border/60 pl-2">
                              {accountLabel(hit.accountId)}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    ))
                  : hitsQuery.isFetching || debouncing
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-lg px-2 py-2"
                          style={{ opacity: 1 - i * 0.16 }}
                        >
                          <Skeleton className="size-4 shrink-0 rounded bg-muted" />
                          <Skeleton className="h-3 w-40 rounded bg-muted" />
                          <Skeleton className="ml-auto h-3 w-20 shrink-0 rounded bg-muted" />
                        </div>
                      ))
                    : (
                      <div className="px-2 py-2 text-[12.5px] text-muted-foreground">
                        No matching messages
                      </div>
                    )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
