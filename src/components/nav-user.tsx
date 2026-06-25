import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

import { signOut, useSession } from "@/lib/auth-client";
import { useSettings } from "@/hooks/use-settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/** Profile block at the bottom of the sidebar. The primary (signed-in Google)
 *  account; linked inboxes live in the View card above. */
export function NavUser({
  onOpenSettings,
  loading = false,
  demoUser,
}: {
  onOpenSettings: () => void;
  /** Booting — skeleton in step with the View card above (same flag) so the
   *  two sidebar blocks reveal together instead of at different times. */
  loading?: boolean;
  /** Signed-out demo (landing page): a fake persona so the block renders
   *  without a real session. */
  demoUser?: { name: string; email: string; image: string | null };
}) {
  const { data: session } = useSession();
  const { demoMode } = useSettings();

  // Hold the profile block's shape with a skeleton until the sidebar is ready.
  if (loading || (!session && !demoUser)) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          {/* Matches SidebarMenuButton size="lg": h-12, p-2, gap-2. */}
          <div className="flex h-12 items-center gap-2 p-2">
            <div className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="grid flex-1 gap-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-32 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="size-4 shrink-0 animate-pulse rounded bg-muted/50" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }
  /* Demo mode masks the real signed-in identity too, so a recording shows only
     the demo persona (the toggle is owner-only reachable). */
  const user =
    demoUser ??
    (demoMode
      ? { name: "Demo User", email: "personal@example.com", image: null }
      : // biome-ignore lint/style/noNonNullAssertion: the early return above guarantees a session here when no demoUser is supplied.
        session!.user);
  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  const profile = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarImage src={user.image ?? undefined} alt={user.name} />
        <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-[13px] font-medium">{user.name}</span>
        <span className="truncate font-mono text-[10.5px] text-muted-foreground">
          {user.email}
        </span>
      </div>
    </>
  );

  // In the demo there's no real session, so the menu's actions (Settings,
  // theme, sign out) are inert or destructive — render the profile as a static,
  // non-interactive block instead of a dropdown.
  if (demoUser) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex h-12 cursor-default items-center gap-2 rounded-md p-2">
            {profile}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground/50" />
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {profile}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side="top"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-left">
                  {profile}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenSettings}>
                <Settings />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
