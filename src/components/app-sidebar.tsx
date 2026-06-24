import {
  Archive,
  ChevronRight,
  CircleDot,
  Eye,
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
  SquareKanban,
  Trash2,
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
import { ViewCard, ViewCardSkeleton } from "@/components/view-card";
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
  /** Gmail mailboxes navigate by folder; other integrations route by path. */
  folder?: Folder;
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
    icon: MailIcon,
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
        to: "/pull-requests",
      },
      { id: "github_issues", title: "Issues", icon: CircleDot, soon: true },
      { id: "github_reviews", title: "Reviews", icon: Eye, soon: true },
    ],
  },
  {
    id: "linear",
    label: "Linear",
    icon: SquareKanban,
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
  // The account view box only matters on mail pages — it scopes which inboxes
  // you're reading. Hide it on the developer/tool pages where it does nothing.
  const SCOPE_HIDDEN_PREFIXES = ["/webhooks", "/pull-requests"];
  const showAccountScope = embedded
    ? !activeDevId
    : !SCOPE_HIDDEN_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
  const scopedUnread = accounts
    .filter((account) => scopeIds.includes(account.accountId))
    .reduce((sum, account) => sum + account.unread, 0);

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
                const isGmail = integration.id === "gmail";
                return (
                  <SidebarMenuItem key={integration.id}>
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger
                        render={
                          <SidebarMenuButton
                            className={cn(
                              navButton,
                              "group/collapsible font-medium",
                            )}
                          />
                        }
                      >
                        <integration.icon />
                        <span>{integration.label}</span>
                        <ChevronRight className="ml-auto size-3.5 text-muted-foreground/60 transition-transform group-data-[panel-open]/collapsible:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="gap-px">
                          {children.map((child) => {
                            if (child.soon) {
                              return (
                                <SidebarMenuSubItem key={child.id}>
                                  <SidebarMenuSubButton
                                    aria-disabled
                                    className="pointer-events-none opacity-40"
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
                              : embedded
                                ? activeDevId === child.id
                                : pathname === child.to;
                            const handle = child.folder
                              ? after(() => onFolder(child.folder as Folder))
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

                        {/* Multi-account scope lives under Gmail. */}
                        {isGmail && showAccountScope && (
                          <div className="mt-1.5">
                            {loading ? (
                              <ViewCardSkeleton />
                            ) : accounts.length > 0 ? (
                              <ViewCard
                                accounts={accounts}
                                scopeIds={scopeIds}
                                allOn={allOn}
                                onToggle={onToggleScope}
                                onAddAccount={() => linkGoogle()}
                                onAddTestAccount={onAddTestAccount}
                              />
                            ) : null}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
