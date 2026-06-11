import {
  Archive,
  BarChart3,
  FileText,
  Inbox,
  MailIcon,
  PenLine,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Webhook,
} from "lucide-react";

import { linkGoogle } from "@/lib/auth-client";
import { formatCount } from "@/lib/format";
import { NavUser } from "@/components/nav-user";
import { ViewCard } from "@/components/view-card";
import type { Account } from "@/lib/account";
import type { Folder } from "@/lib/folders";
import { Button } from "@/components/ui/button";
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
  { id: "sent", title: "Sent", icon: Send },
  { id: "drafts", title: "Drafts", icon: FileText },
  { id: "archived", title: "Archived", icon: Archive },
  { id: "spam", title: "Spam", icon: ShieldAlert },
  { id: "trash", title: "Trash", icon: Trash2 },
];

const developer = [
  { title: "Webhooks", icon: Webhook },
  { title: "Analytics", icon: BarChart3 },
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
}) {
  const scopedUnread = accounts
    .filter((account) => scopeIds.includes(account.accountId))
    .reduce((sum, account) => sum + account.unread, 0);

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 h-svh w-64 shrink-0 border-r"
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
          <kbd className="ml-auto font-mono text-[10.5px] text-muted-foreground/70">
            ⌘K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        <SidebarGroup className="p-0">
          <SidebarGroupLabel className={groupLabel}>Mailbox</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {mailbox.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={folder === item.id}
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

        <SidebarGroup className="p-0">
          <SidebarGroupLabel className={groupLabel}>
            Developer
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {developer.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton disabled className={soonButton}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className={soonBadge}>
                    Soon
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto p-0 pb-3">
          <SidebarGroupContent>
            {accounts.length > 0 ? (
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
      </SidebarContent>

      <SidebarFooter className="border-t">
        <NavUser onOpenSettings={onOpenSettings} />
      </SidebarFooter>
    </Sidebar>
  );
}
