import {
  FlaskConical,
  Inbox,
  Laptop,
  LogOut,
  MailCheck,
  Moon,
  PenLine,
  RotateCcw,
  Settings,
  Sun,
  UserPlus,
} from "lucide-react";

import { linkGoogle, signOut } from "@/lib/auth-client";
import { RESET_TILE_LAYOUT_EVENT } from "@/lib/layout-tree";
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

export function CommandMenu({
  open,
  onOpenChange,
  onOpenSettings,
  onGoInbox,
  onMarkAllRead,
  onAddTestAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onGoInbox: () => void;
  onMarkAllRead: () => void;
  onAddTestAccount?: () => void;
}) {
  const { setTheme } = useTheme();

  // Run an action and close the palette.
  const run = (action: () => void) => () => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Actions">
            <CommandItem onSelect={run(() => {})}>
              <PenLine />
              <span>Compose</span>
            </CommandItem>
            <CommandItem onSelect={run(onMarkAllRead)}>
              <MailCheck />
              <span>Mark all as read</span>
            </CommandItem>
            <CommandItem onSelect={run(onGoInbox)}>
              <Inbox />
              <span>Go to inbox</span>
              <CommandShortcut className="font-mono tracking-normal">
                G I
              </CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={run(() => linkGoogle())}>
              <UserPlus />
              <span>Add account</span>
            </CommandItem>
            {import.meta.env.DEV && onAddTestAccount && (
              <CommandItem onSelect={run(onAddTestAccount)}>
                <FlaskConical />
                <span>Add test account</span>
                <CommandShortcut className="font-mono tracking-normal text-accent-2">
                  DEV
                </CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Layout">
            <CommandItem
              onSelect={run(() =>
                window.dispatchEvent(new Event(RESET_TILE_LAYOUT_EVENT)),
              )}
            >
              <RotateCcw />
              <span>Reset tile layout</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Theme">
            <CommandItem onSelect={run(() => setTheme("light"))}>
              <Sun />
              <span>Light</span>
            </CommandItem>
            <CommandItem onSelect={run(() => setTheme("dark"))}>
              <Moon />
              <span>Dark</span>
            </CommandItem>
            <CommandItem onSelect={run(() => setTheme("system"))}>
              <Laptop />
              <span>System</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Account">
            <CommandItem onSelect={run(onOpenSettings)}>
              <Settings />
              <span>Open settings</span>
            </CommandItem>
            <CommandItem onSelect={run(() => signOut())}>
              <LogOut />
              <span>Sign out</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
