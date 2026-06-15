import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MailIcon, PlayIcon, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import {
  Composer,
  plainToHtml,
  type ComposerContent,
} from "@/components/composer";
import { InboxTiles, type Reading } from "@/components/inbox-tiles";
import { PullRequestsPage } from "@/components/pull-requests";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/sonner";
import { GITHUB_URL, GithubMark } from "@/components/github-mark";
import { useAccountScope } from "@/hooks/use-account-scope";
import { fetchFullEmail, isReplyDraft } from "@/lib/mail-queries";
import type { Folder } from "@/lib/folders";
import { makeDemoAccounts, markTestAccountRead } from "@/lib/test-account";
import { cn } from "@/lib/utils";

// Layout effect on the client (avoids the post-paint flash), plain effect on
// the server (where useLayoutEffect would warn).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Landing follows the OS color scheme (system), independent of the in-app
 *  theme setting — returns the `dark`/`light` class to scope onto the page. */
function useSystemTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // Layout effect so the correct scheme is applied before the browser paints —
  // otherwise a light-mode visitor sees a dark frame first.
  useIsoLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}

/**
 * Signed-out landing page — the "BetterBox Landing v6" marketing layout, styled
 * with the app's standard shadcn tokens (background/card/border/foreground/
 * muted-foreground) and the default type scale. Follows the OS color scheme
 * (system), independent of the in-app theme. The only bespoke flourish is the
 * animated "live" pulse dot.
 */

const COL = "mx-auto max-w-6xl px-5 sm:px-8 md:px-10";

/** The animated "live" status dot, reused across hero/demo/loading. */
function PulseDot() {
  return (
    <span className="size-2 flex-none rounded-full bg-success motion-safe:animate-bb-pulse" />
  );
}

function Wordmark({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-flex flex-none items-center justify-center rounded-md bg-primary text-primary-foreground",
          small ? "size-5" : "size-6",
        )}
      >
        <MailIcon className={small ? "size-3" : "size-3.5"} />
      </span>
      <span
        className={cn(
          "font-mono font-semibold tracking-tight whitespace-nowrap text-foreground",
          small ? "text-xs" : "text-sm",
        )}
      >
        BetterBox
      </span>
    </span>
  );
}

const WL_KEY = "betterbox-waitlist-email";

/** Waitlist capture: idle → open (email field) → done. Persists in
 *  localStorage so every instance agrees on reload. */
function Waitlist({ big = false }: { big?: boolean }) {
  const stored = (() => {
    try {
      return localStorage.getItem(WL_KEY);
    } catch {
      return null;
    }
  })();
  const [phase, setPhase] = useState<"idle" | "open" | "done">(
    stored ? "done" : "idle",
  );
  const [email, setEmail] = useState(stored || "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "open") inputRef.current?.focus();
  }, [phase]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) {
      inputRef.current?.focus();
      return;
    }
    try {
      localStorage.setItem(WL_KEY, email);
    } catch {
      /* ignore */
    }
    setPhase("done");
  };

  const height = big ? "h-11" : "h-10";
  const minH = big ? "min-h-11" : "min-h-10";

  if (phase === "done") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 font-mono text-xs text-muted-foreground",
          minH,
        )}
      >
        <span className="text-success">✓</span>
        <span>you're on the list — one email at launch, that's it</span>
      </div>
    );
  }

  if (phase === "open") {
    return (
      <form onSubmit={submit} className={cn("flex justify-center gap-2", minH)}>
        <input
          ref={inputRef}
          type="email"
          value={email}
          placeholder="you@yourdomain.dev"
          onChange={(e) => setEmail(e.target.value)}
          className={cn(
            "rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:border-ring",
            height,
            big ? "w-72" : "w-60",
          )}
        />
        <Button
          type="submit"
          size={big ? "lg" : "default"}
          className={cn(height, big && "px-6 text-base")}
        >
          Notify me
        </Button>
      </form>
    );
  }

  return (
    <div className={cn("flex justify-center", minH)}>
      <Button
        type="button"
        size={big ? "lg" : "default"}
        onClick={() => setPhase("open")}
        className={cn(height, big && "px-6 text-base")}
      >
        Join the waitlist
      </Button>
    </div>
  );
}

function SectionLabel({
  children,
  caption,
}: {
  children: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="mb-6 flex items-baseline">
      <span className="font-mono text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
        {children}
      </span>
      {caption && (
        <span className="ml-auto font-mono text-xs text-muted-foreground/60">
          {caption}
        </span>
      )}
    </div>
  );
}

function Wrap({
  children,
  label,
  caption,
  id,
}: {
  children: React.ReactNode;
  label?: string;
  caption?: string;
  id?: string;
}) {
  return (
    <section id={id} className={COL}>
      <div className="border-t border-border pt-10 pb-14">
        {label && <SectionLabel caption={caption}>{label}</SectionLabel>}
        {children}
      </div>
    </section>
  );
}

function Header() {
  const toPlan = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("v6-plan");
    if (el)
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 24,
        behavior: "smooth",
      });
  };
  return (
    <div className={COL}>
      <header className="flex h-16 items-center gap-3 sm:gap-4">
        <Wordmark />
        <span className="ml-auto hidden font-mono text-xs text-muted-foreground/60 sm:inline">
          in development
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="BetterBox on GitHub"
          className="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:ml-0"
        >
          <GithubMark className="size-[18px]" />
        </a>
        <Button type="button" onClick={toPlan} className="shrink-0">
          <span className="hidden sm:inline">Join the waitlist</span>
          <span className="sm:hidden">Waitlist</span>
        </Button>
      </header>
    </div>
  );
}

function Hero() {
  return (
    <section className={cn(COL, "pt-10 text-center sm:pt-16")}>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 whitespace-nowrap">
        <PulseDot />
        <span className="text-sm text-muted-foreground">
          In development — waitlist open
        </span>
      </div>

      <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-5xl md:text-6xl">
        Gmail, at developer speed.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
        A fast, dense client for every Google inbox you have. Keyboard-first,
        built on the Gmail API — not another email service.
      </p>

      <div className="mt-8">
        <Waitlist big />
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section className={cn(COL, "py-10 sm:py-16")}>
      <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <PulseDot />
        live demo · sample data
      </div>
      {/* Desktop: the full live app, in a box. */}
      <div className="hidden rounded-2xl border border-border bg-card p-2.5 md:block">
        <div className="relative h-[680px] overflow-hidden rounded-lg bg-background">
          <LandingDemo />
        </div>
      </div>
      {/* Mobile: the live multi-pane app isn't meaningful at phone widths — the
          README walkthrough video goes here instead. Boilerplate placeholder
          until the video exists. */}
      <div className="rounded-2xl border border-border bg-card p-2.5 md:hidden">
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <PlayIcon className="size-5 translate-x-px text-muted-foreground/70" />
          </span>
          <p className="text-sm text-pretty text-muted-foreground">
            Walkthrough video coming soon.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/60">
            try it on a desktop for the live demo
          </p>
        </div>
      </div>
    </section>
  );
}

const DEMO_USER = { name: "You", email: "personal@example.com", image: null };
const noop = () => {};

/** The demo slot: a fully self-contained copy of the real app — sidebar,
 *  folders, the ⌘K palette and compose — on two seeded test accounts. A sealed
 *  sandbox: everything stays inside this box (overlays portal here via the
 *  `transform` containing block, not to <body>), nothing hits the network,
 *  nothing sends, and settings are disabled. Client-only; theme follows the
 *  page (system). */
function LandingDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const boxRef = useRef<HTMLDivElement>(null);
  // ⌘K only fires while the pointer/focus is inside the demo.
  const activeRef = useRef(false);
  const queryClient = useQueryClient();

  // Bumped after a read-state change so the demo accounts (and their unread
  // counts) are recomputed from the test store.
  const [readVersion, setReadVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const accounts = useMemo(() => makeDemoAccounts(), [readVersion]);
  const accountIds = useMemo(
    () => accounts.map((a) => a.accountId),
    [accounts],
  );
  const { scopeIds, allOn, toggle } = useAccountScope(accountIds);

  const [folder, setFolder] = useState<Folder>("inbox");
  const [reading, setReading] = useState<Reading | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  // Which surface fills the demo: the mailbox or a developer page (PRs).
  const [devView, setDevView] = useState<"pull_requests" | null>(null);

  // Picking a mailbox folder leaves any dev page; opening a dev page enters it.
  const selectFolder = useCallback((next: Folder) => {
    setDevView(null);
    setFolder(next);
  }, []);
  const openDevPage = useCallback((id: string) => {
    if (id === "pull_requests") setDevView("pull_requests");
  }, []);
  const [draftRef, setDraftRef] = useState<{
    accountId: string;
    emailId: string;
  } | null>(null);
  const [composeContent, setComposeContent] = useState<ComposerContent>({
    fromId: null,
    to: "",
    subject: "",
    body: "",
  });
  const patchComposeContent = useCallback(
    (patch: Partial<ComposerContent>) =>
      setComposeContent((current) => ({ ...current, ...patch })),
    [],
  );

  const openCompose = useCallback(() => {
    setComposeContent({ fromId: null, to: "", subject: "", body: "" });
    setDraftRef(null);
    setComposeOpen(true);
  }, []);
  const editDraft = useCallback(async (accountId: string, emailId: string) => {
    // Reply-drafts open the thread (reader + inline reply); new drafts compose.
    try {
      const full = await fetchFullEmail(accountId, emailId);
      if (isReplyDraft(full)) {
        setReading({ accountId, emailId });
        return;
      }
      setComposeContent({
        fromId: accountId,
        to: full.to ?? "",
        subject:
          !full.subject || full.subject === "(no subject)" ? "" : full.subject,
        body: full.bodyHtml ?? (full.body ? plainToHtml(full.body) : ""),
      });
      setDraftRef({ accountId, emailId });
      setComposeOpen(true);
      return;
    } catch {
      /* fall through to an empty composer pointed at this draft */
    }
    setComposeContent({ fromId: accountId, to: "", subject: "", body: "" });
    setDraftRef({ accountId, emailId });
    setComposeOpen(true);
  }, []);

  const scopedAccounts = useMemo(
    () => accounts.filter((a) => scopeIds.includes(a.accountId)),
    [accounts, scopeIds],
  );

  const goInbox = useCallback(() => {
    toggle("all");
    setDevView(null);
    setFolder("inbox");
  }, [toggle]);

  // "Mark all read" in the demo: update the test store, refresh the lists, and
  // recompute the unread counts. Nothing leaves the sandbox.
  const markAccountRead = useCallback(
    (accountId: string) => {
      markTestAccountRead(accountId);
      queryClient.invalidateQueries({ queryKey: ["emails", accountId] });
      setReadVersion((v) => v + 1);
      const email = accounts.find((a) => a.accountId === accountId)?.email;
      toast("Marked all read", { description: email });
    },
    [accounts, queryClient],
  );

  // ⌘K toggles the palette — but only when the demo is the focus, so it never
  // hijacks the rest of the marketing page.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const inside =
        activeRef.current || !!boxRef.current?.contains(document.activeElement);
      if (!inside) return;
      e.preventDefault();
      setCmdOpen((o) => !o);
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!mounted) return <DemoLoading />;

  return (
    // Scaled to 80% so the full app fits the demo box comfortably; the inner is
    // sized to 125% so it still fills the frame after scaling. The `transform`
    // also makes this the containing block for the `fixed` overlays (compose,
    // ⌘K palette), keeping them inside the demo instead of escaping to the page.
    <div
      ref={boxRef}
      onMouseEnter={() => (activeRef.current = true)}
      onMouseLeave={() => (activeRef.current = false)}
      className="absolute top-0 left-0 flex h-[125%] w-[125%] origin-top-left scale-[0.8] bg-background text-left text-foreground"
    >
      {/* Rendered inside the scaled box so its fixed positioning is contained
          here (transform → containing block) instead of escaping to the page. */}
      <Toaster position="bottom-right" />
      <CommandMenu
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onOpenSettings={noop}
        onGoInbox={goInbox}
        onCompose={openCompose}
        onMarkAccountRead={markAccountRead}
        accounts={accounts}
        searchAccounts={scopedAccounts}
        container={boxRef}
      />
      <Composer
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accounts={accounts}
        content={composeContent}
        onContentChange={patchComposeContent}
        draft={draftRef}
      />
      <AppSidebar
        embedded
        demoUser={DEMO_USER}
        accounts={accounts}
        scopeIds={scopeIds}
        allOn={allOn}
        folder={folder}
        onFolder={selectFolder}
        onToggleScope={toggle}
        onOpenCommand={() => setCmdOpen(true)}
        onOpenSettings={noop}
        onCompose={openCompose}
        onOpenDevPage={openDevPage}
        activeDevId={devView ?? undefined}
      />
      <div className="flex h-full min-w-0 flex-1 overflow-hidden">
        {devView === "pull_requests" ? (
          <PullRequestsPage demo />
        ) : (
          <InboxTiles
            accounts={accounts}
            scopeIds={scopeIds}
            folder={folder}
            reading={reading}
            onOpenEmail={(accountId, emailId) =>
              setReading({ accountId, emailId })
            }
            onCloseReader={() => setReading(null)}
            onRemovePane={toggle}
            onEditDraft={editDraft}
            portalContainer={boxRef}
          />
        )}
      </div>
    </div>
  );
}

function DemoLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground/60">
        <PulseDot />
        loading live demo…
      </div>
    </div>
  );
}

const SPEC_CELLS: { label: React.ReactNode; body: React.ReactNode }[] = [
  {
    label: "multi-account",
    body: "Every Google inbox in one list. Colored dots keep accounts apart; views merge them.",
  },
  {
    label: (
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    ),
    body: "Compose, switch accounts, export, search — every action is a keystroke.",
  },
  {
    label: "open source",
    body: "The full client is on GitHub. Self-host it free with your own OAuth app, or let us run it.",
  },
  {
    label: "webhooks",
    body: "New-mail events delivered to your endpoint, signed and retried.",
  },
  {
    label: "api log",
    body: "Every Gmail API call on the record — status, latency, units.",
  },
  {
    label: "exports",
    body: (
      <>
        Any thread as Markdown, JSON, or plain text — or the raw MIME source,
        one <Kbd>⌥R</Kbd> away.
      </>
    ),
  },
];

function Spec() {
  return (
    <Wrap label="what it is" caption="the short version">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {SPEC_CELLS.map((cell, i) => (
            <div key={i} className="border-t border-l border-border p-5">
              <div className="mb-2 flex h-5 items-center font-mono text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
                {cell.label}
              </div>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {cell.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}

function Plans() {
  return (
    <Wrap id="v6-plan" label="plan" caption="two plans">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="-m-px grid grid-cols-1 md:grid-cols-2">
          {/* Free — self-host */}
          <div className="flex flex-col items-center border-t border-l border-border px-8 py-10 text-center">
            <span className="font-mono text-xs tracking-wide text-muted-foreground/60 uppercase">
              self-host
            </span>
            <span className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
              Free
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">
              Full source code. Run it on your own infra with your own Google
              OAuth app.
            </p>
            <a
              href="https://github.com/aidankmcalister/betterbox"
              className="mt-6 font-mono text-xs text-foreground underline underline-offset-2"
            >
              View on GitHub
            </a>
          </div>

          {/* Hosted — $5, the recommended paid plan */}
          <div className="relative flex flex-col items-center border-t border-l border-border px-8 py-10 text-center">
            <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-primary uppercase">
              <Sparkles className="size-3" />
              recommended
            </span>
            <span className="font-mono text-xs tracking-wide text-muted-foreground/60 uppercase">
              hosted
            </span>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight text-foreground">
                $5
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">
              Everything, running. No setup, no ops. 7-day trial, no card
              required.
            </p>
            <div className="mt-6">
              <Waitlist big />
            </div>
            <span className="mt-4 font-mono text-xs text-muted-foreground/60">
              cancel any time
            </span>
          </div>
        </div>
      </div>
    </Wrap>
  );
}

const FAQ_ITEMS = [
  {
    q: "Is BetterBox a new email service?",
    a: "No. BetterBox is a client for the Gmail accounts you already have, built on the Gmail API. Nothing migrates; your mail stays in Google.",
  },
  {
    q: "Self-host or hosted — what's the difference?",
    a: "Two ways to run the same client. Self-host is free and open source: bring your own Google OAuth app and run it on your own infra. Hosted is $5/month — we run and update it, you just sign in. 7-day trial, no card.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. The full client is on GitHub — audit every line, self-host it for free, or fork it. Hosted runs the same code, maintained by us.",
  },
  {
    q: "Why is there a waitlist?",
    a: "The waitlist is for the hosted plan. Hosted is going through Google's API verification; until it clears, sign-ins are limited to allow-listed accounts. Self-host isn't gated — your own OAuth app, your own queue.",
  },
  {
    q: "Does BetterBox store my mail?",
    a: "On either plan, messages are fetched live from the Gmail API when you open the app. Webhook and analytics data is metadata — counts, timings, statuses — not message content.",
  },
  {
    q: "When does hosted launch?",
    a: "When verification clears and the client is ready. Waitlist members get access first, in order. Self-host works today, straight from source.",
  },
];

function Faq() {
  return (
    <Wrap label="faq">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 md:grid-cols-2">
          {FAQ_ITEMS.map((it) => (
            <div
              key={it.q}
              className="border-t border-l border-border p-6"
            >
              <h4 className="mb-2 text-[15px] font-medium tracking-tight text-foreground">
                {it.q}
              </h4>
              <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {it.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Wrap>
  );
}

function Footer() {
  return (
    <footer className={cn(COL, "pb-10")}>
      <div className="flex flex-col items-start gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:gap-5">
        <Wordmark small />
        <span className="font-mono text-xs text-muted-foreground/60">
          in development · restricted to test accounts while Google verification
          is pending
        </span>
        <div className="flex items-center gap-4 font-mono text-xs sm:ml-auto">
          <a
            href="mailto:hello@betterbox.dev"
            className="text-muted-foreground"
          >
            hello@betterbox.dev
          </a>
          <Link to="/privacy" className="text-muted-foreground">
            Privacy
          </Link>
          <span className="text-muted-foreground/60">© 2026</span>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  const theme = useSystemTheme();

  // Mirror the system theme onto <html> while the landing is mounted. Overlays
  // (compose From menu, tag picker, tooltips) portal to <body>, so they read
  // the root class — without this they'd inherit the stored in-app theme and
  // render light inside a dark demo. Restored to the app's theme on unmount.
  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    const had = {
      dark: root.classList.contains("dark"),
      light: root.classList.contains("light"),
    };
    const prevScheme = root.style.colorScheme;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
    return () => {
      root.classList.remove("light", "dark");
      if (had.dark) root.classList.add("dark");
      else if (had.light) root.classList.add("light");
      root.style.colorScheme = prevScheme;
    };
  }, [theme]);

  return (
    <div
      className={cn(
        theme,
        "h-svh w-full overflow-y-auto bg-background text-foreground",
      )}
    >
      <Header />
      <Hero />
      <Demo />
      <Spec />
      <Plans />
      <Faq />
      <Footer />
    </div>
  );
}
