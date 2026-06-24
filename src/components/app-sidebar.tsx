import {
  Archive,
  ChevronRight,
  CircleDot,
  FileText,
  GitPullRequest,
  Inbox,
  MailIcon,
  Tag,
  PenLine,
  Search,
  Send,
  ShieldAlert,
  SquareCheck,
  Trash2,
  Users,
  Webhook,
} from "lucide-react";
import type { ComponentType } from "react";

import { useLocation, useNavigate } from "@tanstack/react-router";

import { linkGoogle } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useSettings } from "@/hooks/use-settings";
import { formatCount } from "@/lib/format";
import { NavUser } from "@/components/nav-user";
import { GithubMark } from "@/components/github-mark";
import { GmailMark } from "@/components/gmail-mark";
import { LinearMark } from "@/components/linear-mark";
import { ViewCard } from "@/components/view-card";
import type { Account } from "@/lib/account";
import type { Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type NavChild = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Gmail mailboxes switch the email panes' folder; panel children toggle an
   *  integration panel on the board; legacy `to` children navigate by route. */
  folder?: Folder;
  panel?: string;
  to?: string;
  /** Dimmed, non-navigable placeholder. */
  soon?: boolean;
  /** Can't be hidden via Settings (Inbox). */
  fixed?: boolean;
};

type Integration = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: NavChild[];
};

/** The sidebar, organized by integration. Each integration is a full section
 *  that owns its own views — adding one (or a view to one) is a single entry
 *  here, and it shows up in the sidebar and in Settings → Inbox automatically. */
const INTEGRATIONS: Integration[] = [
  {
    id: "gmail",
    label: "Gmail",
    icon: GmailMark,
    children: [
      { id: "inbox", title: "Inbox", icon: Inbox, folder: "inbox", fixed: true },
      { id: "labeled", title: "Labeled", icon: Tag, folder: "labeled" },
      { id: "sent", title: "Sent", icon: Send, folder: "sent" },
      { id: "drafts", title: "Drafts", icon: FileText, folder: "drafts" },
      { id: "archived", title: "Archived", icon: Archive, folder: "archived" },
      { id: "spam", title: "Spam", icon: ShieldAlert, folder: "spam" },
      { id: "trash", title: "Trash", icon: Trash2, folder: "trash" },
      { id: "webhooks", title: "Webhooks", icon: Webhook, soon: true },
    ],
  },
  {
    id: "github",
    label: "GitHub",
    icon: GithubMark,
    children: [
      {
        id: "pull_requests",
        title: "Pull requests",
        icon: GitPullRequest,
        panel: "pull-requests",
      },
      {
        id: "github_issues",
        title: "Issues",
        icon: CircleDot,
        panel: "github-issues",
      },
    ],
  },
  {
    id: "linear",
    label: "Linear",
    icon: LinearMark,
    children: [
      {
        id: "linear_assigned",
        title: "Assigned to you",
        icon: SquareCheck,
        soon: true,
      },
      {
        id: "linear_created",
        title: "Created by you",
        icon: CircleDot,
        soon: true,
      },
    ],
  },
];

/** Navigable route targets — used to tell when a non-mail page is active so the
 *  mailbox items don't also show as selected. */
const ROUTE_TARGETS = INTEGRATIONS.flatMap((integration) =>
  integration.children
    .filter((child) => child.to && !child.soon)
    .map((child) => child.to as string),
);

/** Sidebar nav as toggleable items per integration. Settings → Inbox mirrors
 *  this so any view (Issues, Reviews, Assigned to you…) can be shown/hidden.
 *  `fixed` items (Inbox) can't be hidden. */
export const NAV_SECTIONS: {
  section: string;
  items: { id: string; title: string; fixed?: boolean }[];
}[] = INTEGRATIONS.map((integration) => ({
  section: integration.label,
  items: integration.children.map((child) => ({
    id: child.id,
    title: child.title,
    fixed: child.fixed,
  })),
}));

const navButton = "h-7 gap-[9px] px-2 text-[13px]";
const subBadge =
  "ml-auto shrink-0 rounded-full bg-accent px-1.5 font-mono text-[10.5px] text-muted-foreground";
const soonBadge =
  "ml-auto shrink-0 font-mono text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase";

export function AppSidebar({
  accounts,
  scopeIds,
  allOn,
  folder,
  onFolder,
  onToggleScope,
  onOpenCommand,
  onOpenSettings,
  onCompose,
  onTogglePanel,
  openPanels,
  onAddTestAccount,
  onOpenDevPage,
  activeDevId,
  loading = false,
  embedded = false,
  demoUser,
  container,
}: {
  accounts: Account[];
  scopeIds: string[];
  allOn: boolean;
  folder: Folder;
  onFolder: (folder: Folder) => void;
  onToggleScope: (id: string | "all") => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onCompose: () => void;
  onAddTestAccount?: () => void;
  /** Open/close an integration panel on the board (e.g. "pull-requests"). */
  onTogglePanel?: (key: string) => void;
  /** Panel keys currently open on the board, for the active highlight. */
  openPanels?: string[];
  /** Embedded only (landing demo): open a developer page inside the sandbox
   *  instead of navigating the real router. */
  onOpenDevPage?: (id: string) => void;
  /** Embedded only: which developer page is showing, for the active highlight. */
  activeDevId?: string;
  /** Session/accounts still booting — skeleton the account + profile blocks. */
  loading?: boolean;
  /** Embedded in a fixed-height container (landing demo) — fill the parent
   *  instead of pinning to the viewport. */
  embedded?: boolean;
  /** Signed-out demo persona for the profile block (landing page). */
  demoUser?: { name: string; email: string; image: string | null };
  /** Portal target for the mobile sheet — keeps it inside the landing demo box
   *  instead of escaping to <body>. */
  container?: React.ComponentProps<typeof SheetContent>["container"];
}) {
  const { hiddenNav } = useSettings();
  const { openMobile, setOpenMobile } = useSidebar();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  // On mobile the sidebar is an off-canvas sheet — dismiss it after any action
  // that takes you elsewhere (picking a folder, composing, opening settings).
  const closeMobile = () => setOpenMobile(false);
  const after =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      fn(...args);
      closeMobile();
    };
  const onLiveDev = embedded ? !!activeDevId : ROUTE_TARGETS.includes(pathname);
  const inViewAccounts = accounts.filter((account) =>
    scopeIds.includes(account.accountId),
  );
  const scopedCount = inViewAccounts.length;
  const scopedUnread = inViewAccounts.reduce(
    (sum, account) => sum + account.unread,
    0,
  );

  // Inbox is never hideable; everything else respects the Settings toggles.
  const childVisible = (child: NavChild) =>
    child.fixed || !hiddenNav.includes(child.id);

  const inner = (
    <>
      <SidebarHeader className="gap-1.5 p-2.5">
        <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
          <div className="flex size-[22px] items-center justify-center rounded-md bg-primary text-on-primary">
            <MailIcon className="size-3.5" />
          </div>
          <span className="font-mono text-[13px] font-semibold">BetterBox</span>
        </div>

        <Button className="w-full" onClick={after(onCompose)}>
          <PenLine />
          Compose
        </Button>

        <button
          type="button"
          onClick={after(onOpenCommand)}
          className="flex h-8 w-full items-center gap-2 rounded-[7px] border bg-card px-[9px] text-[12.5px] text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-[13px]" />
          Search
          <KbdGroup className="ml-auto">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2.5 py-1.5">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {INTEGRATIONS.map((integration) => {
                const children = integration.children.filter(childVisible);
                if (children.length === 0) return null;
                // Whole integration is upcoming when every child is — flag it on
                // the header so the group reads as "Soon" before you expand it.
                const allSoon = children.every((child) => child.soon);
                return (
                  <SidebarMenuItem key={integration.id}>
                    <Collapsible defaultOpen={!allSoon}>
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuButton
                            className={cn(
                              navButton,
                              "group/collapsible font-medium",
                              allSoon && "opacity-50",
                            )}
                          />
                        }
                      >
                        <integration.icon />
                        <span>{integration.label}</span>
                        {allSoon && <span className={soonBadge}>Soon</span>}
                        <ChevronRight
                          className={cn(
                            "size-3.5 text-muted-foreground/60 transition-transform group-data-[panel-open]/collapsible:rotate-90",
                            allSoon ? "ml-1" : "ml-auto",
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="gap-px mr-0 pr-0">
                          {children.map((child) => {
                            if (child.soon) {
                              return (
                                <SidebarMenuSubItem key={child.id}>
                                  <SidebarMenuSubButton
                                    aria-disabled
                                    className="w-full text-left pointer-events-none opacity-40"
                                  >
                                    <child.icon />
                                    <span className="flex-1 truncate">
                                      {child.title}
                                    </span>
                                    <span className={soonBadge}>Soon</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            }
                            const isActive = child.folder
                              ? !onLiveDev && folder === child.folder
                              : child.panel
                                ? embedded
                                  ? activeDevId === child.id
                                  : (openPanels?.includes(child.panel) ?? false)
                                : embedded
                                  ? activeDevId === child.id
                                  : pathname === child.to;
                            const handle = child.folder
                              ? after(() => onFolder(child.folder as Folder))
                              : child.panel
                                ? after(() =>
                                    embedded && onOpenDevPage
                                      ? onOpenDevPage(child.id)
                                      : onTogglePanel?.(child.panel as string),
                                  )
                                : after(() =>
                                    embedded && onOpenDevPage
                                      ? onOpenDevPage(child.id)
                                      : navigate({ to: child.to as string }),
                                  );
                            return (
                              <SidebarMenuSubItem key={child.id}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  onClick={handle}
                                  className="w-full text-left"
                                  render={<button type="button" />}
                                >
                                  <child.icon />
                                  <span className="flex-1 truncate">
                                    {child.title}
                                  </span>
                                  {child.id === "inbox" && scopedUnread > 0 ? (
                                    <span className={subBadge}>
                                      {formatCount(scopedUnread)}
                                    </span>
                                  ) : null}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Account scope is a global view control ("which inboxes feed the
            board"), so it's pinned here — route-independent, never reflows when
            you switch integrations. Manage accounts in Settings; toggle which
            are in view here. Collapses to a one-liner when viewing all. */}
        {loading ? (
          <div className="flex h-7 items-center gap-2 px-2">
            <span className="size-4 shrink-0 animate-pulse rounded bg-muted" />
            <span className="h-2.5 w-16 animate-pulse rounded bg-muted" />
          </div>
        ) : accounts.length > 0 ? (
          <Collapsible defaultOpen={!allOn}>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="group/acct flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-sidebar-accent"
                />
              }
            >
              <Users className="size-4 shrink-0 text-muted-foreground/70" />
              <span className="text-[13px] font-medium">Accounts</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground/70">
                {allOn ? "All" : `${scopedCount} of ${accounts.length}`}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-[panel-open]/acct:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-0.5">
                <ViewCard
                  accounts={accounts}
                  scopeIds={scopeIds}
                  onToggle={onToggleScope}
                  onAddAccount={() => linkGoogle()}
                  onAddTestAccount={onAddTestAccount}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        <NavUser
          onOpenSettings={after(onOpenSettings)}
          loading={loading}
          demoUser={demoUser}
        />
      </SidebarFooter>
    </>
  );

  return (
    <>
      {/* Desktop: a persistent column. Hidden on mobile, where the off-canvas
          sheet below takes over (toggled by the mobile top bar's hamburger).
          The landing demo (embedded) fills its box instead of pinning to svh. */}
      <Sidebar
        collapsible="none"
        className={cn(
          "hidden w-64 shrink-0 border-r md:flex",
          embedded ? "h-full" : "sticky top-0 h-svh",
        )}
      >
        {inner}
      </Sidebar>
      {/* Mobile: the same sidebar, slid in from the left as a sheet. In the
          landing demo, container keeps it inside the scaled box. */}
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          container={container}
          showCloseButton={false}
          className="w-[18rem] max-w-[85vw] gap-0 border-r bg-sidebar p-0 md:hidden"
        >
          <Sidebar collapsible="none" className="h-full w-full">
            {inner}
          </Sidebar>
        </SheetContent>
      </Sheet>
    </>
  );
}
