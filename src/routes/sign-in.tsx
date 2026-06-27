import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import { fetchGoogleConfigured } from "@/lib/auth-session";
import { GITHUB_URL } from "@/components/github-mark";

/**
 * Sign-in page — implements the "BetterBox Sign In (standalone)" design handoff:
 * a centered card with the BetterBox lockup, an "unverified app" warning, and a
 * Continue-with-Google button. Google is the only identity provider (the app is
 * built on the Gmail API, so a Google account is the login).
 */
export const Route = createFileRoute("/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — BetterBox" }] }),
  // Resolve Google config on the server so a fresh self-host instance shows
  // setup guidance instead of a Continue button that 500s mid-flow.
  loader: async () => ({ googleConfigured: await fetchGoogleConfigured() }),
  component: SignIn,
});

function GoogleG() {
  return (
    <span className="flex size-6 flex-none items-center justify-center rounded-[5px] bg-white">
      <svg viewBox="0 0 18 18" className="size-[15px]" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
    </span>
  );
}

function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { googleConfigured } = Route.useLoaderData();

  const onGoogle = () => {
    setError(null);
    setLoading(true);
    // signIn() redirects to Google on success; only the error path returns here.
    signIn().catch((err) => {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    });
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-canvas px-6 py-8 text-ink">
      <div className="w-full max-w-[440px] rounded-[12px] border border-hairline bg-surface-1 px-7 pt-7 pb-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_rgba(0,0,0,0.35)]">
        <span className="inline-flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-[30px] flex-none items-center justify-center rounded-[8px] bg-primary text-[18px] font-bold tracking-[-1px] text-on-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
          >
            B
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.6px] text-ink">
            BetterBox
          </span>
        </span>

        <h1 className="mt-4 text-[24px] leading-[1.1] font-semibold tracking-[-0.8px] text-ink">
          Sign in
        </h1>
        <p className="mt-2 text-[14.5px] leading-normal text-ink-subtle">
          {googleConfigured
            ? "Continue with your Google account."
            : "Finish setup to enable sign-in."}
        </p>

        {googleConfigured ? (
          <>
            <div
              role="note"
              className="mt-6 flex items-start gap-3 rounded-[8px] border border-[color-mix(in_srgb,var(--color-label-red)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-label-red)_6%,var(--color-surface-1))] px-4 py-3 text-left"
            >
              <span
                className="mt-px flex flex-none text-label-red"
                aria-hidden="true"
              >
                <TriangleAlertIcon className="size-[18px]" strokeWidth={2} />
              </span>
              <div className="flex min-w-0 flex-col gap-[9px]">
                <p className="text-[12.5px] leading-[1.4] font-semibold text-label-red">
                  You will see a Google security warning
                </p>
                <p className="text-[12px] leading-[1.6] text-[color-mix(in_srgb,var(--color-label-red)_82%,#ffffff)]">
                  BetterBox is a hobby project and Google's verification costs
                  ~$750/yr. I can't justify that right now, so you'll see an
                  "unverified app" warning. Click{" "}
                  <strong className="font-bold text-label-red">Advanced</strong>
                  , then{" "}
                  <strong className="font-bold text-label-red">
                    Proceed to BetterBox
                  </strong>{" "}
                  to continue.
                </p>
                <p className="text-[12px] leading-[1.6] text-[color-mix(in_srgb,var(--color-label-red)_82%,#ffffff)]">
                  Not comfortable? You can read the{" "}
                  <a
                    href="/privacy"
                    className="text-label-red underline decoration-1 underline-offset-2 hover:decoration-2"
                  >
                    privacy policy
                  </a>{" "}
                  or{" "}
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-label-red underline decoration-1 underline-offset-2 hover:decoration-2"
                  >
                    self-host
                  </a>{" "}
                  if you'd prefer.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onGoogle}
              disabled={loading}
              className="mt-5 flex h-12 w-full items-center justify-center gap-[11px] rounded-[8px] bg-primary text-[15px] font-medium tracking-[-0.1px] text-on-primary transition-colors hover:bg-primary-hover focus-visible:shadow-[0_0_0_2px_var(--color-surface-1),0_0_0_4px_color-mix(in_srgb,var(--color-ring)_55%,transparent)] focus-visible:outline-none active:bg-primary-focus disabled:opacity-70"
            >
              <GoogleG />
              {loading ? "Redirecting to Google…" : "Continue with Google"}
            </button>
          </>
        ) : (
          <div
            role="note"
            className="mt-6 flex flex-col gap-2 rounded-[8px] border border-hairline bg-canvas px-4 py-3.5 text-left"
          >
            <p className="text-[12.5px] leading-[1.4] font-semibold text-ink">
              Google sign-in isn't configured
            </p>
            <p className="text-[12px] leading-[1.6] text-ink-subtle">
              This instance has no Google OAuth credentials yet. Add them to
              your{" "}
              <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-[11px]">
                .env
              </code>{" "}
              and restart:
            </p>
            <pre className="overflow-x-auto rounded bg-surface-1 px-2.5 py-2 font-mono text-[11px] leading-[1.6] text-ink-subtle">
              GOOGLE_CLIENT_ID=...{"\n"}GOOGLE_CLIENT_SECRET=...
            </pre>
            <p className="text-[12px] leading-[1.6] text-ink-subtle">
              See the{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-1 underline-offset-2 hover:decoration-2"
              >
                setup guide
              </a>{" "}
              for the full steps (enable the Gmail API, add the{" "}
              <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-[11px]">
                gmail.modify
              </code>{" "}
              scope, set the redirect URI).
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[12px] leading-normal text-label-red">
            {error}
          </p>
        )}

        <p className="mt-3.5 text-center text-[12px] leading-normal text-ink-tertiary">
          By signing in you agree to the{" "}
          <a
            href="/privacy"
            className="text-ink-subtle hover:text-ink-muted hover:underline hover:underline-offset-2"
          >
            privacy policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
