import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  SearchIcon,
  SparklesIcon,
  SquareSlashIcon,
  Clapperboard,
  Command,
  Inbox,
  Lock,
  MailIcon,
  Palette,
  Pencil,
  PlusIcon,
  Replace,
  Trash2,
  ShieldCheck,
  Signature as SignatureIcon,
  SquareTerminal,
  CircleUserRound,
  TextCursorIcon,
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
} from "@/lib/auth-client";
import type { Account } from "@/lib/account";
import { accountsQueryKey } from "@/lib/mail-queries";
import {
  ACCENTS,
  setAccountColor,
  updateSettings,
  useSettings,
  type AccentId,
} from "@/hooks/use-settings";
import { GithubMark } from "@/components/github-mark";
import { ACCOUNT_COLORS } from "@/components/account-dot";
import { NAV_SECTIONS } from "@/components/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { Editor } from "@tiptap/react";
import DOMPurify from "dompurify";
import { escapeHtml } from "@/lib/email/serialize";
import {
  snippetsQueryKey,
  useSnippetsQuery,
  type Snippet,
} from "@/hooks/use-snippets";
import {
  signaturesQueryKey,
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
    ],
  },
  {
    section: "Composing",
    pages: [
      { id: "snippets", label: "Snippets", icon: Replace },
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

/** Only owners ever see this group (gated on session role, not env). */
const OWNER_NAV: NavGroup = {
  section: "Owner",
  pages: [{ id: "owner", label: "Owner tools", icon: Wrench }],
};

export function SettingsDialog({
  open,
  onOpenChange,
  accounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
}) {
  const [page, setPage] = useState<PageId>("accounts");
  const navigate = useNavigate();
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
        className="flex h-[88vh] max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:h-[560px] sm:max-h-[85vh] sm:max-w-3xl sm:flex-row"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>BetterBox preferences</DialogDescription>
        </DialogHeader>

        {/* Desktop close — the mobile one lives inside the tab row below. */}
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2 z-10 hidden sm:flex"
            />
          }
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogClose>

        {/* Mobile: a scrollable strip of pages (the desktop column doesn't fit),
            with the close button pinned to the right so tabs never slide under
            it. */}
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
              <span className="px-1.5 pt-2 pb-1 font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
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

        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {page === "accounts" && <AccountsPage accounts={accounts} />}
          {page === "appearance" && <AppearancePage />}
          {page === "inbox" && <InboxPage />}
          {page === "snippets" && <SnippetsPage />}
          {page === "signatures" && <SignaturesPage accounts={accounts} />}
          {page === "developer" && <DeveloperPage />}
          {page === "keyboard" && <KeyboardPage />}
          {page === "owner" && isOwner && <OwnerPage />}
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

/** Disconnect a linked (non-primary) Google account from BetterBox. Unlinks it
 *  in Better Auth so its inbox/labels/sending stop showing up; nothing in Gmail
 *  changes and it can be re-added later. Behind a confirm dialog. */
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
    <Page
      title="Accounts"
      description="Connect Google accounts and choose how each is tagged"
    >
      <PageSection title="Connected accounts">
        <div className="flex flex-col gap-5">
          {accounts.map((account, index) => {
            const activeIndex =
              (accountColors[account.accountId] ?? index) %
              ACCOUNT_COLORS.length;
            return (
              <div
                key={account.accountId}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[13px]">
                    {account.email || account.accountId}
                  </p>
                  {account.email === primaryEmail && (
                    <p className="text-xs text-muted-foreground">Primary</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
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
                  {/* The primary account is the signed-in identity — disconnecting
                      it would drop your login, so it shows a lock in the
                      disconnect slot instead, which also keeps rows aligned. */}
                  {primaryEmail &&
                    (account.email === primaryEmail ? (
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
      </PageSection>

      <PageSection title="Sending">
        <SettingRow
          label="Default send-from"
          description="Which account the composer starts on for a new message"
        >
          <SendFromControl accounts={accounts} primaryEmail={primaryEmail} />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

/** Picks which connected account the composer defaults its From to. "Primary
 *  inbox" (null) keeps the old behaviour: fall back to the signed-in address. */
function SendFromControl({
  accounts,
  primaryEmail,
}: {
  accounts: Account[];
  primaryEmail?: string;
}) {
  const { defaultSendFrom } = useSettings();
  const sendable = accounts.filter((account) => account.email);
  // The primary account is already represented by "Primary inbox", so it isn't
  // also listed below — pinning it would behave identically to the default.
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

/** Non-interactive mockup using abstract bars — reflects density/accent/avatars via theme tokens. */
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
    <Page title="Appearance" description="Choose how BetterBox looks">
      <InterfacePreview />
      <PageSection title="Theme">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Theme">
            <ThemeSegmented />
          </Field>
          <Field label="Accent">
            <AccentDots />
          </Field>
        </div>
      </PageSection>
      <PageSection title="Display">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="Density">
            <DensitySegmented />
          </Field>
          <Field label="Clock">
            <ClockSegmented />
          </Field>
        </div>
      </PageSection>
      <PageSection title="Sidebar">
        <SidebarChips />
      </PageSection>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-[13px]">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
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
    <Page
      title="Inbox"
      description="Row content, reading, composing, and layout"
    >
      <PageSection title="Rows">
        <SettingRow
          label="Show preview"
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

      <PageSection title="Reading">
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
      </PageSection>

      <PageSection title="Composer">
        <SettingRow
          label="Open as"
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
      </PageSection>

      <PageSection title="Layout">
        <SettingRow
          label="Custom tiles"
          description="Arrange the inbox tiles by dragging pane headers"
          soon
        >
          <SoonControl label="Custom (tiles)" />
        </SettingRow>
      </PageSection>
    </Page>
  );
}

function DeveloperPage() {
  const settings = useSettings();

  return (
    <Page title="Developer" description="Raw views and exports">
      <PageSection title="Message view">
        <SettingRow
          label="Open messages in raw view"
          description="MIME source + headers by default"
        >
          <Switch
            checked={settings.rawByDefault}
            onCheckedChange={(rawByDefault) => updateSettings({ rawByDefault })}
          />
        </SettingRow>
      </PageSection>

      <PageSection title="Export">
        <SettingRow label="Default export format">
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
    <Page
      title="Owner tools"
      description="Only visible to owners. Toggles for development affordances"
    >
      <PageSection title="Access">
        <SettingRow
          label="Role"
          description="Granted out-of-band; clients can't set their own role"
        >
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-2/40 bg-accent-2/8 px-2 py-1 font-mono text-[11px] font-medium tracking-wide text-accent-2-hover uppercase">
            <Wrench className="size-3" />
            {session?.user.role ?? "USER"}
          </span>
        </SettingRow>
      </PageSection>

      <PageSection title="Recording">
        <div className="flex items-center justify-between gap-6 rounded-lg border border-accent-2/30 bg-accent-2/5 px-3.5 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Clapperboard className="mt-0.5 size-4 shrink-0 text-accent-2-hover" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Demo mode</p>
              <p className="text-xs text-muted-foreground">
                Hide real accounts and run on generated mail. Flip it on before
                recording, off when you’re done.
              </p>
            </div>
          </div>
          <Switch
            checked={settings.demoMode}
            onCheckedChange={(demoMode) => updateSettings({ demoMode })}
          />
        </div>
      </PageSection>

      <PageSection title="Development">
        <SettingRow
          label="Developer tools"
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
    <Page title="Keyboard" description="Everything reachable without the mouse">
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

// ── Snippets (Direction A — inline accordion) ───────────────────────────────

// Sample recipient used to preview how a snippet expands.
const PREVIEW_CONTACT: Record<string, string> = {
  first_name: "Maya",
  last_name: "Chen",
  name: "Maya Chen",
  full_name: "Maya Chen",
  email: "maya@acme.com",
};
const AUTO_KEYS = new Set([
  "first_name",
  "last_name",
  "name",
  "full_name",
  "email",
]);
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Resolve tokens for the live preview: variables → the sample value, fill
 *  fields → a chip, cursor → a caret. */
function snippetPreviewHtml(html: string): string {
  return html.replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor")
      return '<span class="ml-px inline-block h-[1.05em] w-px translate-y-[2px] rounded-sm bg-primary align-baseline"></span>';
    if (AUTO_KEYS.has(k)) return escapeHtml(PREVIEW_CONTACT[k] ?? k);
    return `<span class="rounded border border-primary/35 bg-primary/[0.13] px-1 font-mono text-[0.85em] text-primary">${escapeHtml(k)}</span>`;
  });
}

/** One-line plain preview for a collapsed row. */
function plainSnippetPreview(html: string): string {
  const resolved = html.replace(TOKEN_RE, (_m, raw: string) => {
    const k = raw.toLowerCase();
    if (k === "cursor") return "";
    return AUTO_KEYS.has(k) ? (PREVIEW_CONTACT[k] ?? k) : k;
  });
  return (
    resolved.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
    "Empty snippet"
  );
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

/** Compact teaching strip — variables (auto-fill) vs fill-in fields (tab-stops). */
function TokenLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-2">
        <span className="rounded border border-label-blue/35 bg-label-blue/[0.13] px-1 py-px font-mono text-[10px] text-label-blue">
          first_name
        </span>
        Variables auto-fill from the recipient
      </span>
      <span className="flex items-center gap-2">
        <span className="rounded border border-primary/35 bg-primary/[0.13] px-1 py-px font-mono text-[10px] text-primary">
          topic
        </span>
        Fill-in fields you Tab through
      </span>
    </div>
  );
}

/** Insert-field dropdown — variables, custom fill-in, cursor. */
function InsertFieldMenu({ onInsert }: { onInsert: (token: string) => void }) {
  const custom = () => {
    const name = window.prompt("Fill-in field name (e.g. company)");
    const slug = name?.trim().toLowerCase().replace(/\s+/g, "_");
    if (slug) onInsert(`{{${slug}}}`);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 gap-1.5" />}
      >
        <BracesIcon />
        Insert field
        <ChevronDownIcon className="text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Auto-fill from recipient</DropdownMenuLabel>
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
        <DropdownMenuItem onClick={custom}>
          <Pencil />
          Fill-in field…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onInsert("{{cursor}}")}>
          <TextCursorIcon />
          Cursor position
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Live preview of the snippet expanding for a sample recipient. */
function SnippetPreview({ html }: { html: string }) {
  const clean =
    typeof window === "undefined"
      ? ""
      : DOMPurify.sanitize(snippetPreviewHtml(html));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
          Preview
        </span>
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

type SnippetDraft = { trigger: string; text: string };

/** The inline editor revealed when a snippet row is open. */
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
  const triggerError = validateTrigger(draft.trigger, taken);
  const bodyEmpty =
    draft.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() === "";
  const canSave = draft.trigger.trim().length > 1 && !triggerError && !bodyEmpty;

  return (
    <div className="border-t bg-muted/40 px-3 pt-3 pb-3.5">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
          Trigger
        </span>
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
            "h-8 w-52 rounded-md border bg-background px-2.5 font-mono text-[13.5px] outline-none focus:border-ring/60",
            triggerError && "border-label-red/55",
          )}
        />
        <span
          className={cn(
            "font-mono text-[10.5px]",
            triggerError ? "text-label-red" : "text-muted-foreground/60",
          )}
        >
          {triggerError ?? "type this in the composer to expand"}
        </span>
      </div>
      <div className="mb-2 flex justify-end">
        <InsertFieldMenu
          onInsert={(t) => editor?.chain().focus().insertContent(t).run()}
        />
      </div>
      <RichTextEditor
        value={draft.text}
        onChange={(text) => onChange({ text })}
        onEditorReady={setEditor}
        placeholder="Write the reply — bold, code, lists, and insert a field for fill-ins…"
        minHeight={120}
      />
      <div className="mt-3.5">
        <SnippetPreview html={draft.text} />
      </div>
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save snippet"}
        </Button>
      </div>
    </div>
  );
}

/** A snippet as a row inside the shadcn <Accordion>. The trigger is a button,
 *  so Delete is overlaid as a sibling; the editor mounts only when open. */
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
    <AccordionItem value={snippet.id} className="group relative">
      <AccordionTrigger className="h-9 gap-3 px-3 py-0 font-normal hover:bg-muted/40 data-[panel-open]:bg-muted/40">
        <span className="shrink-0 font-mono text-[13px] font-medium text-primary">
          {snippet.trigger}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground/70">
          {plainSnippetPreview(snippet.text)}
        </span>
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

const NEW_SNIPPET = "__new__";

function SnippetsPage() {
  const queryClient = useQueryClient();
  const { data: snippets = [], isLoading } = useSnippetsQuery(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SnippetDraft>({ trigger: "", text: "" });
  const [error, setError] = useState<string | null>(null);

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
    mutationFn: async () => {
      const isNew = openId === NEW_SNIPPET;
      const res = await fetch("/api/snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: isNew ? "create" : "update",
          id: isNew ? undefined : openId,
          trigger: draft.trigger.trim(),
          text: draft.text,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save snippet");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: snippetsQueryKey });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch("/api/snippets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: snippetsQueryKey });
      if (openId === id) close();
    },
  });

  const seed = useMutation({
    mutationFn: async () => {
      const defaults = [
        {
          trigger: "/intro",
          text: "<p>Hi {{first_name}},</p><p>Thanks for the note about {{topic}}. {{cursor}}</p><p>Best,<br>Aidan</p>",
        },
        { trigger: "/ty", text: "<p>Thanks so much, {{first_name}}!</p>" },
      ];
      for (const d of defaults) {
        await fetch("/api/snippets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "create", ...d }),
        });
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: snippetsQueryKey }),
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
    <Page
      title="Snippets"
      description="Reusable replies you expand by typing a / trigger in the composer"
    >
      <div className="flex flex-col gap-2.5">
        <TokenLegend />
        {isLoading ? (
          <span className="font-mono text-xs text-muted-foreground/60">…</span>
        ) : snippets.length === 0 ? (
          <SnippetEmptyState
            onSeed={() => seed.mutate()}
            seeding={seed.isPending}
          />
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-lg border bg-muted/40 px-2.5">
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
              <Button size="sm" className="gap-1.5" onClick={openNew}>
                <PlusIcon />
                New snippet
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              {openId === NEW_SNIPPET && (
                <div className="overflow-hidden rounded-lg border border-input bg-muted/40">
                  <div className="flex h-9 items-center gap-3 px-3">
                    <span className="font-mono text-[13px] font-medium text-primary">
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
                  className="overflow-hidden rounded-lg border"
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
    </Page>
  );
}

// ── Signatures (Direction A — inline accordion, matching Snippets) ──────────

type SignatureDraft = { name: string; body: string };

function signaturePreview(body: string): string {
  return (
    body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ||
    "Empty signature"
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
    <div className="border-t bg-muted/40 px-3 pt-3 pb-3.5">
      <div className="mb-3 flex items-center gap-3">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
          Name
        </span>
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Default"
          className="h-8 w-52 bg-background"
        />
      </div>
      <Textarea
        value={draft.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder={"Best,\nAidan"}
        rows={4}
        className="bg-background"
      />
      {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSave || saving} onClick={onSave}>
          {saving ? "Saving…" : "Save signature"}
        </Button>
      </div>
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
    <AccordionItem value={signature.id} className="group relative">
      <AccordionTrigger className="h-9 gap-3 px-3 py-0 font-normal hover:bg-muted/40 data-[panel-open]:bg-muted/40">
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
          A sign-off appended to your messages. Create one, then assign it to any
          of your connected accounts below.
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
    mutationFn: async () => {
      const isNew = openId === NEW_SIGNATURE;
      const res = await fetch("/api/signatures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: isNew ? "create" : "update",
          id: isNew ? undefined : openId,
          name: draft.name.trim(),
          body: draft.body,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Could not save signature");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: signaturesQueryKey });
      close();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch("/api/signatures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "delete", id }),
      });
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: signaturesQueryKey });
      if (openId === id) close();
    },
  });

  const assign = useMutation({
    mutationFn: async (vars: {
      accountId: string;
      signatureId: string | null;
    }) => {
      await fetch("/api/signatures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "assign", ...vars }),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: signaturesQueryKey }),
  });

  return (
    <Page
      title="Signatures"
      description="A sign-off appended to your messages, assigned per account"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {isLoading ? (
            <span className="font-mono text-xs text-muted-foreground/60">…</span>
          ) : signatures.length === 0 && openId !== NEW_SIGNATURE ? (
            <SignatureEmptyState onNew={openNew} />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
                  Your signatures
                </span>
                <Button size="sm" className="gap-1.5" onClick={openNew}>
                  <PlusIcon />
                  New signature
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {openId === NEW_SIGNATURE && (
                  <div className="overflow-hidden rounded-lg border border-input bg-muted/40">
                    <div className="flex h-9 items-center gap-3 px-3">
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
                    value={
                      openId && openId !== NEW_SIGNATURE ? [openId] : []
                    }
                    onValueChange={(value) => {
                      const id = (value as string[])[0];
                      if (!id) return close();
                      const s = signatures.find((x) => x.id === id);
                      if (s) openExisting(s);
                    }}
                    className="overflow-hidden rounded-lg border"
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
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10.5px] font-medium tracking-[0.5px] text-muted-foreground/60 uppercase">
            Assigned per account
          </span>
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

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.3px]">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function PageSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="border-b pb-2 text-sm font-semibold">{title}</h3>
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
  /** Marks the setting as upcoming — adds a "Soon" tag and dims the row. */
  soon?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
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

/** Small uppercase "Soon" tag for not-yet-wired settings. */
function SoonTag() {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-wide text-muted-foreground/70 uppercase">
      Soon
    </span>
  );
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
    // biome-ignore lint/a11y/useSemanticElements: a segmented button group; a <fieldset> would impose default form styling.
    <div role="group" className="flex gap-1">
      {options.map((option) => (
        <Hint key={option.value} label={option.disabled ? "Soon" : ""}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={option.disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              mono && "font-mono",
              value === option.value
                ? "bg-muted text-foreground"
                : "text-muted-foreground",
            )}
          >
            {option.label}
          </Button>
        </Hint>
      ))}
    </div>
  );
}

/** A control that exists in the design but isn't wired yet. */
function SoonControl({
  label,
  mono = false,
}: {
  label: string;
  mono?: boolean;
}) {
  return (
    <Hint label="Soon">
      <Button
        variant="outline"
        size="sm"
        disabled
        className={cn("max-w-56", mono && "font-mono")}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon />
      </Button>
    </Hint>
  );
}
