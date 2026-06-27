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
import { MailIcon, PlayIcon, TriangleAlertIcon, XIcon } from "lucide-react";
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

/** Demo walkthrough video for mobile/tablet (live multi-pane demo isn't meaningful
 *  there). Empty → "coming soon" placeholder. Kept in sync with the README video slot. */
const DEMO_VIDEO_URL: string = "/betterbox-demo.mp4";

const isYouTube = (url: string) =>
  url.includes("youtube.com") || url.includes("youtu.be");

/** Normalize a YouTube watch/short/embed URL to its embeddable form. */
function youTubeEmbedUrl(url: string): string {
  const id = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/)([\w-]{11})/)?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : url;
}

// Layout effect on the client (avoids post-paint flash), plain effect on the
// server (where useLayoutEffect would warn).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Landing follows the OS color scheme, independent of the in-app theme — returns
 *  the `dark`/`light` class to scope onto the page. */
function useSystemTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  // Layout effect so the scheme applies before paint — else a light-mode visitor
  // sees a dark frame first.
  useIsoLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}

/** Signed-out landing page — the "BetterBox Landing v6" marketing layout, on the
 *  app's standard shadcn tokens and type scale. Follows the OS color scheme,
 *  independent of the in-app theme. Only bespoke flourish: the animated pulse dot. */

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

/** Smooth-scroll to the plan section. The landing is its own `overflow-y-auto`
 *  container, not the window — hence scrollIntoView, not window.scrollTo. */
function scrollToPlan() {
  document
    .getElementById("v6-plan")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Waitlist capture: idle → open (email field) → done. Submits to /api/waitlist
 *  (tagged with `source` to track which placement converts) and mirrors the email
 *  to localStorage so every instance shows the success state on reload. */
function Waitlist({ big = false, source }: { big?: boolean; source: string }) {
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (phase === "open") inputRef.current?.focus();
  }, [phase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/.+@.+\..+/.test(email)) {
      setError("That does not look like a valid email.");
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.status === 400) {
        setError("That does not look like a valid email.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Try again.");
        return;
      }
      // ok or already_registered → same success state. Mirror to localStorage
      // so it survives a reload.
      try {
        localStorage.setItem(WL_KEY, email);
      } catch {
        /* ignore */
      }
      setPhase("done");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
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
        <span>you're on the list. One email at launch, that's it.</span>
      </div>
    );
  }

  if (phase === "open") {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <form
          onSubmit={submit}
          className={cn(
            "mx-auto flex w-full justify-center gap-2",
            big ? "max-w-sm" : "max-w-xs",
            minH,
          )}
        >
          <input
            ref={inputRef}
            type="email"
            value={email}
            placeholder="you@yourdomain.dev"
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(
              "min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none focus:border-ring disabled:opacity-60",
              height,
            )}
          />
          <Button
            type="submit"
            size={big ? "lg" : "default"}
            disabled={submitting}
            aria-busy={submitting}
            className={cn("relative shrink-0", height, big && "px-6 text-base")}
          >
            {/* Keep the label in the DOM (invisible) so width doesn't jump
                when it swaps to the spinner. */}
            <span className={cn(submitting && "invisible")}>Notify me</span>
            {submitting && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              </span>
            )}
          </Button>
        </form>
        {error && <p className="font-mono text-xs text-destructive">{error}</p>}
      </div>
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
        Join the waitlist →
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
        <Button type="button" onClick={scrollToPlan} className="shrink-0">
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
          In development. Waitlist open
        </span>
      </div>

      <h1 className="mx-auto max-w-3xl text-4xl leading-tight font-semibold tracking-tight text-balance text-foreground sm:text-5xl md:text-6xl">
        All your inboxes. One tab.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
        A new interface for the Gmail accounts you already have. See every inbox
        side by side in one tab, with your mail still living in Google.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <Button size="lg" className="h-11 px-6 text-base">
            Self-host for free →
          </Button>
        </a>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={scrollToPlan}
          className="h-11 px-6 text-base"
        >
          Join the waitlist →
        </Button>
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
      <div className="hidden rounded-2xl border border-border bg-card p-2.5 md:block">
        <div className="relative h-[680px] overflow-hidden rounded-lg bg-background">
          <LandingDemo />
        </div>
      </div>
      {/* Mobile/tablet: live multi-pane app isn't meaningful at phone widths —
          walkthrough video goes here instead, driven by DEMO_VIDEO_URL; falls
          back to a placeholder until a URL is set. */}
      <div className="rounded-2xl border border-border bg-card p-2.5 md:hidden">
        {DEMO_VIDEO_URL ? (
          isYouTube(DEMO_VIDEO_URL) ? (
            <iframe
              src={youTubeEmbedUrl(DEMO_VIDEO_URL)}
              title="BetterBox walkthrough"
              className="aspect-video w-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <video
              src={DEMO_VIDEO_URL}
              autoPlay
              muted
              loop
              playsInline
              className="aspect-139/90 w-full rounded-lg"
            />
          )
        ) : (
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
        )}
      </div>
    </section>
  );
}

const DEMO_USER = { name: "You", email: "personal@example.com", image: null };
const noop = () => {};

/** The demo slot: a self-contained copy of the real app (sidebar, folders, ⌘K
 *  palette, compose) on two seeded test accounts. Sealed sandbox — overlays
 *  portal here via the `transform` containing block (not <body>), nothing hits
 *  the network or sends, settings disabled. Client-only; theme follows the page. */
function LandingDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const boxRef = useRef<HTMLDivElement>(null);
  // ⌘K only fires while the pointer/focus is inside the demo.
  const activeRef = useRef(false);
  const queryClient = useQueryClient();

  // Bumped after a read-state change to recompute demo accounts + unread counts
  // from the test store.
  const [readVersion, setReadVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuild the demo accounts whenever readVersion is bumped (after a sandbox read-state change).
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

  // Picking a folder leaves any dev page; opening a dev page enters it.
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
    cc: "",
    bcc: "",
    subject: "",
    body: "",
    reply: null,
  });
  const patchComposeContent = useCallback(
    (patch: Partial<ComposerContent>) =>
      setComposeContent((current) => ({ ...current, ...patch })),
    [],
  );

  const openCompose = useCallback(() => {
    setComposeContent({
      fromId: null,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      reply: null,
    });
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
        cc: full.cc ?? "",
        bcc: "",
        subject:
          !full.subject || full.subject === "(no subject)" ? "" : full.subject,
        body: full.bodyHtml ?? (full.body ? plainToHtml(full.body) : ""),
        reply: null,
      });
      setDraftRef({ accountId, emailId });
      setComposeOpen(true);
      return;
    } catch {
      /* fall through to an empty composer pointed at this draft */
    }
    setComposeContent({
      fromId: accountId,
      to: "",
      cc: "",
      bcc: "",
      subject: "",
      body: "",
      reply: null,
    });
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

  // "Mark all read" in the demo: update the test store, refresh lists, recompute
  // unread counts. Nothing leaves the sandbox.
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

  // ⌘K toggles the palette only when the demo is focused, so it never hijacks
  // the rest of the marketing page.
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
    // Scaled to 80% (inner sized 125% to still fill the frame). The `transform`
    // also makes this the containing block for the `fixed` overlays (compose, ⌘K
    // palette), keeping them inside the demo instead of escaping to the page.
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only gates the demo's ⌘K shortcut; it's a non-essential enhancement with no keyboard equivalent needed.
    <div
      ref={boxRef}
      onMouseEnter={() => (activeRef.current = true)}
      onMouseLeave={() => (activeRef.current = false)}
      className="absolute top-0 left-0 flex h-[125%] w-[125%] origin-top-left scale-[0.8] bg-background text-left text-foreground"
    >
      {/* Inside the scaled box so its fixed positioning is contained here
          (transform → containing block) instead of escaping to the page. */}
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
    body: "Command palette. Compose, switch accounts, search, and export from one menu.",
  },
  {
    label: "open source",
    body: "Full source on GitHub. Self-host free with your own credentials. No data leaves your machine.",
  },
  {
    label: "exports",
    body: (
      <>
        Any thread as Markdown, JSON, or plain text, or the raw MIME source, one{" "}
        <KbdGroup>
          <Kbd>⌥</Kbd>
          <Kbd>R</Kbd>
        </KbdGroup>{" "}
        away.
      </>
    ),
  },
  {
    label: "private by design",
    body: "Every remote subresource in an email, images, stylesheets, fonts, media, is stripped or proxied. Trackers never see your IP.",
  },
  {
    label: "integrations",
    body: "GitHub is connected now. Linear is next. Your PRs, your issues, and your email in one tab.",
  },
];

function Spec() {
  return (
    <Wrap label="what it is" caption="the short version">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {SPEC_CELLS.map((cell, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: SPEC_CELLS is a static const list, never reordered.
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
          <div className="flex flex-col items-center justify-center border-t border-l border-border px-8 py-10 text-center">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              Free
            </span>
            <span className="mt-2 font-mono text-xs tracking-wide text-muted-foreground/60 uppercase">
              self-host
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">
              Full source on GitHub. Your own OAuth app. Your own database.
              Available today.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 font-mono text-xs text-foreground underline underline-offset-2"
            >
              View on GitHub →
            </a>
          </div>

          <div className="flex flex-col items-center justify-center border-t border-l border-border px-8 py-10 text-center">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              $5
            </span>
            <span className="mt-2 font-mono text-xs tracking-wide text-muted-foreground/60 uppercase">
              /month · coming soon
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">
              Everything works out of the box. No setup, no OAuth app, no
              database. Just BetterBox.
            </p>
            <div className="mt-6 w-full">
              <Waitlist big source="plan" />
            </div>
          </div>
        </div>
      </div>
    </Wrap>
  );
}

const FAQ_ITEMS = [
  {
    q: "What is BetterBox exactly?",
    a: "A client for the Gmail accounts you already have, built on the Gmail API. Nothing migrates, your mail stays in Google. It started as a Gmail client and is expanding into a workspace: email, pull requests, and issues in one tab. GitHub is connected now. Linear is next.",
  },
  {
    q: "Self-host or hosted: what's the difference?",
    a: "Two ways to run the same client. Self-host is free and open source: bring your own OAuth credentials and run it on your own infra. Hosted is $5/mo and coming soon. Join the waitlist to be first in.",
  },
  {
    q: "Is it really open source?",
    a: "Yes. The full client is on GitHub: audit every line, self-host it for free, or fork it. Hosted runs the same code, maintained by us.",
  },
  {
    q: "Why does Google show a security warning when I sign in?",
    a: "BetterBox is a hobby project and Google's verification costs ~$750/yr. I can't justify that right now, so you'll see an 'unverified app' warning when you sign in. Click Advanced, then Proceed to BetterBox to continue. You can read the privacy policy or self-host if you'd prefer.",
  },
  {
    q: "Does BetterBox store my mail?",
    a: "Messages are fetched live from the Gmail API when you open the app and are never stored on our servers. The only data we store is your account tokens, session records, and settings.",
  },
  {
    q: "When does hosted launch?",
    a: "Soon. Join the waitlist and you'll be the first to know. Self-host works today, straight from the repo.",
  },
];

function Faq() {
  return (
    <Wrap label="faq">
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="-m-px grid grid-cols-1 md:grid-cols-2">
          {FAQ_ITEMS.map((it) => (
            <div key={it.q} className="border-t border-l border-border p-6">
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
          in development · self-host is open · hosted coming soon
        </span>
        <div className="flex items-center gap-4 font-mono text-xs sm:ml-auto">
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground"
          >
            Issues
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

/** Shown when Better Auth bounces a blocked sign-in back with `?error=UNKNOWN`
 *  (or FORBIDDEN) — the ALLOWED_EMAILS hook rejecting an off-list account.
 *  Dismissible (clears the param) so it never blocks the page after it's read. */
function AccessErrorBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "UNKNOWN" || error === "FORBIDDEN") setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className={cn(COL, "pt-4")}>
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"
      >
        <TriangleAlertIcon
          className="mt-0.5 size-[18px] shrink-0"
          strokeWidth={2}
        />
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          This account doesn't have access yet. Join the waitlist or self-host
          with your own credentials.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="-mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-destructive/15"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function LandingPage() {
  const theme = useSystemTheme();

  // Mirror the system theme onto <html> while mounted. Overlays portal to <body>
  // and read the root class — without this they'd inherit the stored in-app theme
  // and render light inside a dark demo. Restored to the app's theme on unmount.
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
      <AccessErrorBanner />
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
