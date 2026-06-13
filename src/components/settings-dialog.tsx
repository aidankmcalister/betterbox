import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  Clapperboard,
  Command,
  Inbox,
  MailIcon,
  Palette,
  PlusIcon,
  ShieldCheck,
  SquareTerminal,
  CircleUserRound,
  Wrench,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import {
  authClient,
  linkGithub,
  linkGoogle,
  useSession,
} from "@/lib/auth-client";
import type { Account } from "@/lib/account";
import {
  ACCENTS,
  setAccountColor,
  updateSettings,
  useSettings,
  type AccentId,
} from "@/hooks/use-settings";
import { ACCOUNT_COLORS } from "@/components/account-dot";
import { NAV_SECTIONS } from "@/components/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Hint } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

type PageId =
  | "accounts"
  | "appearance"
  | "inbox"
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
    section: "App",
    pages: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "inbox", label: "Inbox", icon: Inbox },
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
      <DialogContent className="flex h-[560px] max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>BetterBox preferences</DialogDescription>
        </DialogHeader>

        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r bg-sidebar p-3">
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

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {page === "accounts" && <AccountsPage accounts={accounts} />}
          {page === "appearance" && <AppearancePage />}
          {page === "inbox" && <InboxPage />}
          {page === "developer" && <DeveloperPage />}
          {page === "keyboard" && <KeyboardPage />}
          {page === "owner" && isOwner && <OwnerPage />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** GitHub mark — lucide dropped its brand glyphs, so inline the logo. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
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
      description="Powers the Pull requests page — read-only PR access"
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
                <div
                  role="group"
                  aria-label={`Color for ${account.email}`}
                  className="flex shrink-0 gap-1.5"
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
          description="Used when composing from the unified view"
        >
          <SoonControl label={primaryEmail ?? "—"} mono />
        </SettingRow>
      </PageSection>
    </Page>
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
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <Field label="Theme">
          <ThemeSegmented />
        </Field>
        <Field label="Accent">
          <AccentDots />
        </Field>
        <Field label="Density">
          <DensitySegmented />
        </Field>
        <Field label="Clock">
          <ClockSegmented />
        </Field>
        <Field label="Profile icons">
          <AvatarsSwitch />
        </Field>
      </div>
      <div>
        <BlockLabel>Sidebar</BlockLabel>
        <SidebarChips />
      </div>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13px]">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function BlockLabel({ children }: { children: ReactNode }) {
  return <span className="mb-2 block text-[13px] font-medium">{children}</span>;
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
    <Page title="Inbox" description="Density, layout, and reading behavior">
      <PageSection title="Rows">
        <SettingRow label="Show snippets">
          <Switch
            checked={settings.showSnippets}
            onCheckedChange={(showSnippets) => updateSettings({ showSnippets })}
          />
        </SettingRow>
        <SettingRow label="Snippet font">
          <SegmentedButtons
            options={[
              { value: "sans", label: "Sans" },
              { value: "mono", label: "Mono" },
            ]}
            value={settings.snippetFont}
            onChange={(snippetFont) => updateSettings({ snippetFont })}
          />
        </SettingRow>
      </PageSection>

      <PageSection title="Multi-account">
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
          label="Layout"
          description="Arrange the inbox tiles by dragging pane headers"
        >
          <SoonControl label="Custom (tiles)" />
        </SettingRow>
      </PageSection>

      <PageSection title="Behavior">
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
          <Switch checked={false} disabled />
        </SettingRow>
        <SettingRow
          label="Show technical metadata"
          description="Message-IDs and list headers in the reading pane"
        >
          <Switch
            checked={settings.showTechnicalMetadata}
            onCheckedChange={(showTechnicalMetadata) =>
              updateSettings({ showTechnicalMetadata })
            }
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
      description="Only visible to owners — toggles for development affordances"
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
                Hide real accounts and run on generated mail — flip it on before
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

const SHORTCUTS = [
  { label: "Command palette", keys: ["⌘", "K"] },
  { label: "Compose", keys: ["C"] },
  { label: "Go to inbox (all accounts)", keys: ["G", "I"] },
  { label: "Switch account 1–9", keys: ["⌥", "1–9"] },
  { label: "Toggle raw source", keys: ["⌥", "R"], soon: true },
];

function KeyboardPage() {
  return (
    <Page title="Keyboard" description="Everything reachable without the mouse">
      <PageSection title="Navigation">
        <SettingRow
          label="Vim-style navigation"
          description="j/k move · o open · gg top"
        >
          <Switch checked={false} disabled />
        </SettingRow>
      </PageSection>

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
                {shortcut.soon && (
                  <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                    Soon
                  </span>
                )}
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
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[13px]">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
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
