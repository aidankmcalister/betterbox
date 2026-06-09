import {
  Laptop,
  LogOut,
  MailCheck,
  Moon,
  PenLine,
  Sun,
  UserPlus,
} from "lucide-react";

import { linkGoogle, signOut } from "@/lib/auth-client";
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
} from "@/components/ui/command";

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            <CommandItem onSelect={run(() => {})}>
              <MailCheck />
              <span>Mark all as read</span>
            </CommandItem>
            <CommandItem onSelect={run(() => linkGoogle())}>
              <UserPlus />
              <span>Add account</span>
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
