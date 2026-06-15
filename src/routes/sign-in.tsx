import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { MailIcon } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import { fetchSession } from "@/lib/auth-session";
import { GITHUB_URL } from "@/components/github-mark";
import { cn } from "@/lib/utils";

/**
 * Branded sign-in entry point. This is where `IS_SELF_HOSTED=true` sends
 * visitors from `/` (and where the hosted deployment will land them too) —
 * a real page instead of dumping straight into Google's OAuth screen. Google
 * is the only identity provider: the app is built on the Gmail API, so a Google
 * account *is* the login.
 */
export const Route = createFileRoute("/sign-in")({
  // Already signed in? Skip the sign-in page and go to the app.
  beforeLoad: async () => {
    const session = await fetchSession();
    if (session) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Sign in · BetterBox" }] }),
  component: SignIn,
});

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = () => {
    setError(null);
    setLoading(true);
    // signIn() redirects the page to Google on success; only the error path
    // returns here, so re-enable the button if it rejects.
    signIn().catch((err) => {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setLoading(false);
    });
  };

  return (
    <main className="relative grid min-h-svh w-full place-items-center overflow-hidden bg-background px-6 text-foreground">
      {/* Soft radial glow behind the card — quiet, on-brand depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]"
      />

      <div className="relative w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-on-primary">
            <MailIcon className="size-4" />
          </span>
          <span className="font-mono text-sm font-semibold tracking-tight">
            BetterBox
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1">
            <span className="size-1.5 flex-none rounded-full bg-success motion-safe:animate-bb-pulse" />
            <span className="text-xs text-muted-foreground">In development</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in to BetterBox
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-pretty text-muted-foreground">
            Your Google inboxes, pull requests, and issues in one
            keyboard-driven tab.
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={loading}
            className={cn(
              "mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60",
            )}
          >
            <GoogleIcon className="size-[18px]" />
            {loading ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          {error && (
            <p className="mt-3 font-mono text-xs text-destructive">{error}</p>
          )}

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground/70">
            BetterBox requests the <code className="font-mono">gmail.modify</code>{" "}
            scope to read and organize your mail. It is never stored on our
            servers.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 font-mono text-xs text-muted-foreground/60">
          <a
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy
          </a>
          <span aria-hidden>·</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Self-host on GitHub
          </a>
        </div>
      </div>
    </main>
  );
}
