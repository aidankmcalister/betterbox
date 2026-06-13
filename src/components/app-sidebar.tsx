import {
  Archive,
  GitBranch,
  FileText,
  GitPullRequest,
  Inbox,
  MailIcon,
  Tag,
  PenLine,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Webhook,
} from "lucide-react";

import { useLocation, useNavigate } from "@tanstack/react-router";

import { linkGoogle, useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { formatCount } from "@/lib/format";
import { NavUser } from "@/components/nav-user";
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const mailbox: { id: Folder; title: string; icon: typeof Inbox }[] = [
  { id: "inbox", title: "Inbox", icon: Inbox },
  { id: "labeled", title: "Labeled", icon: Tag },
  { id: "sent", title: "Sent", icon: Send },
  { id: "drafts", title: "Drafts", icon: FileText },
  { id: "archived", title: "Archived", icon: Archive },
  { id: "spam", title: "Spam", icon: ShieldAlert },
  { id: "trash", title: "Trash", icon: Trash2 },
];

const developer: {
  id: string;
  title: string;
  icon: typeof Inbox;
  to?: string;
  /** Render as a dimmed "Soon" item (non-navigable). */
  disabled?: boolean;
}[] = [
  {
    id: "pull_requests",
    title: "PRs",
    icon: GitPullRequest,
    to: "/pull-requests",
  },
  {
    id: "rules",
    title: "Rules",
    icon: GitBranch,
    to: "/rules",
    disabled: true,
  },
  { id: "webhooks", title: "Webhooks", icon: Webhook },
];

// const misc: {
//   id: string;
//   title: string;
//   icon: typeof Inbox;
//   to?: string;
// }[] = [{ id: "jobs", title: "Jobs", icon: Briefcase }];

/** Sidebar nav grouped by section, derived straight from the arrays above so
 *  Settings → Appearance always mirrors the real sidebar. `fixed` items (Inbox)
 *  can't be hidden. Exported for the Appearance show/hide toggles. */
export const NAV_SECTIONS: {
  section: string;
  items: { id: string; title: string; fixed?: boolean }[];
}[] = [
  {
    section: "Mailbox",
    items: mailbox.map((item) => ({
      id: item.id,
      title: item.title,
      fixed: item.id === "inbox",
    })),
  },
  {
    section: "Developer",
    items: developer.map((item) => ({ id: item.id, title: item.title })),
  },
  // {
  //   section: "Misc",
  //   items: misc.map((item) => ({ id: item.id, title: item.title })),
  // },
];

const groupLabel =
  "px-1.5 pt-2 pb-[5px] font-mono text-[10.5px] font-medium tracking-[0.5px] uppercase text-muted-foreground/70";
const navButton = "h-7 gap-[9px] px-2 text-[13px]";
/* soon items: dimmed harder than the stock disabled 50% */
const soonButton = `${navButton} disabled:opacity-35 aria-disabled:opacity-35`;
/* rows are h-7 (not the stock h-8), so re-center the absolute badge: (28-20)/2 */
const badgePos = "peer-data-[size=default]/menu-button:top-1";
const countBadge = `${badgePos} min-w-[18px] rounded-full bg-accent px-1.5 text-center font-mono text-[10.5px] text-muted-foreground`;
const soonBadge = `${badgePos} font-mono text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase`;

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
}) {
  const { hiddenNav, demoMode } = useSettings();
  const { data: session } = useSession();
  // In demo mode the owner masquerades as a normal user, so owner-only items
  // (Rules) read as disabled "Soon" like everyone else sees.
  const isOwner = session?.user.role === "OWNER" && !demoMode;
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  const onLiveDev = embedded
    ? !!activeDevId
    : developer.some((item) => item.to === pathname);
  // The account view box only matters on mail pages — it scopes which inboxes
  // you're reading. Hide it on the developer/tool pages where it does nothing.
  const SCOPE_HIDDEN_PREFIXES = ["/rules", "/webhooks", "/pull-requests"];
  const showAccountScope = embedded
    ? !activeDevId
    : !SCOPE_HIDDEN_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
  const scopedUnread = accounts
    .filter((account) => scopeIds.includes(account.accountId))
    .reduce((sum, account) => sum + account.unread, 0);

  // Inbox is never hideable; everything else respects the Appearance toggles.
  const visibleMailbox = mailbox.filter(
    (item) => item.id === "inbox" || !hiddenNav.includes(item.id),
  );
  const visibleDeveloper = developer
    .filter((item) => !hiddenNav.includes(item.id))
    // Rules are owner-only for now: the owner gets a live link, everyone else
    // sees the disabled "Soon" item.
    .map((item) =>
      item.id === "rules" ? { ...item, disabled: !isOwner } : item,
    );
  // const visibleMisc = misc.filter((item) => !hiddenNav.includes(item.id));

  return (
    <Sidebar
      collapsible="none"
      className={
        embedded
          ? "h-full w-64 shrink-0 border-r"
          : "sticky top-0 h-svh w-64 shrink-0 border-r"
      }
    >
      <SidebarHeader className="gap-1.5 p-2.5">
        <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
          <div className="flex size-[22px] items-center justify-center rounded-md bg-primary text-on-primary">
            <MailIcon className="size-3.5" />
          </div>
          <span className="font-mono text-[13px] font-semibold">BetterBox</span>
        </div>

        <Button className="w-full" onClick={onCompose}>
          <PenLine />
          Compose
        </Button>

        <button
          type="button"
          onClick={onOpenCommand}
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

      <SidebarContent className="px-2.5">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className={groupLabel}>Mailbox</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {visibleMailbox.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={!onLiveDev && folder === item.id}
                    onClick={() => onFolder(item.id)}
                    className={navButton}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.id === "inbox" && scopedUnread > 0 ? (
                    <SidebarMenuBadge className={countBadge}>
                      {formatCount(scopedUnread)}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleDeveloper.length > 0 && (
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className={groupLabel}>
              Developer
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {visibleDeveloper.map((item) => {
                  // Enabled by default; `to` falls back to /{id}. `disabled`
                  // is the only thing that turns an item into a "Soon" stub.
                  const to = item.to ?? `/${item.id}`;
                  return !item.disabled ? (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={
                          embedded ? activeDevId === item.id : pathname === to
                        }
                        onClick={() =>
                          embedded && onOpenDevPage
                            ? onOpenDevPage(item.id)
                            : navigate({ to: to as string })
                        }
                        className={navButton}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton disabled className={soonButton}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className={soonBadge}>
                        Soon
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/*{visibleMisc.length > 0 && (
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className={groupLabel}>Misc</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {visibleMisc.map((item) =>
                  item.to ? (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={pathname === item.to}
                        onClick={() => navigate({ to: item.to })}
                        className={navButton}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton disabled className={soonButton}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className={soonBadge}>
                        Soon
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}*/}

        {showAccountScope && (
          <SidebarGroup className="mt-auto p-0 pb-3">
            <SidebarGroupContent>
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
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <NavUser
          onOpenSettings={onOpenSettings}
          loading={loading}
          demoUser={demoUser}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
