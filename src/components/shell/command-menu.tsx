import { Fragment, useState, type ComponentProps, type ReactNode } from "react";
import {
  AlignLeft,
  Archive,
  Braces,
  CircleDot,
  CircleUserRound,
  Clapperboard,
  Clock,
  Columns2,
  FileText,
  FlaskConical,
  GitPullRequest,
  Inbox,
  Laptop,
  LayoutGrid,
  LogOut,
  Moon,
  PenLine,
  RotateCcw,
  Rows3,
  SaveIcon,
  Send,
  Settings,
  ShieldAlert,
  Signature,
  SquarePen,
  SquareSlash,
  Sun,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react";

import { toast } from "sonner";
import type { Account } from "@/lib/account";
import { AccountDot } from "@/components/shell/account-dot";
import { linkGoogle, signOut } from "@/lib/auth/auth-client";
import {
  RESET_TILE_LAYOUT_EVENT,
  SEARCH_INBOX_EVENT,
  applyTileLayout,
  listWorkspaces,
  loadCurrentLayout,
  removeWorkspace,
  saveWorkspace,
  type SearchInboxDetail,
} from "@/lib/layout-tree";
import { updateSettings, useSettings } from "@/hooks/use-settings";
import type { PageId } from "@/components/settings/settings-dialog";
import type { Folder } from "@/lib/folders";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/shell/theme-provider";
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
  onGoFolder,
  onCompose,
  onMarkAccountRead,
  onAddTestAccount,
  onOpenPanel,
  isOwner,
  accounts,
  searchAccounts,
  container,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional page deep-links Settings (Manage snippets / signatures). */
  onOpenSettings: (page?: PageId) => void;
  /** Navigate the active pane(s) to a folder (Inbox, Sent, Drafts, …). */
  onGoFolder: (folder: Folder) => void;
  onCompose: () => void;
  onMarkAccountRead: (accountId: string) => void;
  onAddTestAccount?: () => void;
  /** Open an integration panel on the board (e.g. "pull-requests"). */
  onOpenPanel?: (key: string) => void;
  /** Owner-only entries (e.g. demo mode) show only when true. */
  isOwner?: boolean;
  accounts: Account[];
  /** Accounts whose panes are on screen — the "Search in …" targets. */
  searchAccounts: Account[];
  /** Portal target — keeps the palette inside a bounded box (landing demo). */
  container?: ComponentProps<typeof CommandDialog>["container"];
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

  // Saved board layouts — re-read each time the palette opens so fresh saves show.
  const workspaces = open ? listWorkspaces() : [];

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
      heading: "Go to",
      entries: [
        {
          label: "Inbox",
          icon: <Inbox />,
          action: () => onGoFolder("inbox"),
          shortcut: "G I",
        },
        {
          label: "Labeled",
          icon: <Tag />,
          action: () => onGoFolder("labeled"),
        },
        { label: "Sent", icon: <Send />, action: () => onGoFolder("sent") },
        {
          label: "Drafts",
          icon: <FileText />,
          action: () => onGoFolder("drafts"),
        },
        {
          label: "Archived",
          icon: <Archive />,
          action: () => onGoFolder("archived"),
        },
        {
          label: "Spam",
          icon: <ShieldAlert />,
          action: () => onGoFolder("spam"),
        },
        { label: "Trash", icon: <Trash2 />, action: () => onGoFolder("trash") },
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
        ...workspaces.map(
          (ws): CommandEntry => ({
            label: `Open workspace: ${ws.name}`,
            icon: <LayoutGrid />,
            action: () => applyTileLayout(ws.tree),
          }),
        ),
        {
          label: "Save board as workspace…",
          icon: <SaveIcon />,
          action: () => {
            const tree = loadCurrentLayout();
            if (!tree) {
              toast("Nothing to save yet — open some panes first.");
              return;
            }
            const name = window.prompt("Name this workspace");
            if (!name?.trim()) return;
            saveWorkspace(name, tree);
            toast(`Saved workspace “${name.trim()}”`);
          },
        },
        ...(workspaces.length > 0
          ? [
              {
                label: "Delete a workspace…",
                icon: <Trash2 />,
                action: () => {
                  const name = window.prompt(
                    `Delete which workspace?\n${workspaces.map((w) => `• ${w.name}`).join("\n")}`,
                  );
                  const match = workspaces.find(
                    (w) => w.name.toLowerCase() === name?.trim().toLowerCase(),
                  );
                  if (match) {
                    removeWorkspace(match.id);
                    toast(`Deleted workspace “${match.name}”`);
                  } else if (name?.trim()) {
                    toast(`No workspace named “${name.trim()}”`);
                  }
                },
              } satisfies CommandEntry,
            ]
          : []),
        {
          label: "Reset tile layout",
          icon: <RotateCcw />,
          action: () =>
            window.dispatchEvent(new Event(RESET_TILE_LAYOUT_EVENT)),
        },
      ],
    },
    ...(onOpenPanel
      ? [
          {
            heading: "Integrations",
            entries: [
              {
                label: "Open GitHub pull requests",
                icon: <GitPullRequest />,
                action: () => onOpenPanel("pull-requests"),
              },
              {
                label: "Open GitHub issues",
                icon: <CircleDot />,
                action: () => onOpenPanel("github-issues"),
              },
            ],
          },
        ]
      : []),
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
            settings.density === "compact" ? "comfortable" : "compact"
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
          label: `${settings.showPreview ? "Hide" : "Show"} preview`,
          icon: <AlignLeft />,
          action: () => updateSettings({ showPreview: !settings.showPreview }),
        },
      ],
    },
    {
      heading: "Settings",
      entries: [
        {
          label: "Open settings",
          icon: <Settings />,
          action: () => onOpenSettings(),
        },
        {
          label: "Manage snippets",
          icon: <SquareSlash />,
          action: () => onOpenSettings("snippets"),
        },
        {
          label: "Manage signatures",
          icon: <Signature />,
          action: () => onOpenSettings("signatures"),
        },
        {
          label: `Swap composer to ${
            settings.composerMode === "popout" ? "pane" : "popout"
          }`,
          icon: <SquarePen />,
          action: () =>
            updateSettings({
              composerMode:
                settings.composerMode === "popout" ? "pane" : "popout",
            }),
        },
        {
          label: `${settings.rawByDefault ? "Disable" : "Enable"} raw email by default`,
          icon: <Braces />,
          action: () =>
            updateSettings({ rawByDefault: !settings.rawByDefault }),
        },
        ...(isOwner
          ? [
              {
                label: `${settings.demoMode ? "Disable" : "Enable"} demo mode`,
                icon: <Clapperboard />,
                action: () => updateSettings({ demoMode: !settings.demoMode }),
                shortcut: "OWNER",
                shortcutClassName: "text-accent-2",
              } satisfies CommandEntry,
            ]
          : []),
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
        {
          label: "Add account",
          icon: <UserPlus />,
          action: () => linkGoogle(),
        },
        { label: "Sign out", icon: <LogOut />, action: () => signOut() },
      ],
    },
  ];

  const visibleGroups = groups
    .map((group) => ({ ...group, entries: group.entries.filter(matches) }))
    .filter((group) => group.entries.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} container={container}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search or run a command…"
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
