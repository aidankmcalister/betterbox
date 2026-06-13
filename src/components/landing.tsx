import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { InboxTiles, type Reading } from "@/components/inbox-tiles";
import { Button } from "@/components/ui/button";
import { makeDemoAccounts } from "@/lib/test-account";
import { cn } from "@/lib/utils";

/**
 * Signed-out landing page — the "BetterBox Landing v6" marketing layout, styled
 * with the app's standard shadcn tokens (background/card/border/foreground/
 * muted-foreground) and the default type scale. Always dark, regardless of the
 * in-app theme. The only bespoke flourish is the animated "live" pulse dot.
 */

const COL = "mx-auto max-w-6xl px-10";

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
          "inline-flex flex-none items-center justify-center rounded-md bg-primary font-bold tracking-tight text-primary-foreground",
          small ? "size-5 text-[10px]" : "size-6 text-sm",
        )}
      >
        B
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
      <header className="flex h-16 items-center gap-4">
        <Wordmark />
        <span className="ml-auto font-mono text-xs text-muted-foreground/60">
          in development
        </span>
        <Button type="button" onClick={toPlan}>
          Join the waitlist
        </Button>
      </header>
    </div>
  );
}

function Hero() {
  return (
    <section className={cn(COL, "pt-16 text-center")}>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 whitespace-nowrap">
        <PulseDot />
        <span className="text-sm text-muted-foreground">
          In development — waitlist open
        </span>
      </div>

      <h1 className="mx-auto max-w-3xl text-6xl leading-tight font-semibold tracking-tight text-balance text-foreground">
        Gmail, at developer speed.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
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
    <section className={cn(COL, "py-16")}>
      <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
        <PulseDot />
        live demo · sample data
      </div>
      <div className="rounded-2xl border border-border bg-card p-2.5">
        <div className="relative h-[680px] overflow-hidden rounded-lg bg-background">
          <LandingDemo />
        </div>
      </div>
    </section>
  );
}

/** The demo slot: the real inbox running on two seeded test accounts — fully
 *  browsable, nothing actually sends. Client-only (the inbox is heavy and uses
 *  localStorage) and forced dark to sit inside the dark demo frame. */
function LandingDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const accounts = useMemo(() => makeDemoAccounts(), []);
  const scopeIds = useMemo(() => accounts.map((a) => a.accountId), [accounts]);
  const [reading, setReading] = useState<Reading | null>(null);

  if (!mounted) return <DemoLoading />;

  return (
    <div className="dark absolute inset-0 bg-background text-left text-foreground">
      <InboxTiles
        accounts={accounts}
        scopeIds={scopeIds}
        folder="inbox"
        reading={reading}
        onOpenEmail={(accountId, emailId) => setReading({ accountId, emailId })}
        onCloseReader={() => setReading(null)}
        onRemovePane={() => {}}
      />
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

const SPEC_CELLS: [string, string][] = [
  [
    "multi-account",
    "Every Google inbox in one list. Colored dots keep accounts apart; views merge them.",
  ],
  [
    "⌘k",
    "Compose, switch accounts, export, search — every action is a keystroke.",
  ],
  ["raw mime", "The original source of any message, one ⌥R away."],
  [
    "webhooks",
    "New-mail events delivered to your endpoint, signed and retried.",
  ],
  ["api log", "Every Gmail API call on the record — status, latency, units."],
  ["exports", "Any thread as Markdown, JSON, or plain text."],
];

function Spec() {
  return (
    <Wrap label="what it is" caption="the short version">
      <div className="grid grid-cols-3">
        {SPEC_CELLS.map(([label, body]) => (
          <div key={label} className="border-t border-l border-border p-5">
            <div className="mb-2 font-mono text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
              {label}
            </div>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {body}
            </p>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Plans() {
  return (
    <Wrap id="v6-plan" label="plan" caption="two plans">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-2 divide-x divide-border">
          {/* Free — self-host */}
          <div className="flex flex-col items-center px-8 py-10 text-center">
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

          {/* Hosted — $5, the recommended paid plan (emphasized) */}
          <div className="relative flex flex-col items-center bg-muted/30 px-8 py-10 text-center">
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
    q: "Why a waitlist?",
    a: "BetterBox is going through Google's API verification. Until it clears, sign-ins are limited to allow-listed test accounts. The waitlist is the queue — for those slots, and for launch.",
  },
  {
    q: "Does BetterBox store my mail?",
    a: "Messages are fetched live from the Gmail API when you open the app. Webhook and analytics data is metadata — counts, timings, statuses — not message content.",
  },
  {
    q: "When does it launch?",
    a: "When verification clears and the client is ready. Waitlist members get access first, in order.",
  },
];

function Faq() {
  return (
    <Wrap label="faq">
      <div className="grid grid-cols-2 gap-x-12 gap-y-7">
        {FAQ_ITEMS.map((it) => (
          <div key={it.q}>
            <h4 className="mb-2 text-base font-medium tracking-tight text-foreground">
              {it.q}
            </h4>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {it.a}
            </p>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Footer() {
  return (
    <footer className={cn(COL, "pb-10")}>
      <div className="flex items-center gap-5 border-t border-border pt-6">
        <Wordmark small />
        <span className="font-mono text-xs text-muted-foreground/60">
          in development · restricted to test accounts while Google verification
          is pending
        </span>
        <div className="ml-auto flex items-center gap-4 font-mono text-xs">
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
  return (
    <div className="h-svh w-full overflow-y-auto bg-background">
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
