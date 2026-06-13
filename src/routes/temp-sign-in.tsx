import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { signIn } from "@/lib/auth-client";

/**
 * Temporary sign-in entry point. The public landing page is waitlist-only;
 * allow-listed test accounts reach the OAuth flow by visiting /temp-sign-in,
 * which kicks off Google sign-in on mount. Kept off the marketing surface on
 * purpose while Google API verification is pending.
 */
export const Route = createFileRoute("/temp-sign-in")({
  head: () => ({ meta: [{ title: "Sign in — BetterBox" }] }),
  component: TempSignIn,
});

function TempSignIn() {
  // StrictMode double-invokes effects in dev; guard so we only start once.
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    signIn().catch((err) =>
      setError(err instanceof Error ? err.message : "Sign-in failed"),
    );
  }, []);

  return (
    <main className="grid min-h-svh w-full place-items-center bg-canvas p-6 text-ink">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-[10px] bg-primary text-on-primary">
          <span className="font-mono text-lg font-bold">B</span>
        </span>
        {error ? (
          <>
            <p className="font-mono text-[12.5px] text-label-red">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                started.current = false;
                started.current = true;
                signIn().catch((err) =>
                  setError(
                    err instanceof Error ? err.message : "Sign-in failed",
                  ),
                );
              }}
              className="font-mono text-[11.5px] text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
            >
              try again
            </button>
          </>
        ) : (
          <p className="font-mono text-[12px] text-ink-subtle">
            Redirecting to Google…
          </p>
        )}
      </div>
    </main>
  );
}
