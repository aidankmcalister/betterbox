import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  FlaskConical,
  Inbox,
  Laptop,
  LogOut,
  Mail,
  MailCheck,
  Moon,
  PenLine,
  RotateCcw,
  Settings,
  Sun,
  UserPlus,
} from "lucide-react";

import type { Account } from "@/lib/account";
import { linkGoogle, signOut } from "@/lib/auth-client";
import { RESET_TILE_LAYOUT_EVENT } from "@/lib/layout-tree";
import { useSearchEmailsQuery, type SearchHit } from "@/lib/mail-queries";
import { cn } from "@/lib/utils";
import {
  OPEN_EMAIL_EVENT,
  type OpenEmailDetail,
} from "@/components/inbox-tiles";
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

const senderName = (from: string) =>
  from.replace(/<[^>]*>/g, "").replace(/"/g, "").trim() || from;

export function CommandMenu({
  open,
  onOpenChange,
  onOpenSettings,
  onGoInbox,
  onCompose,
  onMarkAllRead,
  onAddTestAccount,
  searchAccounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onGoInbox: () => void;
  onCompose: () => void;
  onMarkAllRead: () => void;
  onAddTestAccount?: () => void;
  searchAccounts: Account[];
}) {
  const { setTheme } = useTheme();

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
  const searching = debounced.trim().length >= 2;

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
    window.dispatchEvent(
      new CustomEvent<OpenEmailDetail>(OPEN_EMAIL_EVENT, {
        detail: { accountId: hit.accountId, emailId: hit.id },
      }),
    );
    setOpen(false);
  };

  const accountLabel = (accountId: string) =>
    searchAccounts
      .find((account) => account.accountId === accountId)
      ?.email.split("@")[0] ?? "";

  const needle = search.trim().toLowerCase();
  const matches = (entry: CommandEntry) =>
    !needle || entry.label.toLowerCase().includes(needle);

  const groups: { heading: string; entries: CommandEntry[] }[] = [
    {
      heading: "Actions",
      entries: [
        { label: "Compose", icon: <PenLine />, action: onCompose, shortcut: "C" },
        { label: "Mark all as read", icon: <MailCheck />, action: onMarkAllRead },
        {
          label: "Go to inbox",
          icon: <Inbox />,
          action: onGoInbox,
          shortcut: "G I",
        },
        { label: "Add account", icon: <UserPlus />, action: () => linkGoogle() },
        ...(import.meta.env.DEV && onAddTestAccount
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
          <CommandEmpty>
            {searching && hitsQuery.isFetching
              ? "Searching mail…"
              : "No results found."}
          </CommandEmpty>

          {searching && hits.length > 0 && (
            <CommandGroup heading="Emails">
              {hits.map((hit) => (
                <CommandItem
                  key={`${hit.accountId}/${hit.id}`}
                  value={`${hit.accountId}/${hit.id}`}
                  onSelect={() => openHit(hit)}
                >
                  <Mail />
                  <span className="min-w-0 flex-1 truncate">
                    <span className={cn(hit.unread && "font-medium")}>
                      {senderName(hit.from)}
                    </span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {hit.subject || "(no subject)"}
                    </span>
                  </span>
                  {searchAccounts.length > 1 && (
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground/70">
                      {accountLabel(hit.accountId)}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {visibleGroups.map((group, index) => (
            <Fragment key={group.heading}>
              {(index > 0 || (searching && hits.length > 0)) && (
                <CommandSeparator />
              )}
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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
