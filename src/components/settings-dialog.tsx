import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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

import { linkGoogle, useSession } from "@/lib/auth-client";
import type { Account } from "@/lib/account";
import {
  ACCENTS,
  setAccountColor,
  updateSettings,
  useSettings,
  type AccentId,
} from "@/hooks/use-settings";
import { ACCOUNT_COLORS } from "@/components/account-dot";
import { HIDEABLE_NAV } from "@/components/app-sidebar";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

// ── Pages ────────────────────────────────────────────────────────────────────

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

/** Sample senders for the preview — real text so the fonts and the 12/24-hour
 *  clock are visible (sender = sans, time = mono). */
const PREVIEW_ROWS = [
  { sender: "GitHub", h: 14, m: 14, unread: true },
  { sender: "Vercel", h: 13, m: 2, unread: false },
  { sender: "Stripe", h: 11, m: 30, unread: true },
  { sender: "Linear", h: 9, m: 48, unread: false },
  { sender: "Figma", h: 8, m: 15, unread: false },
];

const previewTime = (h: number, m: number, hour12: boolean) =>
  new Date(2026, 0, 1, h, m).toLocaleTimeString([], {
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hour12,
  });

/** A tiny, non-interactive mockup of the app that reacts live to the appearance
 *  settings — density, accent, avatars, the 12/24h clock, and which sidebar
 *  items are shown. Real text makes the fonts + clock visible; theme tokens
 *  keep it tracking light/dark. */
function InterfacePreview() {
  const { density, accent, inboxAvatars, clock, hiddenNav } = useSettings();
  const color = ACCENTS[accent].base;
  const rows = PREVIEW_ROWS.slice(0, density === "compact" ? 5 : 3);
  const nav = [
    "Inbox",
    ...HIDEABLE_NAV.filter((item) => !hiddenNav.includes(item.id)).map(
      (item) => item.title,
    ),
  ];

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
  const monogram = (sender: string, size: string) =>
    inboxAvatars ? (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-border text-[7px] font-semibold text-foreground",
          size,
        )}
        style={{
          background: `color-mix(in srgb, ${color} 22%, var(--background))`,
        }}
      >
        {sender[0]}
      </span>
    ) : null;
  const senderText = (sender: string, unread: boolean) => (
    <span
      className={cn(
        "truncate text-[8.5px]",
        unread ? "font-semibold text-foreground" : "text-muted-foreground",
      )}
    >
      {sender}
    </span>
  );
  const timeText = (h: number, m: number) => (
    <span className="ml-auto shrink-0 font-mono text-[7.5px] text-muted-foreground/70">
      {previewTime(h, m, clock === "12h")}
    </span>
  );

  return (
    <div className="pointer-events-none overflow-hidden rounded-xl border bg-card select-none">
      <div className="flex h-[212px]">
        {/* Mini sidebar — nav reflects the show/hide toggles */}
        <div className="flex w-[104px] shrink-0 flex-col gap-1.5 border-r bg-sidebar p-2">
          <div className="flex items-center gap-1">
            <span
              className="size-2.5 rounded-[2px]"
              style={{ background: color }}
            />
            <span className="font-mono text-[7px] font-semibold">BetterBox</span>
          </div>
          <span
            className="flex h-4 items-center justify-center rounded text-[7px] font-medium text-on-primary"
            style={{ background: color }}
          >
            Compose
          </span>
          <span className="flex h-3.5 items-center rounded border bg-card px-1 font-mono text-[6.5px] text-muted-foreground/70">
            Search
          </span>
          <div className="mt-0.5 flex flex-col gap-px overflow-hidden">
            {nav.slice(0, 8).map((label, i) => (
              <span
                key={label}
                className={cn(
                  "truncate rounded px-1 py-[2px] text-[7.5px]",
                  i === 0
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Mini inbox pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-6 shrink-0 items-center gap-1.5 border-b px-2">
            {dot(true)}
            <span className="font-mono text-[8px] text-foreground/70">
              personal@…
            </span>
            <span
              className="ml-auto font-mono text-[8px] font-medium"
              style={{ color }}
            >
              {rows.filter((row) => row.unread).length} new
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {rows.map((row, i) =>
              density === "compact" ? (
                <div
                  key={i}
                  className="flex h-[22px] items-center gap-1.5 border-b border-border/60 px-2"
                >
                  {dot(row.unread)}
                  {monogram(row.sender, "size-3.5")}
                  {senderText(row.sender, row.unread)}
                  {timeText(row.h, row.m)}
                </div>
              ) : (
                <div
                  key={i}
                  className="flex gap-1.5 border-b border-border/60 px-2 py-1.5"
                >
                  <span className="pt-0.5">{dot(row.unread)}</span>
                  {monogram(row.sender, "size-4")}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {senderText(row.sender, row.unread)}
                      {timeText(row.h, row.m)}
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

type AppearanceLayout = "split" | "pickers" | "calm";

function AppearancePage() {
  // Temporary: three mockups to compare in place. Once a direction is picked,
  // this switcher goes away and only the chosen layout remains.
  const [mockup, setMockup] = useState<AppearanceLayout>("split");

  return (
    <Page title="Appearance" description="Choose how BetterBox looks">
      <div className="flex items-center gap-2 border-b pb-4">
        <span className="font-mono text-[10px] font-medium tracking-[0.5px] text-muted-foreground/70 uppercase">
          Mockup
        </span>
        <SegmentedButtons
          options={[
            { value: "split", label: "Split" },
            { value: "pickers", label: "Pickers" },
            { value: "calm", label: "Calm" },
          ]}
          value={mockup}
          onChange={setMockup}
        />
      </div>

      {mockup === "split" && <AppearanceSplit />}
      {mockup === "pickers" && <AppearancePickers />}
      {mockup === "calm" && <AppearanceCalm />}
    </Page>
  );
}

// ── shared appearance controls ───────────────────────────────────────────────

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

/** Sidebar visibility as toggle chips — click to hide/show (Inbox is fixed). */
function SidebarChips() {
  const { hiddenNav } = useSettings();
  const toggle = (id: string, show: boolean) =>
    updateSettings({
      hiddenNav: show
        ? hiddenNav.filter((item) => item !== id)
        : [...hiddenNav, id],
    });
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-[11.5px] text-muted-foreground/70">
        Inbox
      </span>
      {HIDEABLE_NAV.map((item) => {
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
  );
}

function ThemeCards() {
  const { theme, setTheme } = useTheme();
  const card = (
    value: "light" | "dark" | "system",
    label: string,
    bg: string,
    fg: string,
  ) => (
    <button
      type="button"
      aria-pressed={theme === value}
      onClick={() => setTheme(value)}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-lg border p-2.5 transition-colors",
        theme === value
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/50",
      )}
    >
      <span
        className="flex h-10 w-full items-center justify-center rounded-md border border-border"
        style={{ background: bg }}
      >
        <span className="h-2 w-10 rounded-full" style={{ background: fg }} />
      </span>
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
  return (
    <div className="flex gap-2">
      {card("light", "Light", "#ffffff", "#111827")}
      {card("dark", "Dark", "#0f1011", "#e5e7eb")}
      {card(
        "system",
        "System",
        "linear-gradient(90deg,#ffffff 50%,#0f1011 50%)",
        "#9ca3af",
      )}
    </div>
  );
}

function DensityCards() {
  const { density } = useSettings();
  const card = (
    value: "compact" | "comfortable",
    label: string,
    body: ReactNode,
  ) => (
    <button
      type="button"
      aria-pressed={density === value}
      onClick={() => updateSettings({ density: value })}
      className={cn(
        "flex flex-1 flex-col gap-2.5 rounded-lg border p-3 text-left transition-colors",
        density === value
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/50",
      )}
    >
      <div className="flex flex-col gap-1.5">{body}</div>
      <span className="text-[12.5px] font-medium">{label}</span>
    </button>
  );
  return (
    <div className="flex gap-2">
      {card(
        "compact",
        "Dense",
        Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-1 rounded bg-muted-foreground/40" />
        )),
      )}
      {card(
        "comfortable",
        "Comfortable",
        Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="h-1 w-2/3 rounded bg-muted-foreground/40" />
            <span className="h-1 w-full rounded bg-muted-foreground/20" />
          </div>
        )),
      )}
    </div>
  );
}

// ── the three mockups ────────────────────────────────────────────────────────

/** 1 · Split — controls left, preview pinned right. */
function AppearanceSplit() {
  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_232px]">
      <div className="flex flex-col gap-5">
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
        <div>
          <BlockLabel>Sidebar</BlockLabel>
          <SidebarChips />
        </div>
      </div>
      <div className="sm:sticky sm:top-0 sm:self-start">
        <InterfacePreview />
      </div>
    </div>
  );
}

/** 2 · Pickers — click visual cards instead of toggles. */
function AppearancePickers() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <BlockLabel>Theme</BlockLabel>
        <ThemeCards />
      </div>
      <div>
        <BlockLabel>Density</BlockLabel>
        <DensityCards />
      </div>
      <Field label="Accent">
        <AccentDots />
      </Field>
      <Field label="Clock">
        <ClockSegmented />
      </Field>
      <Field label="Profile icons">
        <AvatarsSwitch />
      </Field>
      <div>
        <BlockLabel>Sidebar</BlockLabel>
        <SidebarChips />
      </div>
    </div>
  );
}

/** 3 · Calm — hero preview, then a tight two-column grid + chips. */
function AppearanceCalm() {
  return (
    <div className="flex flex-col gap-6">
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
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-2/40 bg-accent-2/[0.08] px-2 py-1 font-mono text-[11px] font-medium tracking-wide text-accent-2-hover uppercase">
            <Wrench className="size-3" />
            {session?.user.role ?? "USER"}
          </span>
        </SettingRow>
      </PageSection>

      <PageSection title="Recording">
        <div className="flex items-center justify-between gap-6 rounded-lg border border-accent-2/30 bg-accent-2/[0.05] px-3.5 py-3">
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
              <span className="flex gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </PageSection>
    </Page>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

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
