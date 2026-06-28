import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleUserRound,
  Command,
  Inbox,
  MailIcon,
  Palette,
  PanelLeft,
  ShieldCheck,
  Signature as SignatureIcon,
  SquarePen,
  SquareSlashIcon,
  SquareTerminal,
  Wrench,
  XIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import { useSession } from "@/lib/auth/auth-client";
import type { Account } from "@/lib/account";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountsPage } from "./pages/accounts";
import { AppearancePage } from "./pages/appearance";
import { InboxPage } from "./pages/inbox";
import { ComposerPage } from "./pages/composer";
import { SidebarPage } from "./pages/sidebar";
import { SnippetsPage } from "./pages/snippets";
import { SignaturesPage } from "./pages/signatures";
import { DeveloperPage } from "./pages/developer";
import { KeyboardPage } from "./pages/keyboard";
import { OwnerPage } from "./pages/owner";

export type PageId =
  | "accounts"
  | "appearance"
  | "inbox"
  | "composer"
  | "sidebar"
  | "snippets"
  | "signatures"
  | "developer"
  | "keyboard"
  | "owner";

type NavGroup = {
  section: string;
  pages: {
    id: PageId;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }[];
};

const NAV: NavGroup[] = [
  {
    section: "Account",
    pages: [{ id: "accounts", label: "Accounts", icon: CircleUserRound }],
  },
  {
    section: "General",
    pages: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "inbox", label: "Inbox", icon: Inbox },
      { id: "composer", label: "Composer", icon: SquarePen },
      { id: "sidebar", label: "Sidebar", icon: PanelLeft },
    ],
  },
  {
    section: "Composing",
    pages: [
      { id: "snippets", label: "Snippets", icon: SquareSlashIcon },
      { id: "signatures", label: "Signatures", icon: SignatureIcon },
    ],
  },
  {
    section: "Advanced",
    pages: [
      { id: "developer", label: "Developer", icon: SquareTerminal },
      { id: "keyboard", label: "Keyboard", icon: Command },
    ],
  },
];

/** Gated on session role, not env — owners only. */
const OWNER_NAV: NavGroup = {
  section: "Owner",
  pages: [{ id: "owner", label: "Owner tools", icon: Wrench }],
};

const PAGE_META: Record<PageId, { title: string; description: string }> = {
  appearance: {
    title: "Appearance",
    description: "Choose how BetterBox looks",
  },
  inbox: { title: "Inbox", description: "Row content and reading behavior" },
  composer: {
    title: "Composer",
    description: "How new messages open and send",
  },
  sidebar: {
    title: "Sidebar",
    description: "Choose which items appear in the sidebar",
  },
  snippets: {
    title: "Snippets",
    description:
      "Reusable replies you expand by typing a / trigger in the composer",
  },
  signatures: {
    title: "Signatures",
    description: "A sign-off appended to your messages, assigned per account",
  },
  accounts: {
    title: "Accounts",
    description: "Connect Google accounts and choose how each is tagged",
  },
  developer: { title: "Developer", description: "Raw views and exports" },
  keyboard: {
    title: "Keyboard",
    description: "Everything reachable without the mouse",
  },
  owner: {
    title: "Owner tools",
    description: "Only visible to owners. Toggles for development affordances",
  },
};

export function SettingsDialog({
  open,
  onOpenChange,
  accounts,
  snippetDraft,
  onSnippetDraftConsumed,
  initialPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Composer "Save as snippet" handoff — opens Snippets pre-filled. */
  snippetDraft?: string | null;
  onSnippetDraftConsumed?: () => void;
  /** Deep-link from ⌘K — land on this page when the dialog opens. */
  initialPage?: PageId;
}) {
  const [page, setPage] = useState<PageId>("accounts");
  const navigate = useNavigate();

  // Land on Snippets when the composer hands off a "Save as snippet" body.
  useEffect(() => {
    if (snippetDraft) setPage("snippets");
  }, [snippetDraft]);
  // Deep-link from ⌘K (Manage snippets / signatures): jump to that page on open.
  useEffect(() => {
    if (open && initialPage) setPage(initialPage);
  }, [open, initialPage]);
  const { data: session } = useSession();
  const isOwner = session?.user.role === "OWNER";
  const nav = isOwner ? [...NAV, OWNER_NAV] : NAV;

  const openPrivacy = () => {
    onOpenChange(false);
    navigate({ to: "/privacy" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[88vh] max-h-[88vh] flex-col gap-0 overflow-hidden border border-input p-0 sm:h-[560px] sm:max-h-[85vh] sm:max-w-3xl sm:flex-row"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>BetterBox preferences</DialogDescription>
        </DialogHeader>

        {/* Mobile: a scrollable strip of pages (desktop column doesn't fit),
            close button pinned right so tabs never slide under it. */}
        <div className="flex shrink-0 items-center border-b bg-sidebar sm:hidden">
          <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-2">
            {nav
              .flatMap((group) => group.pages)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap",
                    page === item.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </button>
              ))}
            <button
              type="button"
              onClick={openPrivacy}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            >
              <ShieldCheck className="size-4 shrink-0" />
              Privacy
            </button>
          </nav>
          <DialogClose
            render={
              <button
                type="button"
                className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              />
            }
          >
            <XIcon className="size-[18px]" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        <nav className="hidden w-48 shrink-0 flex-col gap-1 border-r bg-sidebar p-3 sm:flex">
          <div className="flex items-center gap-2 px-1.5 pt-1 pb-3">
            <span className="flex size-[18px] items-center justify-center rounded bg-primary text-on-primary">
              <MailIcon className="size-3" />
            </span>
            <span className="font-mono text-xs font-semibold">Settings</span>
          </div>
          {nav.map((group) => (
            <div key={group.section} className="flex flex-col gap-px">
              <span className="px-1.5 pt-2 pb-1 font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
                {group.section}
              </span>
              {group.pages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPage(item.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-[5px] text-left text-[13px]",
                    page === item.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={openPrivacy}
            className="mt-auto flex items-center gap-2 rounded-md px-2 py-[5px] text-left text-[13px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <ShieldCheck className="size-4 shrink-0" />
            Privacy policy
          </button>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-start gap-4 border-b px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-[-0.3px]">
                {PAGE_META[page].title}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {PAGE_META[page].description}
              </p>
            </div>
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden shrink-0 sm:flex"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {page === "accounts" && <AccountsPage accounts={accounts} />}
            {page === "appearance" && <AppearancePage />}
            {page === "inbox" && <InboxPage />}
            {page === "composer" && <ComposerPage accounts={accounts} />}
            {page === "sidebar" && <SidebarPage />}
            {page === "snippets" && (
              <SnippetsPage
                prefill={snippetDraft}
                onPrefillConsumed={onSnippetDraftConsumed}
              />
            )}
            {page === "signatures" && <SignaturesPage accounts={accounts} />}
            {page === "developer" && <DeveloperPage />}
            {page === "keyboard" && <KeyboardPage />}
            {page === "owner" && isOwner && <OwnerPage />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
