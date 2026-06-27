import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  SparklesIcon,
  SquareSlashIcon,
  CalendarIcon,
  Command,
  Inbox,
  Lock,
  MailIcon,
  Palette,
  PanelLeft,
  Pencil,
  PlusIcon,
  Trash2,
  ShieldCheck,
  Signature as SignatureIcon,
  SquarePen,
  SquareTerminal,
  CircleUserRound,
  TextCursorIcon,
  TriangleAlertIcon,
  Unplug,
  Wrench,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ComponentType, ReactNode } from "react";

import {
  authClient,
  linkGithub,
  linkGoogle,
  useSession,
} from "@/lib/auth/auth-client";
import type { Account } from "@/lib/account";
import { accountsQueryKey } from "@/lib/mail-queries";
import {
  ACCENTS,
  setAccountColor,
  updateSettings,
  useSettings,
  type AccentId,
} from "@/hooks/use-settings";
import { GithubMark } from "@/components/integrations/github-mark";
import { ACCOUNT_COLORS } from "@/components/shell/account-dot";
import { NAV_SECTIONS } from "@/components/shell/app-sidebar";
import { useTheme } from "@/components/shell/theme-provider";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import type { Editor } from "@tiptap/react";
import DOMPurify from "dompurify";
import { escapeHtml } from "@/lib/email/serialize";
import { VARIABLE_KEYS, PREVIEW_CONTACT } from "@/lib/snippet-tokens";
import { SnippetTokenBubble } from "@/components/editor/snippet-token-bubble";
import { FieldNameDialog } from "@/components/editor/field-name-dialog";
import {
  tokensToFieldHtml,
  fieldHtmlToTokens,
  tokenNode,
} from "@/components/editor/editor-fill-fields";
import {
  activeSnippetsQueryKey,
  saveSnippet,
  deleteSnippet,
  useSnippetsQuery,
  type Snippet,
} from "@/hooks/use-snippets";
import {
  activeSignaturesQueryKey,
  saveSignature,
  removeSignature,
  assignSignature,
  useSignaturesQuery,
  type Signature,
} from "@/hooks/use-signatures";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PageId =
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
  appearance: { title: "Appearance", description: "Choose how BetterBox looks" },
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  /** Composer "Save as snippet" handoff — opens Snippets pre-filled. */
  snippetDraft?: string | null;
  onSnippetDraftConsumed?: () => void;
}) {
  const [page, setPage] = useState<PageId>("accounts");
  const navigate = useNavigate();

  // Land on Snippets when the composer hands off a "Save as snippet" body.
  useEffect(() => {
    if (snippetDraft) setPage("snippets");
  }, [snippetDraft]);
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

function GithubIntegration() {
  const queryClient = useQueryClient();
  const linked = useQuery({
    queryKey: ["linked-accounts"],
    queryFn: async () => {
      const res = await authClient.listAccounts();
      return res.data ?? [];
    },
  });
  const isLinked = (linked.data ?? []).some((a) => a.providerId === "github");
  const unlink = useMutation({
    mutationFn: () => authClient.unlinkAccount({ providerId: "github" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["pull-requests"] });
    },
  });

  return (
    <SettingRow
      label="GitHub"
      description="Powers the Pull requests page, read-only PR access"
    >
      {linked.isLoading ? (
        <span className="font-mono text-xs text-muted-foreground/60">…</span>
      ) : isLinked ? (
        <Button
          variant="outline"
          size="sm"
          disabled={unlink.isPending}
          onClick={() => unlink.mutate()}
        >
          {unlink.isPending ? "Unlinking…" : "Unlink"}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => linkGithub()}>
          <GithubMark className="size-3.5" /> Connect
        </Button>
      )}
    </SettingRow>
  );
}

/** Unlinks in Better Auth only — Gmail is untouched and can be re-added later. */
function DisconnectAccountButton({ account }: { account: Account }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const label = account.email || account.accountId;

  const disconnect = useMutation({
    mutationFn: () =>
      authClient.unlinkAccount({
        providerId: "google",
        accountId: account.accountId,
      }),
    onSuccess: (res) => {
      if (res?.error) {
        toast.error("Couldn’t disconnect account", {
          description: res.error.message,
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: accountsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
      toast.success(`Disconnected ${label}`);
      setOpen(false);
    },
    onError: (error) => {
      toast.error("Couldn’t disconnect account", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return (
    <>
      <Hint label="Disconnect account">
        <button
          type="button"
          aria-label={`Disconnect ${label}`}
          onClick={() => setOpen(true)}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:bg-muted hover:text-destructive hover:opacity-100"
        >
          <Unplug className="size-4" />
        </button>
      </Hint>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect this account?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Disconnect{" "}
            <span className="font-mono text-foreground">{label}</span> from
            BetterBox. Its inbox, labels, and sending stop showing up here.
            Nothing in Gmail changes, and you can reconnect it anytime.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              className="bg-label-red text-white hover:bg-label-red/90"
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountsPage({ accounts }: { accounts: Account[] }) {
  const { data: session } = useSession();
  const { accountColors } = useSettings();
  const primaryEmail = session?.user.email;

  return (
    <Page>
      <PageSection title="Connected accounts">
        <div className="flex flex-col gap-2.5">
          {accounts.map((account, index) => {
            const activeIndex =
              (accountColors[account.accountId] ?? index) %
              ACCOUNT_COLORS.length;
            const isPrimary = account.email === primaryEmail;
            return (
              <div
                key={account.accountId}
                className="flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors hover:bg-muted/20"
              >
                <p className="min-w-0 truncate font-mono text-[13px]">
                  {account.email || account.accountId}
                </p>
                {isPrimary && <Tag>Primary</Tag>}
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  {/* biome-ignore lint/a11y/useSemanticElements: a visual swatch group; a <fieldset> would impose default form styling in the row. */}
                  <div
                    role="group"
                    aria-label={`Color for ${account.email}`}
                    className="flex gap-1.5"
                  >
                    {ACCOUNT_COLORS.map((color, colorIndex) => (
                      <Hint key={color.label} label={color.label}>
                        <button
                          type="button"
                          aria-pressed={activeIndex === colorIndex}
                          onClick={() =>
                            setAccountColor(account.accountId, colorIndex)
                          }
                          className={cn(
                            "size-4.5 rounded-full transition-shadow",
                            activeIndex === colorIndex &&
                              "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                          )}
                          style={{ background: color.value }}
                        />
                      </Hint>
                    ))}
                  </div>
                  {/* Primary account is the signed-in identity — disconnecting
                      would drop login, so it shows a lock in the disconnect slot
                      (also keeps rows aligned). */}
                  {primaryEmail &&
                    (isPrimary ? (
                      <Hint label="Primary account — can’t be disconnected">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground opacity-70">
                          <Lock className="size-4" />
                        </span>
                      </Hint>
                    ) : (
                      <DisconnectAccountButton account={account} />
                    ))}
                </div>
              </div>
            );
          })}
          <div>
            <Button variant="outline" size="sm" onClick={() => linkGoogle()}>
              <PlusIcon /> Add Google account
            </Button>
          </div>
        </div>
      </PageSection>

      <PageSection title="Integrations">
        <GithubIntegration />
        <div className="opacity-60">
          <SettingRow
            label="Linear"
            description="Pull issues and project updates into your inbox"
          >
            <SoonTag />
          </SettingRow>
        </div>
      </PageSection>
    </Page>
  );
}

function ComposerPage({ accounts }: { accounts: Account[] }) {
  const { data: session } = useSession();
  const settings = useSettings();
  return (
    <Page>
      <PageSection title="Composer">
        <SettingRow
          label="Composer opens as"
          description="A floating popout, or a draggable pane in the board"
        >
          <SegmentedButtons
            options={[
              { value: "popout", label: "Popout" },
              { value: "pane", label: "Pane" },
            ]}
            value={settings.composerMode}
            onChange={(composerMode) => updateSettings({ composerMode })}
          />
        </SettingRow>
        <SettingRow
          label="Default send-from"
          description="Which account the composer starts on for a new message"
        >
          <SendFromControl
            accounts={accounts}
            primaryEmail={session?.user.email}
          />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

/** "Primary inbox" (null) falls back to the signed-in address. */
function SendFromControl({
  accounts,
  primaryEmail,
}: {
  accounts: Account[];
  primaryEmail?: string;
}) {
  const { defaultSendFrom } = useSettings();
  const sendable = accounts.filter((account) => account.email);
  // Primary account is already "Primary inbox", so it isn't listed below —
  // pinning it would behave identically to the default.
  const primaryAccount =
    sendable.find((account) => account.email === primaryEmail) ?? null;
  const others = sendable.filter(
    (account) => account.accountId !== primaryAccount?.accountId,
  );
  // Treat "pinned to the primary account" the same as the default (null).
  const onPrimary =
    defaultSendFrom === null || defaultSendFrom === primaryAccount?.accountId;
  const selected = onPrimary
    ? null
    : (sendable.find((account) => account.accountId === defaultSendFrom) ??
      null);
  const label = selected ? selected.email : "Primary inbox";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="max-w-56 font-mono" />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => updateSettings({ defaultSendFrom: null })}
        >
          <span className="text-[13px]">Primary inbox</span>
          {primaryEmail && (
            <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">
              {primaryEmail}
            </span>
          )}
          {onPrimary && (
            <CheckIcon
              className={cn(
                "size-3.5 shrink-0 text-primary",
                !primaryEmail && "ml-auto",
              )}
            />
          )}
        </DropdownMenuItem>
        {others.map((account) => (
          <DropdownMenuItem
            key={account.accountId}
            onClick={() =>
              updateSettings({ defaultSendFrom: account.accountId })
            }
          >
            <span className="truncate font-mono text-[12px]">
              {account.email}
            </span>
            {defaultSendFrom === account.accountId && (
              <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const PREVIEW_UNREAD = [true, false, true, false, false];

function InterfacePreview() {
  const { density, accent, inboxAvatars } = useSettings();
  const color = ACCENTS[accent].base;
  const rows = PREVIEW_UNREAD.slice(0, density === "compact" ? 5 : 3);

  const dot = (unread: boolean) => (
    <span
      className="size-1.5 shrink-0 rounded-full"
      style={
        unread
          ? { background: color }
          : { boxShadow: `inset 0 0 0 1.5px ${color}`, opacity: 0.5 }
      }
    />
  );
  const bar = (unread: boolean, width: number) => (
    <span
      className={cn(
        "h-1.5 shrink-0 rounded",
        unread ? "bg-foreground/70" : "bg-muted-foreground/40",
      )}
      style={{ width }}
    />
  );

  return (
    <div className="pointer-events-none overflow-hidden rounded-xl border bg-card select-none">
      <div className="flex h-[188px]">
        <div className="flex w-[92px] shrink-0 flex-col gap-2 border-r bg-sidebar p-2">
          <div className="flex items-center gap-1.5">
            <span
              className="size-3 rounded-[3px]"
              style={{ background: color }}
            />
            <span className="h-1.5 w-9 rounded bg-foreground/30" />
          </div>
          <span className="h-4 rounded-[5px]" style={{ background: color }} />
          <span className="h-3.5 rounded border bg-card" />
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="h-1.5 w-12 rounded bg-foreground/40" />
            <span className="h-1.5 w-10 rounded bg-muted-foreground/40" />
            <span className="h-1.5 w-11 rounded bg-muted-foreground/40" />
            <span className="h-1.5 w-8 rounded bg-muted-foreground/40" />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
            {dot(true)}
            <span className="h-1.5 w-16 rounded bg-foreground/40" />
            <span
              className="ml-auto h-1.5 w-6 rounded"
              style={{ background: color, opacity: 0.75 }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {rows.map((unread, i) =>
              density === "compact" ? (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static preview rows, never reordered.
                  key={i}
                  className="flex h-[22px] items-center gap-1.5 border-b border-border/60 px-2"
                >
                  {dot(unread)}
                  {inboxAvatars && (
                    <span className="size-3 shrink-0 rounded-full border border-border bg-muted" />
                  )}
                  {bar(unread, 44)}
                  <span className="ml-auto h-1.5 w-4 rounded bg-muted-foreground/30" />
                </div>
              ) : (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static preview rows, never reordered.
                  key={i}
                  className="flex gap-1.5 border-b border-border/60 px-2 py-1.5"
                >
                  <span className="pt-0.5">{dot(unread)}</span>
                  {inboxAvatars && (
                    <span className="size-4 shrink-0 rounded-full border border-border bg-muted" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {bar(unread, 52)}
                      <span className="ml-auto h-1.5 w-5 rounded bg-muted-foreground/30" />
                    </div>
                    <span className="h-1.5 w-3/4 rounded bg-muted-foreground/25" />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearancePage() {
  return (
    <Page>
      <InterfacePreview />
      <PageSection title="Appearance">
        <SettingRow label="Theme">
          <ThemeSegmented />
        </SettingRow>
        <SettingRow
          label="Accent color"
          description="Buttons, focus rings, and unread markers"
        >
          <AccentDots />
        </SettingRow>
        <SettingRow
          label="Density"
          description="Comfortable gives each row more breathing room"
        >
          <DensitySegmented />
        </SettingRow>
        <SettingRow label="Clock">
          <ClockSegmented />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

function SidebarPage() {
  return (
    <Page>
      <PageSection title="Shown items">
        <p className="mt-2 mb-3.5 text-[13px] text-muted-foreground">
          Tap an item to show or hide it in the sidebar. Hidden items stay
          reachable from the command palette.
        </p>
        <SidebarChips />
      </PageSection>
    </Page>
  );
}

function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedButtons
      options={[
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "system", label: "System" },
      ]}
      value={theme}
      onChange={setTheme}
    />
  );
}

function DensitySegmented() {
  const { density } = useSettings();
  return (
    <SegmentedButtons
      options={[
        { value: "compact", label: "Dense" },
        { value: "comfortable", label: "Comfortable" },
      ]}
      value={density}
      onChange={(value) => updateSettings({ density: value })}
    />
  );
}

function ClockSegmented() {
  const { clock } = useSettings();
  return (
    <SegmentedButtons
      options={[
        { value: "12h", label: "12-hour" },
        { value: "24h", label: "24-hour" },
      ]}
      value={clock}
      onChange={(value) => updateSettings({ clock: value })}
    />
  );
}

function AvatarsSwitch() {
  const { inboxAvatars } = useSettings();
  return (
    <Switch
      checked={inboxAvatars}
      onCheckedChange={(value) => updateSettings({ inboxAvatars: value })}
    />
  );
}

function AccentDots() {
  const { accent } = useSettings();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a visual accent-swatch group; a <fieldset> would impose default form styling.
    <div role="group" aria-label="Accent color" className="flex gap-1.5">
      {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
        <Hint key={id} label={ACCENTS[id].label}>
          <button
            type="button"
            aria-pressed={accent === id}
            onClick={() => updateSettings({ accent: id })}
            className={cn(
              "size-4.5 rounded-full transition-shadow",
              accent === id &&
                "ring-2 ring-foreground ring-offset-2 ring-offset-background",
            )}
            style={{ background: ACCENTS[id].base }}
          />
        </Hint>
      ))}
    </div>
  );
}

function SidebarChips() {
  const { hiddenNav } = useSettings();
  const toggle = (id: string, show: boolean) =>
    updateSettings({
      hiddenNav: show
        ? hiddenNav.filter((item) => item !== id)
        : [...hiddenNav, id],
    });
  return (
    <div className="flex flex-col gap-3.5">
      {NAV_SECTIONS.map((group) => (
        <div key={group.section}>
          <span className="mb-2 block font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
            {group.section}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((item) => {
              if (item.fixed) {
                return (
                  <span
                    key={item.id}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground/70"
                  >
                    {item.title}
                  </span>
                );
              }
              const shown = !hiddenNav.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={shown}
                  onClick={() => toggle(item.id, !shown)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                    shown
                      ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
                      : "border-border text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function InboxPage() {
  const settings = useSettings();

  return (
    <Page>
      <PageSection title="Inbox">
        <SettingRow
          label="Reading pane"
          description="One shared reader, or a separate reader docked per account"
        >
          <SegmentedButtons
            options={[
              { value: "shared", label: "Shared" },
              { value: "split", label: "Per account" },
            ]}
            value={settings.readerMode}
            onChange={(readerMode) => updateSettings({ readerMode })}
          />
        </SettingRow>
        <SettingRow
          label="Mark as read"
          description="When an opened message loses its unread state"
        >
          <SegmentedButtons
            options={[
              { value: "instant", label: "Instant" },
              { value: "1s", label: "1s" },
              { value: "5s", label: "5s" },
              { value: "off", label: "Off" },
            ]}
            value={settings.markRead}
            onChange={(markRead) => updateSettings({ markRead })}
          />
        </SettingRow>
        <SettingRow
          label="Message preview"
          description="The gray line of body text under each subject"
        >
          <Switch
            checked={settings.showPreview}
            onCheckedChange={(showPreview) => updateSettings({ showPreview })}
          />
        </SettingRow>
        <SettingRow label="Preview font">
          <SegmentedButtons
            options={[
              { value: "sans", label: "Sans" },
              { value: "mono", label: "Mono" },
            ]}
            value={settings.previewFont}
            onChange={(previewFont) => updateSettings({ previewFont })}
          />
        </SettingRow>
        <SettingRow
          label="Sender avatars"
          description="Show each sender's avatar in the message list"
        >
          <AvatarsSwitch />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

function DeveloperPage() {
  const settings = useSettings();

  return (
    <Page>
      <PageSection title="Developer">
        <SettingRow
          label="Raw view by default"
          description="Open messages as MIME source + headers"
        >
          <Switch
            checked={settings.rawByDefault}
            onCheckedChange={(rawByDefault) => updateSettings({ rawByDefault })}
          />
        </SettingRow>
        <SettingRow label="Export format">
          <SegmentedButtons
            mono
            options={[
              { value: "md", label: ".md" },
              { value: "json", label: ".json" },
              { value: "txt", label: ".txt" },
            ]}
            value={settings.exportFormat}
            onChange={(exportFormat) => updateSettings({ exportFormat })}
          />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

function OwnerPage() {
  const settings = useSettings();
  const { data: session } = useSession();

  return (
    <Page>
      <PageSection title="Owner tools">
        <SettingRow
          label="Role"
          description="Granted out-of-band; clients can't set their own role"
        >
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-2/40 bg-accent-2/8 px-2 py-1 font-mono text-[11px] font-medium tracking-wide text-accent-2-hover uppercase">
            <Wrench className="size-3" />
            {session?.user.role ?? "USER"}
          </span>
        </SettingRow>
        <SettingRow
          label="Demo mode"
          description="Hide real accounts and run on generated mail. Flip it on before recording, off when you’re done."
        >
          <Switch
            checked={settings.demoMode}
            onCheckedChange={(demoMode) => updateSettings({ demoMode })}
          />
        </SettingRow>
        <SettingRow
          label="Dev tools"
          description="Show the “Add test account” button in the sidebar and command palette"
        >
          <Switch
            checked={settings.devTools}
            onCheckedChange={(devTools) => updateSettings({ devTools })}
          />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

const SHORTCUTS: { label: string; keys: string[]; soon?: boolean }[] = [
  { label: "Command palette", keys: ["⌘", "K"] },
  { label: "Compose", keys: ["C"] },
  { label: "Go to inbox (all accounts)", keys: ["G", "I"] },
  { label: "Switch account 1–9", keys: ["⌥", "1–9"] },
  { label: "Toggle raw source", keys: ["⌥", "R"] },
];

function KeyboardPage() {
  return (
    <Page>
      <PageSection title="Shortcuts">
        <div className="flex flex-col gap-3">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.label}
              className={cn(
                "flex items-center justify-between",
                shortcut.soon && "opacity-50",
              )}
            >
              <span className="flex items-center gap-2 text-[13px]">
                {shortcut.label}
                {shortcut.soon && <SoonTag />}
              </span>
              <KbdGroup>
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </KbdGroup>
            </div>
          ))}
        </div>
      </PageSection>
    </Page>
  );
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function snippetPreviewHtml(html: string): string {
  return html.replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor")
      return '<span class="ml-px inline-block h-[1.05em] w-px translate-y-[2px] rounded-sm bg-primary align-baseline"></span>';
    if (VARIABLE_KEYS.has(k)) return escapeHtml(PREVIEW_CONTACT[k] ?? k);
    return `<span class="inline-block rounded border border-primary/35 bg-primary/[0.13] px-1 font-mono text-[0.85em] leading-[1.45] text-primary align-middle">${escapeHtml(k)}</span>`;
  });
}

/** Shows the snippet's *shape* — field names as chips, not a resolved sample. */
function rowPreviewHtml(html: string): string {
  const plain = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Empty snippet";
  return escapeHtml(plain).replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor") return "";
    // Muted version of the editor's chip colors: blue = auto-fill variable,
    // orange = fill-in field.
    const cls = VARIABLE_KEYS.has(k)
      ? "border-label-blue/25 bg-label-blue/[0.08] text-label-blue/80"
      : "border-primary/25 bg-primary/[0.08] text-primary/80";
    return `<span class="inline-block rounded border ${cls} px-1 font-mono text-[0.85em] leading-[1.45] align-middle">${escapeHtml(raw)}</span>`;
  });
}

function validateTrigger(value: string, taken: string[]): string | null {
  const v = value.trim();
  if (v === "" || v === "/") return null; // pristine — don't nag yet
  if (!v.startsWith("/")) return "must start with /";
  if (!/^\/[a-z0-9_-]+$/i.test(v)) return "letters, numbers, - or _";
  if (taken.some((t) => t.toLowerCase() === v.toLowerCase()))
    return "trigger already in use";
  return null;
}

/** Lists only the {{tokens}} the composer actually resolves. */
const VAR_CHIP = {
  blue: "border-label-blue/35 bg-label-blue/[0.13] text-label-blue",
  primary: "border-primary/35 bg-primary/[0.13] text-primary",
  muted: "border-border bg-muted text-muted-foreground/80",
} as const;

function VarRow({
  token,
  tone,
  children,
}: {
  token: string;
  tone: keyof typeof VAR_CHIP;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          "shrink-0 rounded border px-1 py-px font-mono text-[11px]",
          VAR_CHIP[tone],
        )}
      >
        {token}
      </span>
      <span className="text-[12.5px] text-muted-foreground">{children}</span>
    </div>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[11px]">{children}</span>
);

function SnippetVariables() {
  return (
    <PageSection title="Variables">
      <div className="flex flex-col">
        <VarRow token="first_name" tone="blue">
          Auto-fills from the recipient — also <Mono>last_name</Mono>,{" "}
          <Mono>name</Mono>, <Mono>email</Mono>.
        </VarRow>
        <VarRow token="date" tone="primary">
          Inserts a date you pick from a calendar.
        </VarRow>
        <VarRow token="cursor" tone="muted">
          Marks where your cursor lands after inserting.
        </VarRow>
        <VarRow token="topic" tone="primary">
          Any custom name becomes a fill-in field you Tab through.
        </VarRow>
      </div>
    </PageSection>
  );
}

function InsertFieldMenu({
  onInsert,
  hasCursor,
}: {
  onInsert: (token: string) => void;
  hasCursor: boolean;
}) {
  const [fieldOpen, setFieldOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
      <Hint label="Insert variable">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Insert variable"
              className="h-7 gap-0.5 px-1.5 text-muted-foreground hover:text-foreground"
            />
          }
        >
          <BracesIcon />
          <ChevronDownIcon className="text-muted-foreground/60" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Auto-fill from recipient</DropdownMenuLabel>
          <p className="px-1.5 pb-1 text-[11px] leading-snug text-muted-foreground/70">
            Filled from the recipient, if known.
          </p>
          <DropdownMenuItem onClick={() => onInsert("{{first_name}}")}>
            <CircleUserRound />
            First name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("{{last_name}}")}>
            <CircleUserRound />
            Last name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("{{name}}")}>
            <CircleUserRound />
            Full name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("{{email}}")}>
            <MailIcon />
            Email
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setFieldOpen(true)}>
          <Pencil />
          Fill-in field…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onInsert("{{date}}")}>
          <CalendarIcon />
          Date picker
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={hasCursor}
          onClick={() => onInsert("{{cursor}}")}
        >
          <TextCursorIcon />
          Cursor position
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
      <FieldNameDialog
        open={fieldOpen}
        onOpenChange={setFieldOpen}
        onSubmit={(slug) => onInsert(`{{${slug}}}`)}
      />
    </>
  );
}

function SnippetPreview({ html }: { html: string }) {
  const clean =
    typeof window === "undefined"
      ? ""
      : DOMPurify.sanitize(snippetPreviewHtml(html));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <EditorFieldLabel>Preview</EditorFieldLabel>
        <span className="font-mono text-[10px] text-muted-foreground/50">
          to: maya@acme.com
        </span>
      </div>
      <div
        className="border-l-2 border-input py-0.5 pl-3.5 text-[13px] leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.88em] [&_p]:m-0 [&_p]:mb-1 [&_strong]:text-foreground"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: a sanitized preview of the user's own snippet.
        dangerouslySetInnerHTML={{
          __html:
            clean ||
            '<span class="text-muted-foreground/50">Nothing yet.</span>',
        }}
      />
    </div>
  );
}

/** Mono-caps field label shared by the snippet + signature editors. */
function EditorFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
      {children}
    </span>
  );
}

/** Shared Cancel / Save row for the snippet + signature editors. */
function EditorActions({
  onCancel,
  onSave,
  saving,
  canSave,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  label: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

type SnippetDraft = { trigger: string; text: string };

function SnippetEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  taken,
}: {
  draft: SnippetDraft;
  onChange: (patch: Partial<SnippetDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  taken: string[];
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  // Editor works in chip nodes; the snippet stays stored as {{token}} text.
  const [chipHtml, setChipHtml] = useState(() => tokensToFieldHtml(draft.text));
  const triggerError = validateTrigger(draft.trigger, taken);
  const bodyEmpty =
    draft.text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() === "";
  const canSave =
    draft.trigger.trim().length > 1 && !triggerError && !bodyEmpty;
  const extraCursors = (draft.text.match(/\{\{cursor\}\}/g) ?? []).length > 1;

  return (
    <div className="border-t bg-muted/40 px-3 py-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <EditorFieldLabel>Trigger</EditorFieldLabel>
        <input
          value={draft.trigger}
          onChange={(e) =>
            onChange({
              trigger: e.target.value.replace(/[^a-zA-Z0-9_/-]/g, ""),
            })
          }
          placeholder="/ty"
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "h-7 w-32 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-[12.5px] outline-none focus:border-ring/60 sm:w-40 sm:flex-none",
            triggerError && "border-label-red/55",
          )}
        />
        {triggerError && (
          <span className="font-mono text-[10px] text-label-red">
            {triggerError}
          </span>
        )}
      </div>
      <RichTextEditor
        value={chipHtml}
        onChange={(html) => {
          setChipHtml(html);
          onChange({ text: fieldHtmlToTokens(html) });
        }}
        onEditorReady={setEditor}
        placeholder="Write the reply — insert a field for fill-ins…"
        minHeight={84}
        compact
        tokenChips
        toolbarEnd={
          <InsertFieldMenu
            hasCursor={draft.text.includes("{{cursor}}")}
            onInsert={(t) => {
              const m = t.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
              editor
                ?.chain()
                .focus()
                .insertContent(m ? tokenNode(m[1]) : t)
                .run();
            }}
          />
        }
      />
      {extraCursors && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-label-orange">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          Only the first cursor position is used — remove the extra one.
        </p>
      )}
      <div className="mt-2.5">
        <SnippetPreview html={draft.text} />
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <EditorActions
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        canSave={canSave}
        label="Save snippet"
      />
      {editor && <SnippetTokenBubble editor={editor} />}
    </div>
  );
}

/** Trigger is a button, so Delete is overlaid as a sibling, not nested. */
function SnippetRow({
  snippet,
  isOpen,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  onDelete,
  taken,
}: {
  snippet: Snippet;
  isOpen: boolean;
  draft: SnippetDraft;
  onChange: (patch: Partial<SnippetDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDelete: () => void;
  taken: string[];
}) {
  return (
    <AccordionItem
      value={snippet.id}
      className="group relative overflow-hidden rounded-lg border last:border-b transition-colors data-[panel-open]:border-input data-[panel-open]:bg-muted/20"
    >
      <AccordionTrigger className="h-10 gap-3 px-3.5 py-0 font-normal hover:bg-muted/40 data-[panel-open]:bg-transparent">
        <span className="shrink-0 font-mono text-[13px] font-medium text-foreground">
          {snippet.trigger}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground/70"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a sanitized preview of the user's own snippet.
          dangerouslySetInnerHTML={{
            __html:
              typeof window === "undefined"
                ? ""
                : DOMPurify.sanitize(rowPreviewHtml(snippet.text)),
          }}
        />
      </AccordionTrigger>
      <Hint label="Delete">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${snippet.trigger}`}
          className={cn(
            "absolute top-1 right-9 transition-opacity hover:text-label-red",
            isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </Hint>
      <AccordionContent className="p-0">
        {isOpen && (
          <SnippetEditor
            draft={draft}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            error={error}
            taken={taken}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SnippetEmptyState({
  onSeed,
  seeding,
}: {
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
        <SquareSlashIcon className="size-5" />
      </span>
      <div className="max-w-[340px]">
        <div className="text-[15px] font-semibold text-foreground">
          No snippets yet
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          Save a reply once, expand it forever. Type a{" "}
          <span className="font-mono text-primary">/trigger</span> in the
          composer and it fills in — recipient names auto-resolve, the rest
          become Tab-through blanks.
        </p>
      </div>
      <Button size="sm" disabled={seeding} onClick={onSeed}>
        <SparklesIcon />
        {seeding ? "Adding…" : "Add starter snippets"}
      </Button>
    </div>
  );
}

function RowSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = ["w-44", "w-32", "w-52", "w-36", "w-40"];
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows.
          key={i}
          className="flex h-10 items-center gap-3 rounded-lg border px-3.5"
        >
          <Skeleton className="h-3.5 w-12 shrink-0 rounded" />
          <Skeleton
            className={cn("h-3 rounded opacity-70", widths[i % widths.length])}
          />
        </div>
      ))}
    </div>
  );
}

const NEW_SNIPPET = "__new__";

function SnippetsPage({
  prefill,
  onPrefillConsumed,
}: {
  /** Composer "Save as snippet" body — opens a new snippet pre-filled. */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: snippets = [], isLoading } = useSnippetsQuery(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SnippetDraft>({ trigger: "", text: "" });
  const [error, setError] = useState<string | null>(null);

  // A captured selection from the composer → open the new-snippet editor with it.
  useEffect(() => {
    if (!prefill) return;
    setOpenId(NEW_SNIPPET);
    setDraft({ trigger: "/", text: prefill });
    setError(null);
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  const close = () => {
    setOpenId(null);
    setError(null);
  };
  const openExisting = (s: Snippet) => {
    setOpenId(s.id);
    setDraft({ trigger: s.trigger, text: s.text });
    setError(null);
  };
  const openNew = () => {
    setOpenId(NEW_SNIPPET);
    setDraft({ trigger: "/", text: "" });
    setError(null);
  };
  const patchDraft = (patch: Partial<SnippetDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveSnippet({
        id: openId === NEW_SNIPPET ? undefined : (openId ?? undefined),
        trigger: draft.trigger.trim(),
        text: draft.text,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSnippet(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() });
      if (openId === id) close();
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const defaults = [
        {
          trigger: "/intro",
          text: "<p>Hi {{first_name}},</p><p>Thanks for the note about {{topic}}. {{cursor}}</p>",
        },
        { trigger: "/ty", text: "<p>Thanks so much, {{first_name}}!</p>" },
      ];
      for (const d of defaults) await saveSnippet(d);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: activeSnippetsQueryKey() }),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return snippets;
    return snippets.filter(
      (s) =>
        s.trigger.toLowerCase().includes(t) || s.text.toLowerCase().includes(t),
    );
  }, [snippets, q]);

  const taken = snippets.filter((s) => s.id !== openId).map((s) => s.trigger);

  return (
    <Page>
      <PageSection
        title="Your snippets"
        action={
          !isLoading && snippets.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={openNew}
            >
              <PlusIcon />
              New snippet
            </Button>
          ) : undefined
        }
      >
        <div className="mt-2.5 flex flex-col gap-2.5">
          {isLoading ? (
            <RowSkeleton rows={3} />
          ) : snippets.length === 0 ? (
            <SnippetEmptyState
              onSeed={() => seed.mutate()}
              seeding={seed.isPending}
            />
          ) : (
            <>
              <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5">
                <SearchIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search triggers and text…"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
              {openId === NEW_SNIPPET && (
                <div className="overflow-hidden rounded-lg border border-input bg-muted/20">
                  <div className="flex h-10 items-center gap-3 px-3.5">
                    <span className="font-mono text-[13px] font-medium text-foreground">
                      {draft.trigger || "/…"}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground/60">
                      New snippet
                    </span>
                  </div>
                  <SnippetEditor
                    draft={draft}
                    onChange={patchDraft}
                    onSave={() => save.mutate()}
                    onCancel={close}
                    saving={save.isPending}
                    error={error}
                    taken={taken}
                  />
                </div>
              )}
              {filtered.length > 0 && (
                <Accordion
                  multiple={false}
                  value={openId && openId !== NEW_SNIPPET ? [openId] : []}
                  onValueChange={(value) => {
                    const id = (value as string[])[0];
                    if (!id) return close();
                    const s = snippets.find((x) => x.id === id);
                    if (s) openExisting(s);
                  }}
                  className="flex flex-col gap-2"
                >
                  {filtered.map((s) => (
                    <SnippetRow
                      key={s.id}
                      snippet={s}
                      isOpen={openId === s.id}
                      draft={draft}
                      onChange={patchDraft}
                      onSave={() => save.mutate()}
                      onCancel={close}
                      saving={save.isPending}
                      error={error}
                      onDelete={() => remove.mutate(s.id)}
                      taken={taken}
                    />
                  ))}
                </Accordion>
              )}
              {filtered.length === 0 && openId !== NEW_SNIPPET && (
                <div className="px-1 py-5 font-mono text-[11.5px] text-muted-foreground/60">
                  no snippets match “{q}”.
                </div>
              )}
            </div>
          </>
          )}
        </div>
      </PageSection>
      <SnippetVariables />
    </Page>
  );
}

type SignatureDraft = { name: string; body: string };

function signaturePreview(body: string): string {
  return (
    body
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Empty signature"
  );
}

function SignatureEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  draft: SignatureDraft;
  onChange: (patch: Partial<SignatureDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const canSave = draft.name.trim().length > 0 && draft.body.trim().length > 0;
  return (
    <div className="border-t bg-muted/40 px-3 py-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <EditorFieldLabel>Name</EditorFieldLabel>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Default"
          className="h-7 w-44 bg-background text-[12.5px]"
        />
      </div>
      <Textarea
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder={"Your sign-off — e.g. Best,\nAlex Rivera"}
        rows={3}
        className="bg-background text-[12.5px]"
      />
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <EditorActions
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        canSave={canSave}
        label="Save signature"
      />
    </div>
  );
}

function SignatureRow({
  signature,
  isOpen,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  onDelete,
}: {
  signature: Signature;
  isOpen: boolean;
  draft: SignatureDraft;
  onChange: (patch: Partial<SignatureDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDelete: () => void;
}) {
  return (
    <AccordionItem
      value={signature.id}
      className="group relative overflow-hidden rounded-lg border last:border-b transition-colors data-[panel-open]:border-input data-[panel-open]:bg-muted/20"
    >
      <AccordionTrigger className="h-10 gap-3 px-3.5 py-0 font-normal hover:bg-muted/40 data-[panel-open]:bg-transparent">
        <span className="shrink-0 text-[13px] font-medium text-foreground">
          {signature.name}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-normal text-muted-foreground/70">
          {signaturePreview(signature.body)}
        </span>
      </AccordionTrigger>
      <Hint label="Delete">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${signature.name}`}
          className={cn(
            "absolute top-1 right-9 transition-opacity hover:text-label-red",
            isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </Hint>
      <AccordionContent className="p-0">
        {isOpen && (
          <SignatureEditor
            draft={draft}
            onChange={onChange}
            onSave={onSave}
            onCancel={onCancel}
            saving={saving}
            error={error}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function SignatureEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="inline-flex size-11 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
        <SignatureIcon className="size-5" />
      </span>
      <div className="max-w-[340px]">
        <div className="text-[15px] font-semibold text-foreground">
          No signatures yet
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          A sign-off appended to your messages. Create one, then assign it to
          any of your connected accounts below.
        </p>
      </div>
      <Button size="sm" className="gap-1.5" onClick={onNew}>
        <PlusIcon />
        New signature
      </Button>
    </div>
  );
}

const NEW_SIGNATURE = "__new__";

function SignaturesPage({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useSignaturesQuery(true);
  const signatures = data?.signatures ?? [];
  const assignments = data?.assignments ?? {};

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SignatureDraft>({ name: "", body: "" });
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpenId(null);
    setError(null);
  };
  const openExisting = (s: Signature) => {
    setOpenId(s.id);
    setDraft({ name: s.name, body: s.body });
    setError(null);
  };
  const openNew = () => {
    setOpenId(NEW_SIGNATURE);
    setDraft({ name: "", body: "" });
    setError(null);
  };
  const patchDraft = (patch: Partial<SignatureDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: () =>
      saveSignature({
        id: openId === NEW_SIGNATURE ? undefined : (openId ?? undefined),
        name: draft.name.trim(),
        body: draft.body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeSignature(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() });
      if (openId === id) close();
    },
  });

  const assign = useMutation({
    mutationFn: (vars: { accountId: string; signatureId: string | null }) =>
      assignSignature(vars.accountId, vars.signatureId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: activeSignaturesQueryKey() }),
  });

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {signatures.length === 0 && openId !== NEW_SIGNATURE && !isLoading ? (
            <SignatureEmptyState onNew={openNew} />
          ) : (
            <>
              <div className="flex items-center gap-4 pb-1">
                <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
                  Your signatures
                </h3>
                <span className="h-px flex-1 bg-border" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={openNew}
                >
                  <PlusIcon />
                  New signature
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {openId === NEW_SIGNATURE && (
                  <div className="overflow-hidden rounded-lg border border-input bg-muted/20">
                    <div className="flex h-10 items-center gap-3 px-3.5">
                      <span className="text-[13px] font-medium text-foreground">
                        {draft.name || "Untitled"}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground/60">
                        New signature
                      </span>
                    </div>
                    <SignatureEditor
                      draft={draft}
                      onChange={patchDraft}
                      onSave={() => save.mutate()}
                      onCancel={close}
                      saving={save.isPending}
                      error={error}
                    />
                  </div>
                )}
                {signatures.length > 0 && (
                  <Accordion
                    multiple={false}
                    value={openId && openId !== NEW_SIGNATURE ? [openId] : []}
                    onValueChange={(value) => {
                      const id = (value as string[])[0];
                      if (!id) return close();
                      const s = signatures.find((x) => x.id === id);
                      if (s) openExisting(s);
                    }}
                    className="flex flex-col gap-2"
                  >
                    {signatures.map((s) => (
                      <SignatureRow
                        key={s.id}
                        signature={s}
                        isOpen={openId === s.id}
                        draft={draft}
                        onChange={patchDraft}
                        onSave={() => save.mutate()}
                        onCancel={close}
                        saving={save.isPending}
                        error={error}
                        onDelete={() => remove.mutate(s.id)}
                      />
                    ))}
                  </Accordion>
                )}
                {isLoading &&
                  signatures.length === 0 &&
                  openId !== NEW_SIGNATURE && <RowSkeleton rows={2} />}
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <div className="flex items-center gap-4 pb-1">
            <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
              Assigned per account
            </h3>
            <span className="h-px flex-1 bg-border" />
          </div>
          {accounts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No connected accounts.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {accounts.map((account) => {
                const currentId = assignments[account.accountId] ?? null;
                const current = signatures.find((s) => s.id === currentId);
                return (
                  <div
                    key={account.accountId}
                    className="flex items-center gap-3 rounded-lg border px-3 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-muted-foreground">
                      {account.email}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-40 shrink-0"
                          />
                        }
                      >
                        <span className="flex-1 truncate text-left">
                          {current ? current.name : "None"}
                        </span>
                        <ChevronDownIcon className="text-muted-foreground/60" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() =>
                            assign.mutate({
                              accountId: account.accountId,
                              signatureId: null,
                            })
                          }
                        >
                          <span className="text-[13px]">None</span>
                          {!currentId && (
                            <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
                          )}
                        </DropdownMenuItem>
                        {signatures.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            onClick={() =>
                              assign.mutate({
                                accountId: account.accountId,
                                signatureId: s.id,
                              })
                            }
                          >
                            <span className="truncate text-[13px]">
                              {s.name}
                            </span>
                            {currentId === s.id && (
                              <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

function PageSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-1">
      <div className="flex items-center gap-4 pb-1">
        <h3 className="font-mono text-[10.5px] font-medium tracking-[0.7px] text-muted-foreground/60 uppercase">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
        {action}
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  description,
  soon = false,
  children,
}: {
  label: string;
  description?: string;
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        soon && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px]">
          {label}
          {soon && <SoonTag />}
        </p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Small mono-caps status pill — PRIMARY, SOON, etc. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-wide whitespace-nowrap text-muted-foreground/70 uppercase">
      {children}
    </span>
  );
}

function SoonTag() {
  return <Tag>Soon</Tag>;
}

function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  mono = false,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(values) => {
        const next = values[0] as T | undefined;
        if (next) onChange(next);
      }}
      className="gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "h-7 rounded-md px-3 text-[12.5px] data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm",
            mono && "font-mono text-[11.5px]",
          )}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

