import { Fragment, useState, type ReactNode } from "react";
import {
  AlignLeft,
  CircleUserRound,
  Clock,
  Columns2,
  FlaskConical,
  Inbox,
  Laptop,
  LogOut,
  Moon,
  PenLine,
  RotateCcw,
  Rows3,
  Settings,
  Sun,
  UserPlus,
} from "lucide-react";

import type { Account } from "@/lib/account";
import { AccountDot } from "@/components/account-dot";
import { linkGoogle, signOut } from "@/lib/auth-client";
import {
  RESET_TILE_LAYOUT_EVENT,
  SEARCH_INBOX_EVENT,
  type SearchInboxDetail,
} from "@/lib/layout-tree";
import { updateSettings, useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
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

const handle = (account: Account) =>
  account.email.split("@")[0] || account.email;

export function CommandMenu({
  open,
  onOpenChange,
  onOpenSettings,
  onGoInbox,
  onCompose,
  onMarkAccountRead,
  onAddTestAccount,
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
  accounts: Account[];
  /** Accounts whose panes are on screen — the "Search in …" targets. */
  searchAccounts: Account[];
}) {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const [search, setSearch] = useState("");

  /** Mark the option that's already active so the palette shows current state. */
  const current = (active: boolean) =>
    active
      ? { shortcut: "Current", shortcutClassName: "text-muted-foreground/40" }
      : {};

  const setOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) setSearch("");
  };

  // Run an action and close the palette.
  const run = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  const needle = search.trim().toLowerCase();
  const matches = (entry: CommandEntry) =>
    !needle || entry.label.toLowerCase().includes(needle);

  /* "Search in …" runs the current text as an in-pane search (the panes listen
     for SEARCH_INBOX_EVENT). Always shown, never filtered by the input — the
     input IS the query. */
  const query = search.trim();
  const dispatchSearch = (accountId: "all" | string) => {
    const detail: SearchInboxDetail = { accountId, query };
    window.dispatchEvent(new CustomEvent(SEARCH_INBOX_EVENT, { detail }));
    setOpen(false);
  };

  const groups: { heading: string; entries: CommandEntry[] }[] = [
    {
      heading: "Actions",
      entries: [
        {
          label: "Compose",
          icon: <PenLine />,
          action: onCompose,
          shortcut: "C",
        },
        {
          label: "Go to inbox",
          icon: <Inbox />,
          action: onGoInbox,
          shortcut: "G I",
        },
        {
          label: "Add account",
          icon: <UserPlus />,
          action: () => linkGoogle(),
        },
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
          action: () =>
            window.dispatchEvent(new Event(RESET_TILE_LAYOUT_EVENT)),
        },
      ],
    },
    {
      heading: "Appearance",
      entries: [
        {
          label: `Swap reading pane to ${
            settings.readerMode === "shared" ? "per account" : "shared"
          }`,
          icon: <Columns2 />,
          action: () =>
            updateSettings({
              readerMode: settings.readerMode === "shared" ? "split" : "shared",
            }),
        },
        {
          label: `Swap density to ${
            settings.density === "compact" ? "comfortable" : "dense"
          }`,
          icon: <Rows3 />,
          action: () =>
            updateSettings({
              density:
                settings.density === "compact" ? "comfortable" : "compact",
            }),
        },
        {
          label: `Swap clock to ${settings.clock === "12h" ? "24-hour" : "12-hour"}`,
          icon: <Clock />,
          action: () =>
            updateSettings({ clock: settings.clock === "12h" ? "24h" : "12h" }),
        },
        {
          label: `${settings.inboxAvatars ? "Hide" : "Show"} profile icons`,
          icon: <CircleUserRound />,
          action: () =>
            updateSettings({ inboxAvatars: !settings.inboxAvatars }),
        },
        {
          label: `${settings.showSnippets ? "Hide" : "Show"} snippets`,
          icon: <AlignLeft />,
          action: () =>
            updateSettings({ showSnippets: !settings.showSnippets }),
        },
      ],
    },
    {
      heading: "Theme",
      entries: [
        {
          label: "Light",
          icon: <Sun />,
          action: () => setTheme("light"),
          ...current(theme === "light"),
        },
        {
          label: "Dark",
          icon: <Moon />,
          action: () => setTheme("dark"),
          ...current(theme === "dark"),
        },
        {
          label: "System",
          icon: <Laptop />,
          action: () => setTheme("system"),
          ...current(theme === "system"),
        },
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
          placeholder="Run a command, or type a query to search your inboxes…"
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Commands (filtered by the query)… */}
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

          {/* …then "Search in …" — runs the typed query in a pane's search. */}
          {searchAccounts.length > 0 && (
            <>
              {visibleGroups.length > 0 && <CommandSeparator />}
              <CommandGroup heading="Search inbox">
                {searchAccounts.map((account, index) => (
                  <CommandItem
                    key={`search-${account.accountId}`}
                    value={`search-${account.accountId}`}
                    onSelect={() => dispatchSearch(account.accountId)}
                  >
                    <AccountDot
                      colorIndex={index}
                      accountId={account.accountId}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      Search{" "}
                      {query && (
                        <>
                          <span className="text-foreground">
                            “{query}”
                          </span>{" "}
                        </>
                      )}
                      in{" "}
                      <span className="text-foreground">{handle(account)}</span>
                    </span>
                  </CommandItem>
                ))}
                {searchAccounts.length > 1 && (
                  <CommandItem
                    value="search-all"
                    onSelect={() => dispatchSearch("all")}
                  >
                    <span className="flex shrink-0 items-center gap-1">
                      {searchAccounts.slice(0, 4).map((account, index) => (
                        <AccountDot
                          key={account.accountId}
                          colorIndex={index}
                          accountId={account.accountId}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      Search{" "}
                      {query && (
                        <>
                          <span className="text-foreground">
                            “{query}”
                          </span>{" "}
                        </>
                      )}
                      in <span className="text-foreground">all accounts</span>
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
