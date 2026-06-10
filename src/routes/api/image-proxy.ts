import { auth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Stream remote email images through our origin (what Gmail's image proxy
 * does). Tracker blockers kill direct requests to sender CDNs — LinkedIn's
 * licdn.com is on the standard block lists — and proxying also keeps the
 * reader's IP and referer out of tracking pixels.
 */

/** Hosts the proxy refuses to fetch (loopback, link-local, RFC 1918). */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("[")
  );
}

export const Route = createFileRoute("/api/image-proxy")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response("Not signed in", { status: 401 });

        const raw = new URL(request.url).searchParams.get("url") ?? "";
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("Invalid url", { status: 400 });
        }
        if (
          (target.protocol !== "https:" && target.protocol !== "http:") ||
          isPrivateHost(target.hostname)
        ) {
          return new Response("Invalid url", { status: 400 });
        }

        let upstream: Response;
        try {
          upstream = await fetch(target, {
            // Many CDNs (fbcdn, licdn, …) reject server-side fetches that have
            // no browser User-Agent / Accept, so present as a browser.
            headers: {
              accept:
                "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
              "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              "accept-language": "en-US,en;q=0.9",
            },
            redirect: "follow",
          });
        } catch {
          return new Response("Upstream fetch failed", { status: 502 });
        }
        if (!upstream.ok || !upstream.body) {
          return new Response("Upstream error", { status: 502 });
        }

        const type = upstream.headers.get("content-type") ?? "";
        // Some CDNs mislabel images as octet-stream; allow those through too.
        if (!type.startsWith("image/") && type !== "application/octet-stream") {
          return new Response("Not an image", { status: 415 });
        }

        return new Response(upstream.body, {
          headers: {
            "content-type": type,
            "cache-control": "private, max-age=86400",
          },
        });
      },
    },
  },
});
