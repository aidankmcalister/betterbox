import { useState, type CSSProperties, type ReactNode } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";

import { ThemeProvider } from "@/components/theme-provider";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        // viewport-fit=cover lets the app go edge-to-edge; the mobile chrome
        // below pads itself with env(safe-area-inset-*) so nothing hides under
        // the notch or home indicator.
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "BetterBox",
      },
      {
        name: "description",
        content:
          "BetterBox: a faster, denser client for your Google inboxes, built on the Gmail API.",
      },
      {
        name: "google-site-verification",
        content: "2jV8WEtpu3Px-xOy1LiouO4lMkq62VfrN2VWBYHPTjI",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
});

/** Friendly fallback for any otherwise-unhandled error, so the app never shows
 *  a raw 500 / JSON error dump (e.g. a misconfigured self-host instance). */
function RootError({ error }: { error: Error }) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-canvas px-6 py-8 text-ink">
      <div className="w-full max-w-[440px] rounded-[12px] border border-hairline bg-surface-1 px-7 py-7 text-center">
        <h1 className="text-[20px] font-semibold tracking-[-0.6px] text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-[13px] leading-[1.6] text-ink-subtle">
          The app hit an unexpected error. If you're self-hosting, check your{" "}
          <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[11px]">
            .env
          </code>{" "}
          and the server logs.
        </p>
        {error?.message && (
          <pre className="mt-4 overflow-x-auto rounded bg-canvas px-3 py-2 text-left font-mono text-[11px] leading-[1.6] text-ink-tertiary">
            {error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 h-10 w-full rounded-[8px] bg-primary text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Reload
        </button>
      </div>
    </main>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  /* Per-instance client so SSR renders never share a cache between users. */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="system" storageKey="theme">
            <TooltipProvider delay={400}>
              <SidebarProvider
                style={{ "--sidebar-width": "18rem" } as CSSProperties}
              >
                {children}
              </SidebarProvider>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <SpeedInsights />
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}
